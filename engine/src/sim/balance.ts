/**
 * Balance regression suite. Plays the rules as they stand against a fixed
 * matrix — natural games at 2, 3 and 4 players, then the four presets and a
 * set of extreme hulls forced on seat 1 against normal opponents — and prints
 * one table with flags, so a rule change can be checked for regressions in
 * one command:
 *
 *   yarn balance                      # 100 games per row (~30 min on 6 cores)
 *   yarn balance --quick              # 40 games per row
 *   yarn balance --only=natural,turtle,shields2_lasers2
 *   yarn balance --output=/tmp/balance   # writes balance.md and balance.json
 *
 * Flags: `outlier` — a forced hull wins outright at least OUTLIER_MARGIN
 * points more often than seat 1 does with its own hand; `stall` — at least
 * STALL_SHARE of its games reach the turn cap; `slow` — a natural row finishes
 * fewer than SLOW_FINISH of its games or runs past SLOW_ROUNDS; `bloody` — more
 * than one kill per player per game; `glass` — the hull dies 1.5+ times a game
 * (informational). Exit code 1 on any outlier, stall or slow flag unless
 * --no-fail is given.
 */
import { cpus } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ShipLoadout } from "../models/game.ts";
import { runBatch, type BatchResult } from "./batch.ts";
import type { PerGameStats } from "./stats.ts";

const OUTLIER_MARGIN = 0.12;
const STALL_SHARE = 0.2;
const SLOW_FINISH = 0.9;
const SLOW_ROUNDS = 50;

const hull = (forward: string, sides: string): ShipLoadout => ({
  forwardSlots: [forward] as ShipLoadout["forwardSlots"],
  sideSlots: sides.split(",") as ShipLoadout["sideSlots"],
});

/** Presets first, then the shapes a sneaky player might try. */
const HULLS: Array<{ id: string; label: string; loadout: ShipLoadout }> = [
  {
    id: "interceptor_tanky",
    label: "Interceptor · tanky (preset)",
    loadout: hull("sensor_array", "shields,shields,radiator,laser"),
  },
  {
    id: "interceptor_aggressive",
    label: "Interceptor · aggressive (preset)",
    loadout: hull("sensor_array", "shields,laser,laser,radiator"),
  },
  {
    id: "hunter_tanky",
    label: "Hunter · tanky (preset, bots never pick it)",
    loadout: hull("railgun", "missiles,radiator,shields,shields"),
  },
  {
    id: "hunter_aggressive",
    label: "Hunter · aggressive (preset)",
    loadout: hull("railgun", "missiles,radiator,ballistic_rack,shields"),
  },
  {
    id: "hauler_tanky",
    label: "Hauler · tanky (preset)",
    loadout: hull("fuel_compressor", "shields,shields,radiator,laser"),
  },
  {
    id: "hauler_aggressive",
    label: "Hauler · aggressive (preset, bots never pick it)",
    loadout: hull("fuel_compressor", "missiles,radiator,shields,laser"),
  },
  {
    id: "shields2_lasers2",
    label: "shields×2 + lasers×2",
    loadout: hull("sensor_array", "shields,shields,laser,laser"),
  },
  {
    id: "scalpel3",
    label: "lasers×3 + shields",
    loadout: hull("sensor_array", "laser,laser,laser,shields"),
  },
  { id: "scalpel4", label: "lasers×4", loadout: hull("sensor_array", "laser,laser,laser,laser") },
  {
    id: "turtle",
    label: "shields×2 + radiators×2",
    loadout: hull("sensor_array", "shields,shields,radiator,radiator"),
  },
  {
    id: "bunker",
    label: "shields×4",
    loadout: hull("sensor_array", "shields,shields,shields,shields"),
  },
  {
    id: "laserboat",
    label: "railgun + lasers×4",
    loadout: hull("railgun", "laser,laser,laser,laser"),
  },
  {
    id: "rail_la2_rad2",
    label: "railgun + lasers×2 + radiators×2",
    loadout: hull("railgun", "laser,laser,radiator,radiator"),
  },
  {
    id: "rail_miss2",
    label: "railgun + missiles×2 + radiator + shields",
    loadout: hull("railgun", "missiles,missiles,radiator,shields"),
  },
  {
    id: "missiles3",
    label: "missiles×3 + radiator + shields",
    loadout: hull("missiles", "missiles,missiles,radiator,shields"),
  },
  {
    id: "missiles5",
    label: "missiles×5",
    loadout: hull("missiles", "missiles,missiles,missiles,missiles"),
  },
  {
    id: "glass",
    label: "railgun + missiles + lasers×2 + radiator",
    loadout: hull("railgun", "missiles,laser,laser,radiator"),
  },
  {
    id: "pdc",
    label: "railgun + racks×2 + shields + radiator",
    loadout: hull("railgun", "ballistic_rack,ballistic_rack,shields,radiator"),
  },
  {
    id: "rack4",
    label: "railgun + racks×4",
    loadout: hull("railgun", "ballistic_rack,ballistic_rack,ballistic_rack,ballistic_rack"),
  },
  {
    id: "legs_lasers",
    label: "compressor + lasers×2 + shields + radiator",
    loadout: hull("fuel_compressor", "laser,laser,shields,radiator"),
  },
  {
    id: "legs_turtle",
    label: "compressor + shields×2 + radiators×2",
    loadout: hull("fuel_compressor", "shields,shields,radiator,radiator"),
  },
  {
    id: "legs_guns",
    label: "compressor + missiles×2 + radiator + shields",
    loadout: hull("fuel_compressor", "missiles,missiles,radiator,shields"),
  },
  {
    id: "legs_rack",
    label: "compressor + racks×2 + shields + radiator",
    loadout: hull("fuel_compressor", "ballistic_rack,ballistic_rack,shields,radiator"),
  },
  {
    id: "hotrod",
    label: "railgun + radiators×4",
    loadout: hull("railgun", "radiator,radiator,radiator,radiator"),
  },
  {
    id: "rail_sh2_rad",
    label: "railgun + missiles + shields×2 + radiator",
    loadout: hull("railgun", "missiles,shields,shields,radiator"),
  },
];

