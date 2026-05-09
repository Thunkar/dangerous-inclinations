/**
 * Parallel batch runner for strict-mode games.
 *
 * Each game is independent (deterministic from its seed), so we dispatch
 * them across a pool of worker_threads. The main thread maintains a
 * pending-seed queue and feeds idle workers. On a failure, dispatch stops
 * but in-flight games complete and are reported.
 *
 * Run from the engine package:
 *   yarn strict-sim --games=100 --bots=4 --maxTurns=200 --baseSeed=1 --workers=8
 *
 * The single-game logic lives in strictGame.ts; this file orchestrates.
 */

import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import {
  runStrictGame,
  type StrictGameConfig,
  type StrictGameOutcome,
} from "./strictGame.ts";
import { freshSeed } from "../utils/rng.ts";

/**
 * Resolve the path to the worker entry. Prefers the compiled JS in dist/
 * when available — it skips per-worker TS parsing/strip-types and runs
 * noticeably faster because each worker is its own V8 isolate that would
 * otherwise re-parse the entire engine source tree on first import. Falls
 * back to the .ts source if dist isn't built (dev fast-path).
 */
function resolveWorkerEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // When running from src/sim/, jump up to engine root and into dist/sim.
  const engineRoot = resolvePath(here, "..", "..");
  const distWorker = resolvePath(engineRoot, "dist", "sim", "strictWorker.js");
  if (existsSync(distWorker)) return distWorker;
  // Fallback: same directory as this file.
  return resolvePath(here, "strictWorker.ts");
}

export type {
  StrictGameOutcome,
  StrictFailure,
  StrictGameConfig,
} from "./strictGame.ts";
export { formatFailure, runStrictGame } from "./strictGame.ts";

export interface StrictBatchResult {
  total: number;
  completed: number;
  failed: number;
  /** First failing game (lowest seed). undefined if all completed. */
  firstFailure?: StrictGameOutcome;
}

export interface StrictBatchConfig {
  games: number;
  baseSeed?: number;
  botCount?: number;
  maxTurns?: number;
  /** Stop the whole batch on the first failure. Default true. */
  haltOnFailure?: boolean;
  /** Worker count. Defaults to logical CPUs; pass 1 for in-process sequential. */
  workers?: number;
  onProgress?: (completed: number, total: number, last: StrictGameOutcome) => void;
}

const DEFAULT_BOT_COUNT = 2;
const DEFAULT_MAX_TURNS = 200;

/**
 * Run a batch of strict-mode games in parallel. Halts on first failure
 * (configurable). Returns aggregate counts plus the first failure if any.
 */
export async function runStrictBatch(
  config: StrictBatchConfig
): Promise<StrictBatchResult> {
  const haltOnFailure = config.haltOnFailure ?? true;
  const total = config.games;
  const botCount = config.botCount ?? DEFAULT_BOT_COUNT;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  const requestedWorkers =
    config.workers ?? Math.max(1, availableParallelism());
  const workerCount = Math.min(requestedWorkers, total);

  // Single-worker mode runs in-process. Avoids worker spawn cost when
  // the user explicitly asks for sequential, and keeps tests synchronous.
  if (workerCount <= 1) {
    return runSequential(config, total, botCount, maxTurns, haltOnFailure);
  }

  return runParallel(config, total, botCount, maxTurns, haltOnFailure, workerCount);
}

function runSequential(
  config: StrictBatchConfig,
  total: number,
  botCount: number,
  maxTurns: number,
  haltOnFailure: boolean
): Promise<StrictBatchResult> {
  let completed = 0;
  let failed = 0;
  let firstFailure: StrictGameOutcome | undefined;

  for (let i = 0; i < total; i++) {
    const seed =
      config.baseSeed !== undefined ? config.baseSeed + i : freshSeed();
    const outcome = runStrictGame({ seed, botCount, maxTurns });

    if (outcome.status === "completed") completed++;
    else {
      failed++;
      if (!firstFailure) firstFailure = outcome;
    }
    config.onProgress?.(i + 1, total, outcome);
    if (outcome.status === "invalid" && haltOnFailure) break;
  }

  return Promise.resolve({ total, completed, failed, firstFailure });
}

