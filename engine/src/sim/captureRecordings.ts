#!/usr/bin/env node
/**
 * Run a small batch of bot-vs-bot games and write each recording out as a
 * JSON file for offline analysis. Usage:
 *
 *   node --experimental-strip-types --no-warnings src/sim/captureRecordings.ts \
 *     --games=10 --bots=4 --maxTurns=500 --baseSeed=1 --out=/tmp/sim-recs
 *
 * Each game writes one file: `<out>/sim-<seed>.json`. The recordings are
 * the same shape `runSimulation` returns; the analyzer at
 * {@link ./analyzeRecordings.ts} consumes them.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSimulation } from "./runSimulation.ts";

interface Args {
  games: number;
  bots: number;
  maxTurns: number;
  baseSeed: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    games: 10,
    bots: 4,
    maxTurns: 500,
    baseSeed: 1,
    out: "/tmp/sim-recs",
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, v] = arg.slice(2).split("=");
    if (k === "games") out.games = Number(v);
    else if (k === "bots") out.bots = Number(v);
    else if (k === "maxTurns") out.maxTurns = Number(v);
    else if (k === "baseSeed") out.baseSeed = Number(v);
    else if (k === "out") out.out = v;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  for (let i = 0; i < args.games; i++) {
    const seed = args.baseSeed + i;
    const result = runSimulation({
      seed,
      botCount: args.bots,
      maxTurns: args.maxTurns,
      label: `capture-${seed}`,
    });
    const path = join(args.out, `sim-${seed}.json`);
    writeFileSync(path, JSON.stringify(result.recording));
    process.stdout.write(
      `seed=${seed} turns=${result.recording.turns.length} ` +
        `end=${result.endReason} winner=${result.recording.metadata.winnerId ?? "-"} -> ${path}\n`,
    );
  }
}

main();