interface Args {
  games: number;
  baseSeed: number;
  workers: number;
  only?: Set<string>;
  output?: string;
  noFail: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    games: 100,
    baseSeed: 5000,
    workers: Math.max(1, cpus().length - 1),
    noFail: false,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const value = eq === -1 ? "true" : raw.slice(eq + 1);
    switch (key) {
      case "games":
        args.games = Number(value);
        break;
      case "quick":
        args.games = 40;
        break;
      case "baseSeed":
        args.baseSeed = Number(value);
        break;
      case "workers":
        args.workers = Number(value);
        break;
      case "only":
        args.only = new Set(value.split(",").map((s) => s.trim()));
        break;
      case "output":
        args.output = value;
        break;
      case "no-fail":
        args.noFail = true;
        break;
      default:
        console.warn(`Unknown flag --${key}`);
    }
  }
  return args;
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
const mean = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;

interface NaturalRow {
  kind: "natural";
  bots: number;
  finish: number;
  rounds: number;
  killsPerGame: number;
  seatWins: number[];
  /** Seat 1's outright wins, the baseline for the forced rows. */
  seat1Real: number;
  flags: string[];
}

interface ForcedRow {
  kind: "forced";
  id: string;
  label: string;
  wins: number;
  real: number;
  othersEach: number;
  kills: number;
  deaths: number;
  dealt: number;
  taken: number;
  finish: number;
  rounds: number;
  flags: string[];
}

function seat1(games: PerGameStats[]) {
  return games.map((g) => g.perPlayer["bot-1"]).filter(Boolean);
}

function naturalRow(bots: number, batch: BatchResult): NaturalRow {
  const a = batch.aggregate;
  const g = a.gameCount;
  const finish = (a.endReasons.victory ?? 0) / g;
  const seatWins = Array.from(
    { length: bots },
    (_, i) => (a.winsByPlayer[`bot-${i + 1}`] ?? 0) / g
  );
  const seat1Real =
    batch.perGame.filter((pg) => pg.winnerId === "bot-1" && pg.endReason === "victory").length / g;
  const flags: string[] = [];
  if (finish < SLOW_FINISH || a.rounds.median > SLOW_ROUNDS) flags.push("slow");
  if (a.destructions.mean / bots > 1) flags.push("bloody");
  return {
    kind: "natural",
    bots,
    finish,
    rounds: a.rounds.median,
    killsPerGame: a.destructions.mean,
    seatWins,
    seat1Real,
    flags,
  };
}

