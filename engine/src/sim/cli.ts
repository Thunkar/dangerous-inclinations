#!/usr/bin/env node
/**
 * CLI entry for running batch simulations.
 *
 * Usage (from the engine package):
 *   yarn sim --games=200 --bots=4 --maxTurns=120 --output=./sim-out
 *
 * Args:
 *   --games=N      Number of games to run (required, default 100)
 *   --bots=N       Bot count per game (default 2)
 *   --maxTurns=N   Per-game turn cap (default 200)
 *   --baseSeed=N   Base seed; each game gets baseSeed+i (default: random)
 *   --label=STR    Label included in recordings/aggregate
 *   --output=PATH  Directory to write recordings/ + summary.json (optional)
 *   --quiet        Suppress per-game progress lines
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runBatch } from "./batch.ts";
import type { GameRecording } from "../recording/types.ts";

interface CliArgs {
  games: number;
  bots: number;
  maxTurns: number;
  baseSeed?: number;
  label?: string;
  output?: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    games: 100,
    bots: 2,
    maxTurns: 200,
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
      case "label":
        out.label = value;
        break;
      case "output":
        out.output = value;
        break;
      case "quiet":
        out.quiet = value !== "false";
        break;
      default:
        console.warn(`Unknown flag: --${key}`);
    }
  }

  return out;
}

function parseIntOrDie(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`--${name} must be a number, got ${raw}`);
    process.exit(2);
  }
  return n;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log(
    `Running ${args.games} games (${args.bots} bots each, max ${args.maxTurns} turns)...`
  );
  const start = Date.now();

  const batch = runBatch({
    games: args.games,
    botCount: args.bots,
    maxTurns: args.maxTurns,
    baseSeed: args.baseSeed,
    label: args.label,
    onProgress: args.quiet
      ? undefined
      : (done, total, last) => {
          const winner = last.recording.metadata.winnerId ?? "—";
          process.stdout.write(
            `  [${done}/${total}] turns=${last.recording.turns.length} winner=${winner} reason=${last.endReason}\n`
          );
        },
  });

  const elapsedMs = Date.now() - start;
  console.log(`Done in ${elapsedMs}ms.`);
  printSummary(batch.aggregate);

  if (args.output) {
    writeOutput(args.output, batch.recordings, batch);
    console.log(`Recordings + summary written to ${args.output}`);
  }
}

function printSummary(agg: ReturnType<typeof runBatch>["aggregate"]): void {
  console.log("\n=== Aggregate ===");
  console.log(`Games: ${agg.gameCount}`);
  console.log(`End reasons: ${JSON.stringify(agg.endReasons)}`);
  console.log(`Turn count: median=${agg.turnCount.median} p25=${agg.turnCount.p25} p75=${agg.turnCount.p75} max=${agg.turnCount.max}`);
  console.log(`Damage dealt: median=${agg.totalDamageDealt.median} max=${agg.totalDamageDealt.max}`);
  console.log(`Mission completions: median=${agg.missionCompletions.median}`);
  console.log(`Wins by player:`, agg.winsByPlayer);
}

function writeOutput(
  dir: string,
  recordings: GameRecording[],
  batch: ReturnType<typeof runBatch>
): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const recordingsDir = join(dir, "recordings");
  if (!existsSync(recordingsDir)) mkdirSync(recordingsDir);

  for (const rec of recordings) {
    const path = join(recordingsDir, `${rec.recordingId}.json`);
    writeFileSync(path, JSON.stringify(rec));
  }

  writeFileSync(
    join(dir, "summary.json"),
    JSON.stringify(
      {
        aggregate: batch.aggregate,
        perGame: batch.perGame,
      },
      null,
      2
    )
  );
}

main();