function runParallel(
  config: StrictBatchConfig,
  total: number,
  botCount: number,
  maxTurns: number,
  haltOnFailure: boolean,
  workerCount: number
): Promise<StrictBatchResult> {
  return new Promise<StrictBatchResult>((resolve, reject) => {
    // Stable seed list so first-failure-wins always picks the lowest seed
    // regardless of completion order.
    const seeds: number[] = [];
    for (let i = 0; i < total; i++) {
      seeds.push(
        config.baseSeed !== undefined ? config.baseSeed + i : freshSeed()
      );
    }

    let nextSeedIdx = 0;
    let inFlight = 0;
    let completed = 0;
    let failed = 0;
    let firstFailure: StrictGameOutcome | undefined;
    let stopped = false;
    let progressEmitted = 0;
    // Outcomes stored by seed-index so we can emit progress in seed order.
    const outcomesByIndex = new Array<StrictGameOutcome | undefined>(total);

    const workerPath = resolveWorkerEntry();
    const workers: Array<{
      w: Worker;
      currentIdx: number | null;
    }> = [];

    const cleanup = () => {
      for (const slot of workers) {
        try {
          slot.w.postMessage({ type: "shutdown" });
        } catch {
          // worker already terminated
        }
        slot.w.terminate().catch(() => {});
      }
    };

    const finish = () => {
      cleanup();
      resolve({ total, completed, failed, firstFailure });
    };

    /**
     * Emit `onProgress` callbacks in seed-index order. Even though workers
     * complete out-of-order, users want a deterministic stream.
     */
    const flushProgress = () => {
      while (
        progressEmitted < total &&
        outcomesByIndex[progressEmitted] !== undefined
      ) {
        const outcome = outcomesByIndex[progressEmitted]!;
        progressEmitted++;
        config.onProgress?.(progressEmitted, total, outcome);
      }
    };

    const dispatchTo = (slot: { w: Worker; currentIdx: number | null }) => {
      if (stopped || nextSeedIdx >= total) return;
      const idx = nextSeedIdx++;
      slot.currentIdx = idx;
      inFlight++;
      const cfg: StrictGameConfig = {
        seed: seeds[idx],
        botCount,
        maxTurns,
      };
      slot.w.postMessage(cfg);
    };

    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(workerPath, {
        execArgv: process.execArgv, // inherit --experimental-strip-types etc.
      });
      const slot = { w, currentIdx: null as number | null };
      workers.push(slot);

      w.on("message", (outcome: StrictGameOutcome) => {
        const idx = slot.currentIdx;
        slot.currentIdx = null;
        inFlight--;
        if (idx !== null) outcomesByIndex[idx] = outcome;

        if (outcome.status === "completed") {
          completed++;
        } else {
          failed++;
          if (haltOnFailure) stopped = true;
          // Track the lowest-seed-index failure as the canonical "first failure"
          if (
            !firstFailure ||
            (idx !== null && idx < seeds.indexOf(firstFailure.seed))
          ) {
            firstFailure = outcome;
          }
        }

        flushProgress();

        if (stopped && inFlight === 0) {
          finish();
          return;
        }
        if (!stopped && nextSeedIdx >= total && inFlight === 0) {
          finish();
          return;
        }
        if (!stopped) dispatchTo(slot);
      });

      w.on("error", (err) => {
        cleanup();
        reject(err);
      });

      w.on("exit", (code) => {
        if (code !== 0 && code !== 1) {
          // Non-clean exit; only surface if we haven't already resolved.
          // Worker close after shutdown emits exit code 1 in some Node versions.
        }
      });
    }

    // Prime each worker.
    for (const slot of workers) dispatchTo(slot);
  });
}
