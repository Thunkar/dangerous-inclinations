#!/usr/bin/env node
/**
 * Batch simulation CLI.
 *
 *   yarn sim --games=100 --bots=3 --maxTurns=200 --baseSeed=1 --workers=8 --output=./sim-out
 *
 * Flags:
 *   --games=N     games to run (default 50)
 *   --bots=N      bots per game (default 3)
 *   --maxTurns=N  cap on player-turns per game (default 240)
 *   --baseSeed=N  first seed; game i uses baseSeed+i (default: random)
 *   --workers=N   worker threads (default: CPU count - 1)
 *   --record      keep recordings and write them to --output/recordings/
 *   --output=DIR  write summary.json (+ recordings) here
 *   --label=STR   label stored in recordings
 *   --rules=k=v,k=v  rule overrides (see models/rules.ts), e.g. --rules=shieldRefill=on_dock,dockHullRepair=1
 *   --tiebreak    at the turn cap, most completed missions (then hull) wins
 *   --weapons=laser.damage=3,laser.sideRestricted=false  experiment-only weapon stat overrides
 *   --quiet       no per-game progress
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";
import { runBatch } from "./batch.ts";
import { formatFailure } from "./runGame.ts";
import type { AggregateStats } from "./stats.ts";
import { parseRuleOverrides } from "../models/rules.ts";
import type { RuleSet } from "../models/rules.ts";
import { parseWeaponOverrides, type WeaponOverrides } from "./weaponOverrides.ts";

interface Args {
  games: number;
  bots: number;
  maxTurns: number;
  baseSeed?: number;
  workers: number;
  record: boolean;
  output?: string;
  label?: string;
  quiet: boolean;
  rules?: Partial<RuleSet>;
  tiebreak: boolean;
  weapons?: WeaponOverrides;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    games: 50,
    bots: 3,
    maxTurns: 240,
    workers: Math.max(1, cpus().length - 1),
    record: false,
    quiet: false,
    tiebreak: false,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const value = eq === -1 ? "true" : raw.slice(eq + 1);
    const num = () => {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        console.error(`--${key} must be a number`);
        process.exit(2);
      }
      return n;
    };
    switch (key) {
      case "games":
        args.games = num();
        break;
      case "bots":
        args.bots = num();
        break;
      case "maxTurns":
        args.maxTurns = num();
        break;
      case "baseSeed":
        args.baseSeed = num();
        break;
      case "workers":
        args.workers = num();
        break;
      case "record":
        args.record = value !== "false";
        break;
      case "output":
        args.output = value;
        break;
      case "label":
        args.label = value;
        break;
      case "quiet":
        args.quiet = value !== "false";
        break;
      case "rules":
        args.rules = parseRuleOverrides(value);
        break;
      case "tiebreak":
        args.tiebreak = value !== "false";
        break;
      case "weapons":
        args.weapons = parseWeaponOverrides(value);
        break;
      default:
        console.warn(`Unknown flag --${key}`);
    }
  }
  return args;
}

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((100 * n) / total)}%`;
}

function printSummary(a: AggregateStats): void {
  const g = a.gameCount;
  console.log(`\n=== ${g} games ===`);
  console.log(
    `End reasons: ${Object.entries(a.endReasons)
      .map(([k, v]) => `${k} ${pct(v, g)}`)
      .join(", ")}`
  );
  console.log(
    `Rounds to finish: median ${a.rounds.median}, p25 ${a.rounds.p25}, p75 ${a.rounds.p75}, max ${a.rounds.max}`
  );
  console.log(`Destructions/game: median ${a.destructions.median}, mean ${a.destructions.mean}`);
  console.log(`Hull damage/game: median ${a.totalDamage.median}, mean ${a.totalDamage.mean}`);
  console.log(
    `Mission completions/game: median ${a.missionCompletions.median}, mean ${a.missionCompletions.mean}`
  );
  console.log(`Completions by type: ${JSON.stringify(a.completionsByType)}`);
  console.log(`Winners' mission types: ${JSON.stringify(a.winnerMissionTypes)}`);
  console.log(
    `First dock (turn): median ${a.firstDockRound.median} (${a.firstDockRound.count} players docked)`
  );
  console.log(
    `First jump (turn): median ${a.firstJumpRound.median} (${a.firstJumpRound.count} players jumped)`
  );
  console.log(
    `Scans/game: mean ${a.scansPerGame.mean}; hidden tiles per player at end: mean ${a.hiddenTilesAtEnd.mean} of 5`
  );
  console.log(`Wins by seat: ${JSON.stringify(a.winsByPlayer)}`);
  const b = a.behaviour;
  const p = (x: number) => `${Math.round(x * 100)}%`;
  console.log(
    `Turns: coast ${p(b.coastShare)} (idle ${p(b.idleShare)}), burn ${p(b.burnShare)}, jump ${p(b.jumpShare)}, scoop ${p(b.scoopShare)}, firing ${p(b.firingShare)}, lost ${p(b.lostTurnShare)}; energy in use ${b.meanEnergyInUse.toFixed(1)}/10`
  );
  console.log(
    `Shields: mean ${b.meanShieldCubes} cubes, full(4) ${p(b.shieldsFullShare)} of turns (of which ${p(b.shieldsFullActingShare)} also moved/scooped/fired), powered ${p(b.shieldsPoweredShare)}; damage soaked ${p(b.absorbedShare)}`,
    `Weapons (seats carrying · shots/game · hits/game · hull dmg/game): ${Object.entries(a.weapons)
      .map(
        ([t, w]) =>
          `${t} ${p(w.seatShare)} · ${w.shotsPerGame} · ${w.hitsPerGame} · ${w.hullDamagePerGame}`
      )
      .join(" | ")}`
  );
  console.log(
    `Heat at check: mean ${b.meanHeatAtCheck}; turns taking heat damage ${p(b.heatDamageShare)}`
  );
  const loadouts = Object.entries(a.loadoutWins)
    .sort((x, y) => y[1].games - x[1].games)
    .slice(0, 8);
  console.log("Loadouts (games, win rate):");
  for (const [l, r] of loadouts) console.log(`  ${l}: ${r.games} games, ${pct(r.wins, r.games)}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Running ${args.games} games, ${args.bots} bots, max ${args.maxTurns} player-turns, ${args.workers} worker(s)${args.rules ? `, rules ${JSON.stringify(args.rules)}` : ""}${args.tiebreak ? ", tiebreak" : ""}${args.weapons ? `, weapons ${JSON.stringify(args.weapons)}` : ""}...`
  );
  const start = Date.now();

  const batch = await runBatch({
    games: args.games,
    botCount: args.bots,
    maxTurns: args.maxTurns,
    baseSeed: args.baseSeed,
    workers: args.workers,
    record: args.record,
    label: args.label,
    rules: args.rules,
    tiebreak: args.tiebreak,
    weapons: args.weapons,
    onProgress: args.quiet
      ? undefined
      : (done, total, last) => {
          process.stdout.write(
            `  [${done}/${total}] seed=${last.seed} rounds=${last.rounds} winner=${last.winnerId ?? "—"} ${last.endReason}\n`
          );
        },
  });

  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
  printSummary(batch.aggregate);

  if (batch.failures.length > 0) {
    console.log(`\n!!! ${batch.failures.length} game(s) stopped on an invalid bot turn:`);
    for (const f of batch.failures.slice(0, 5)) console.log(formatFailure(f.failure));
  }

  if (args.output) {
    mkdirSync(args.output, { recursive: true });
    writeFileSync(
      join(args.output, "summary.json"),
      JSON.stringify({ aggregate: batch.aggregate, perGame: batch.perGame }, null, 2)
    );
    if (args.record) {
      const dir = join(args.output, "recordings");
      mkdirSync(dir, { recursive: true });
      for (const rec of batch.recordings)
        writeFileSync(join(dir, `${rec.recordingId}.json`), JSON.stringify(rec));
    }
    console.log(`Written to ${args.output}`);
  }

  process.exit(batch.failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
