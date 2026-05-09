#!/usr/bin/env node
/**
 * Strict-mode batch CLI. See {@link runStrictBatch} for semantics.
 *
 * Usage:
 *   yarn strict-sim --games=100 --bots=4 --maxTurns=200 --baseSeed=1 --workers=8
 *
 * Args:
 *   --games=N       Game count (default 100)
 *   --bots=N        Bot count per game (default 2)
 *   --maxTurns=N    Per-game turn cap (default 200)
 *   --baseSeed=N    Base seed; each game gets baseSeed+i (default: random)
 *   --workers=N     Worker pool size (default: logical CPU count). Pass 1 for sequential.
 *   --no-halt       Don't stop on first failure (run all games)
 *   --quiet         Suppress per-game lines
 *   --output=PATH   Write failure dump JSON here (default: stdout only)
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  runStrictBatch,
  formatFailure,
  type StrictGameOutcome,
} from "./strictBatch.ts";

interface CliArgs {
  games: number;
  bots: number;
  maxTurns: number;
  baseSeed?: number;
  workers?: number;
  haltOnFailure: boolean;
  quiet: boolean;
  output?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    games: 100,
    bots: 2,
    maxTurns: 200,
    haltOnFailure: true,
    quiet: false,
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? "true";
    switch (key) {
      case "games":
        out.games = parseIntOrDie(key, value);
        break;
      case "bots":
        out.bots = parseIntOrDie(key, value);
        break;
      case "maxTurns":
        out.maxTurns = parseIntOrDie(key, value);
        break;
      case "baseSeed":
        out.baseSeed = parseIntOrDie(key, value);
        break;
      case "workers":
        out.workers = parseIntOrDie(key, value);
        break;
      case "no-halt":
        out.haltOnFailure = value === "false";
        if (value === "true") out.haltOnFailure = false;
        break;
      case "quiet":
        out.quiet = value !== "false";
        break;
      case "output":
        out.output = value;
        break;
      default:
        process.stderr.write(`Unknown flag: --${key}\n`);
    }
  }
  return out;
}

function parseIntOrDie(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    process.stderr.write(`--${name} must be a number, got ${raw}\n`);
    process.exit(2);
  }
  return n;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  process.stdout.write(
    `Strict sim: ${args.games} games, ${args.bots} bots, max ${args.maxTurns} turns, workers=${args.workers ?? "auto"}, halt=${args.haltOnFailure}\n`
  );
  const start = Date.now();
  const failures: StrictGameOutcome[] = [];
  // Cumulative stats so the heartbeat (and final summary) can show what's
  // actually happening — not just rate. Important for diagnosing whether
  // games are ending naturally or hitting maxTurns.
  let totalTurns = 0;
  let timeoutCount = 0; // games that reached maxTurns without a winner
  let victoryCount = 0; // games that ended (winner set)
  let totalMissionCompletions = 0;
  let bestMaxPlayerCompletions = 0;
  const completionsByType = {
    destroy_ship: 0,
    deliver_cargo: 0,
    intercept_transmission: 0,
  };
  // Heartbeat: emit progress periodically even with --quiet so long batches
  // are observable. Tuned so we get ~50 lines for any batch size.
  const heartbeatEvery = Math.max(1, Math.floor(args.games / 50));
  let lastHeartbeat = 0;

  const result = await runStrictBatch({
    games: args.games,
    botCount: args.bots,
    maxTurns: args.maxTurns,
    baseSeed: args.baseSeed,
    workers: args.workers,
    haltOnFailure: args.haltOnFailure,
    onProgress: (done, total, last) => {
      if (last.status === "invalid") failures.push(last);
      else {
        totalTurns += last.turnsPlayed;
        totalMissionCompletions += last.totalMissionCompletions ?? 0;
        if (
          (last.maxPlayerCompletions ?? 0) > bestMaxPlayerCompletions
        ) {
          bestMaxPlayerCompletions = last.maxPlayerCompletions ?? 0;
        }
        if (last.completionsByType) {
          completionsByType.destroy_ship += last.completionsByType.destroy_ship;
          completionsByType.deliver_cargo += last.completionsByType.deliver_cargo;
          completionsByType.intercept_transmission +=
            last.completionsByType.intercept_transmission;
        }
        if (last.winnerId) victoryCount++;
        else if (last.turnsPlayed >= args.maxTurns) timeoutCount++;
      }

      if (!args.quiet) {
        const tag = last.status === "completed" ? "OK " : "BAD";
        const winner = last.winnerId ?? "—";
        process.stdout.write(
          `  [${done}/${total}] ${tag} seed=0x${last.seed.toString(16)} turns=${last.turnsPlayed} winner=${winner}\n`
        );
        return;
      }
      // Quiet mode: still emit a heartbeat at fixed intervals.
      if (
        done - lastHeartbeat >= heartbeatEvery ||
        done === total ||
        last.status === "invalid"
      ) {
        lastHeartbeat = done;
        const elapsed = Date.now() - start;
        const rate = done / (elapsed / 1000);
        const turnsPerSec = totalTurns / (elapsed / 1000);
        const avgTurns = done > 0 ? totalTurns / done : 0;
        const eta = done < total ? Math.round((total - done) / rate) : 0;
        const failedSoFar = failures.length;
        const avgMissions = done > 0 ? totalMissionCompletions / done : 0;
        process.stdout.write(
          `  ${done}/${total} | ${rate.toFixed(1)} games/s | ${Math.round(turnsPerSec)} turns/s | avg ${avgTurns.toFixed(0)} turns | wins=${victoryCount} timeouts=${timeoutCount}${failedSoFar ? ` failed=${failedSoFar}` : ""} | avg missions/game=${avgMissions.toFixed(1)} best=${bestMaxPlayerCompletions} | ETA ${eta}s\n`
        );
      }
    },
  });

  const elapsedMs = Date.now() - start;
  process.stdout.write(
    `\nDone in ${elapsedMs}ms. completed=${result.completed} failed=${result.failed} of ${result.total}\n`
  );
  process.stdout.write(
    `Wins=${victoryCount} timeouts=${timeoutCount}  ` +
      `mission completions: destroy=${completionsByType.destroy_ship} cargo=${completionsByType.deliver_cargo} intercept=${completionsByType.intercept_transmission}  ` +
      `total=${totalMissionCompletions}\n`
  );

  if (result.firstFailure) {
    process.stdout.write("\n");
    process.stdout.write(formatFailure(result.firstFailure));
    process.stdout.write("\n");
  }

  if (args.output) {
    if (!existsSync(dirname(args.output))) {
      mkdirSync(dirname(args.output), { recursive: true });
    }
    writeFileSync(
      args.output,
      JSON.stringify({ summary: result, failures }, null, 2)
    );
    process.stdout.write(`\nFull report written to ${args.output}\n`);
  }

  // Exit non-zero if anything failed, so CI / loops can branch on it.
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`strict-sim crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