function forcedRow(id: string, label: string, batch: BatchResult, baselineReal: number): ForcedRow {
  const a = batch.aggregate;
  const g = a.gameCount;
  const b1 = seat1(batch.perGame);
  const wins = (a.winsByPlayer["bot-1"] ?? 0) / g;
  const real =
    batch.perGame.filter((pg) => pg.winnerId === "bot-1" && pg.endReason === "victory").length / g;
  const others = Object.entries(a.winsByPlayer)
    .filter(([k]) => k !== "bot-1")
    .map(([, v]) => v / g);
  const finish = (a.endReasons.victory ?? 0) / g;
  const deaths = mean(b1.map((x) => x.deaths));
  const flags: string[] = [];
  if (real >= baselineReal + OUTLIER_MARGIN) flags.push("outlier");
  if (1 - finish >= STALL_SHARE) flags.push("stall");
  if (deaths >= 1.5) flags.push("glass");
  return {
    kind: "forced",
    id,
    label,
    wins,
    real,
    othersEach: mean(others),
    kills: mean(b1.map((x) => x.kills)),
    deaths,
    dealt: mean(b1.map((x) => x.damageDealt)),
    taken: mean(b1.map((x) => x.damageTaken)),
    finish,
    rounds: a.rounds.median,
    flags,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const want = (id: string) => !args.only || args.only.has(id);
  const common = {
    games: args.games,
    maxTurns: 400,
    baseSeed: args.baseSeed,
    workers: args.workers,
    tiebreak: true,
  };
  const started = Date.now();
  const log = (s: string) =>
    console.error(`[balance ${Math.round((Date.now() - started) / 1000)}s] ${s}`);

  const natural: NaturalRow[] = [];
  if (want("natural")) {
    for (const bots of [3, 2, 4]) {
      log(`natural play, ${bots} players`);
      natural.push(naturalRow(bots, await runBatch({ ...common, botCount: bots })));
    }
  }
  const baseline = natural.find((n) => n.bots === 3)?.seat1Real ?? 0.26;

  const forced: ForcedRow[] = [];
  for (const h of HULLS) {
    if (!want(h.id)) continue;
    log(`forced hull: ${h.label}`);
    const batch = await runBatch({ ...common, botCount: 3, seatLoadouts: { "bot-1": h.loadout } });
    forced.push(forcedRow(h.id, h.label, batch, baseline));
  }

  const lines: string[] = [];
  lines.push(`# Balance suite — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `${args.games} games per row, seeds ${args.baseSeed}+, turn cap 400, rules as in RULES.md.`
  );
  if (natural.length) {
    lines.push("");
    lines.push("## Natural play (bots choose hands and hulls)");
    lines.push("");
    lines.push(
      "| players | decided before cap | rounds (median) | kills / game | wins by seat | flags |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const n of natural)
      lines.push(
        `| ${n.bots} | ${pct(n.finish)} | ${n.rounds} | ${n.killsPerGame} | ${n.seatWins.map(pct).join(" / ")} | ${n.flags.join(", ")} |`
      );
  }
  if (forced.length) {
    lines.push("");
    lines.push(
      `## Hulls forced on seat 1 against normal opponents (3 players; seat 1 wins outright ${pct(baseline)} with its own hand)`
    );
    lines.push("");
    lines.push(
      "| hull | wins | outright | others (each) | kills/g | deaths/g | dealt/g | taken/g | decided before cap | rounds | flags |"
    );
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const f of forced)
      lines.push(
        `| ${f.label} | ${pct(f.wins)} | ${pct(f.real)} | ${pct(f.othersEach)} | ${f.kills} | ${f.deaths} | ${f.dealt} | ${f.taken} | ${pct(f.finish)} | ${f.rounds} | ${f.flags.join(", ")} |`
      );
  }
  const failing = [
    ...natural.filter((n) => n.flags.includes("slow")).map((n) => `${n.bots} players: slow`),
    ...forced
      .filter((f) => f.flags.some((x) => x === "outlier" || x === "stall"))
      .map((f) => `${f.label}: ${f.flags.join(", ")}`),
  ];
  lines.push("");
  lines.push(
    failing.length ? `**Flags:** ${failing.join("; ")}.` : "**No outliers, stalls or slow rows.**"
  );
  const md = lines.join("\n");
  console.log(md);
  if (args.output) {
    mkdirSync(args.output, { recursive: true });
    writeFileSync(join(args.output, "balance.md"), md + "\n");
    writeFileSync(join(args.output, "balance.json"), JSON.stringify({ natural, forced }, null, 2));
  }
  if (failing.length && !args.noFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
