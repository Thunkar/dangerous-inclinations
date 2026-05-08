/**
 * Batch sim driver. Runs many simulations with varying seeds and aggregates
 * stats. Synchronous for now; can be parallelized via worker_threads later
 * without changing the public surface.
 */

import { runSimulation, type SimConfig, type SimResult } from "./runSimulation.ts";
import {
  computePerGameStats,
  aggregateStats,
  type PerGameStats,
  type AggregateStats,
} from "./stats.ts";
import type { GameRecording } from "../recording/types.ts";

export interface BatchConfig {
  /** Number of games to run. */
  games: number;
  /** Base seed; each game uses baseSeed + index. If omitted, fresh seeds. */
  baseSeed?: number;
  /** Player count for each game. */
  botCount?: number;
  /** Per-game turn cap. */
  maxTurns?: number;
  /** Optional label propagated to recording metadata. */
  label?: string;
  /** Called after each game completes; useful for progress reporting. */
  onProgress?: (completed: number, total: number, last: SimResult) => void;
}

export interface BatchResult {
  /** All recordings produced by the batch. */
  recordings: GameRecording[];
  /** Per-game stats, parallel to `recordings`. */
  perGame: PerGameStats[];
  /** Aggregate distribution across the whole batch. */
  aggregate: AggregateStats;
}

/**
 * Run a batch of simulations and return everything. Memory-bound by
 * `games × snapshot-size`; for >10k games consider streaming to disk.
 */
export function runBatch(config: BatchConfig): BatchResult {
  const recordings: GameRecording[] = [];
  const perGame: PerGameStats[] = [];

  for (let i = 0; i < config.games; i++) {
    const seed = config.baseSeed !== undefined ? config.baseSeed + i : undefined;
    const simConfig: SimConfig = {
      seed,
      botCount: config.botCount,
      maxTurns: config.maxTurns,
      label: config.label,
    };

    const result = runSimulation(simConfig);
    recordings.push(result.recording);
    perGame.push(computePerGameStats(result.recording));

    if (config.onProgress) {
      config.onProgress(i + 1, config.games, result);
    }
  }

  return {
    recordings,
    perGame,
    aggregate: aggregateStats(perGame),
  };
}
