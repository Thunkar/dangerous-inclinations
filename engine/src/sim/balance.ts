/**
 * Balance regression suite. Plays the rules as they stand against a fixed
 * matrix and prints one page, so a rule change can be checked for regressions
 * in one command. The matrix answers the designer's four questions:
 *
 *   1. Natural    — do the games themselves finish, and is a seat a seat?
 *   2. Baselines  — what is a hand worth before a mat is chosen for it? Seat 1
 *                   keeps Destroy / Deliver / Intercept with its own mat, and
 *                   those three numbers are the bar for every row below.
 *   3. Logical    — are the six presets balanced flown with the card their
 *                   role implies (interceptor+Intercept, hunter+Destroy,
 *                   hauler+Deliver)?
 *   4. Illogical  — are mats that fight their card actually bad?
 *   5. Off-book   — can a build no preset offers compete?
 *   6. Extreme    — are the sharpest hulls unfairly competitive?
 *
 * Every forced row is 3 players with the hull and/or the primary imposed on
 * seat 1 against normal opponents.
 *
 *   yarn balance                        # 100 games per row
 *   yarn balance --quick                # 40 games per row
 *   yarn balance --only=natural,baselines,logical
 *   yarn balance --only=logical:hunter_aggressive,offbook:missile_boat
 *   yarn balance --output=/tmp/balance  # writes balance.md and balance.json
 *   yarn balance --rules=missionsToWin=4  # the same matrix under a proposed rule
 *
 * `--only=` takes section names (natural, baselines, logical, illogical,
 * offbook, extreme), full row ids (`illogical:hauler_tanky+destroy`) or a bare
 * row name (`turtle`).
 *
 * `--rules=` is the experiment-only channel of `sim/ruleOverrides.ts`: the
 * whole matrix is played under it and the page stamps it under the title, so a
 * proposed rule can be read against the same rows as the standing ones. Two
 * pages are only comparable when they ran the same games, the same seeds and
 * the same overrides.
 *
 * **Every forced row reports `stuck`**: the share of its games in which seat 1
 * really flew the forced hull and really kept the forced card. Both are
 * dropped silently when the deal offers no hand that fits them, so a row whose
 * `stuck` is low is measuring something other than what it names.
 *
 * The card is guaranteed: a seat the shuffle did not offer one is dealt one
 * (`dealForcedPrimaries` in sim/runGame.ts), which is what makes a row about
 * the mat rather than about the deal — before that, at three seats only 45% of
 * hands were offered a Destroy and 47% an Intercept, and half of every such row
 * was a seat playing some other plan. So `stuck` now reads the hull, which is
 * dropped only when no hand the deal can make is one that mat could fly.
 *
 * Flags, failing (exit code 1 unless --no-fail):
 *   `outlier`    an off-book or extreme row wins outright at least
 *                OUTLIER_MARGIN more often than its bar
 *   `stall`      at least STALL_SHARE of its games reach the turn cap
 *   `slow`       a natural row finishes fewer than SLOW_FINISH of its games,
 *                or runs past SLOW_ROUNDS
 *   `unpunished` an illogical row is *not below* its bar — a mat that fights
 *                its card costs nothing, so the card is not choosing the mat
 *
 * Flags, informational:
 *   `weak`       a preset flying its own card is OUTLIER_MARGIN under its bar
 *   `dead`       an off-book build is OUTLIER_MARGIN under its bar
 *   `glass`      the hull dies 1.5+ times a game
 *   `bloody`     a natural row kills more than one ship per player per game
 *   `diluted`    `stuck` under STUCK_FLOOR: the row's other flags are
 *                suppressed, because the row is not the row it claims to be
 */
import { cpus } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ShipLoadout } from "../models/game.ts";
import { DEFAULT_POINTS_TO_WIN, type MissionType } from "../models/missions.ts";
import { BOT_LOADOUT_TEMPLATES, type BotArchetype } from "../ai/behaviors/loadout.ts";
import { runBatch, type BatchResult } from "./batch.ts";
import {
  applyRuleOverrides,
  describeRuleOverrides,
  parseRuleOverrides,
  type RuleOverrides,
} from "./ruleOverrides.ts";
import { handShapeOf, type PerGameStats, type PerPlayerStats } from "./stats.ts";

const OUTLIER_MARGIN = 0.12;
const STALL_SHARE = 0.2;
const SLOW_FINISH = 0.9;
const SLOW_ROUNDS = 50;
/** Below this share of games actually flying the row, the row is diluted. */
const STUCK_FLOOR = 0.9;
/** Used for any bar whose measuring row was not run. */
const FALLBACK_BAR = 0.26;

const hull = (forward: string, sides: string): ShipLoadout => ({
  forwardSlots: [forward] as ShipLoadout["forwardSlots"],
  sideSlots: sides.split(",") as ShipLoadout["sideSlots"],
});

const preset = (archetype: BotArchetype): ShipLoadout => BOT_LOADOUT_TEMPLATES[archetype];

type Section = "baselines" | "logical" | "illogical" | "offbook" | "extreme";
/** Which bar a row is read against: seat 1's own hand, or one primary's. */
type BarName = "any" | "destroy" | "deliver" | "intercept";

const PRIMARY_OF: Record<Exclude<BarName, "any">, MissionType> = {
  destroy: "destroy_ship",
  deliver: "deliver_cargo",
  intercept: "intercept_transmission",
};

/** "Destroy", "Deliver", "Intercept" — the labels the stats module prints. */
const cardLabel = (type: MissionType) => handShapeOf([{ type }]).split(" + ")[0];

interface RowSpec {
  /** `section:name`, and what `--only=` takes. */
  id: string;
  section: Section;
  /** The mat, for the table. */
  label: string;
  /** Omitted on a baseline row: the bot picks its own mat. */
  loadout?: ShipLoadout;
  /** Omitted on an extreme row: the bot keeps whatever it is dealt. */
  primary?: MissionType;
  bar: BarName;
}

const baselineRows: RowSpec[] = (["destroy", "deliver", "intercept"] as const).map((bar) => ({
  id: `baselines:${bar}`,
  section: "baselines",
  label: "own mat",
  primary: PRIMARY_OF[bar],
  bar: "any",
}));

/** Each preset flown with the card its role implies. */
const logicalRows: RowSpec[] = (
  [
    ["interceptor-tanky", "intercept"],
    ["interceptor-aggressive", "intercept"],
    ["hunter-tanky", "destroy"],
    ["hunter-aggressive", "destroy"],
    ["hauler-tanky", "deliver"],
    ["hauler-aggressive", "deliver"],
  ] as Array<[BotArchetype, Exclude<BarName, "any">]>
).map(([archetype, bar]) => ({
  id: `logical:${archetype.replace("-", "_")}`,
  section: "logical",
  label: `${archetype} (preset)`,
  loadout: preset(archetype),
  primary: PRIMARY_OF[bar],
  bar,
}));

/**
 * Mats that fight their card. A compressor cannot scan, so a hauler with an
 * Intercept is not a row the engine would ever accept — the mismatches are the
 * ones a player could actually submit.
 */
const illogicalRows: RowSpec[] = (
  [
    ["interceptor-tanky", "deliver"],
    ["interceptor-tanky", "destroy"],
    ["hunter-aggressive", "deliver"],
    ["hunter-tanky", "deliver"],
    ["hauler-tanky", "destroy"],
    ["hauler-aggressive", "destroy"],
  ] as Array<[BotArchetype, Exclude<BarName, "any">]>
).map(([archetype, bar]) => ({
  id: `illogical:${archetype.replace("-", "_")}+${bar}`,
  section: "illogical",
  label: `${archetype} (preset)`,
  loadout: preset(archetype),
  primary: PRIMARY_OF[bar],
  bar,
}));

/** Builds no preset offers, each flown with the card it is built for. */
const offbookRows: RowSpec[] = (
  [
    [
      "sensor_missiles2",
      "sensor bow, missile hunter",
      hull("sensor_array", "missiles,missiles,radiator,shields"),
      "destroy",
    ],
    [
      "sensor_missiles3",
      "sensor bow, missiles×3",
      hull("sensor_array", "missiles,missiles,missiles,radiator"),
      "destroy",
    ],
    [
      "missile_boat",
      "missile boat",
      hull("missiles", "missiles,missiles,radiator,shields"),
      "destroy",
    ],
    [
      "rack_hunter",
      "rack hunter",
      hull("railgun", "ballistic_rack,ballistic_rack,shields,radiator"),
      "destroy",
    ],
    [
      "rail_lasers2",
      "railgun + lasers×2 + radiators×2",
      hull("railgun", "laser,laser,radiator,radiator"),
      "destroy",
    ],
    [
      "armed_legs",
      "armed legs",
      hull("fuel_compressor", "missiles,missiles,radiator,shields"),
      "destroy",
    ],
    [
      "hauler_pdc",
      "hauler with point defence",
      hull("fuel_compressor", "ballistic_rack,ballistic_rack,shields,radiator"),
      "deliver",
    ],
    [
      "interceptor_hunting",
      "aggressive interceptor, hunting",
      hull("sensor_array", "shields,laser,laser,radiator"),
      "destroy",
    ],
  ] as Array<[string, string, ShipLoadout, Exclude<BarName, "any">]>
).map(([name, label, loadout, bar]) => ({
  id: `offbook:${name}`,
  section: "offbook",
  label,
  loadout,
  primary: PRIMARY_OF[bar],
  bar,
}));

/** The sharpest shapes a player might try, each dealt a random legal hand. */
const extremeRows: RowSpec[] = (
  [
    [
      "shields2_lasers2",
      "shields×2 + lasers×2",
      hull("sensor_array", "shields,shields,laser,laser"),
    ],
    ["scalpel3", "lasers×3 + shields", hull("sensor_array", "laser,laser,laser,shields")],
    ["scalpel4", "lasers×4", hull("sensor_array", "laser,laser,laser,laser")],
    [
      "turtle",
      "shields×2 + radiators×2",
      hull("sensor_array", "shields,shields,radiator,radiator"),
    ],
    ["bunker", "shields×4", hull("sensor_array", "shields,shields,shields,shields")],
    ["laserboat", "railgun + lasers×4", hull("railgun", "laser,laser,laser,laser")],
    [
      "rail_la2_rad2",
      "railgun + lasers×2 + radiators×2",
      hull("railgun", "laser,laser,radiator,radiator"),
    ],
    [
      "rail_miss2",
      "railgun + missiles×2 + radiator + shields",
      hull("railgun", "missiles,missiles,radiator,shields"),
    ],
    [
      "missiles3",
      "missiles×3 + radiator + shields",
      hull("missiles", "missiles,missiles,radiator,shields"),
    ],
    ["missiles5", "missiles×5", hull("missiles", "missiles,missiles,missiles,missiles")],
    [
      "glass",
      "railgun + missiles + lasers×2 + radiator",
      hull("railgun", "missiles,laser,laser,radiator"),
    ],
    [
      "pdc",
      "railgun + racks×2 + shields + radiator",
      hull("railgun", "ballistic_rack,ballistic_rack,shields,radiator"),
    ],
    [
      "rack4",
      "railgun + racks×4",
      hull("railgun", "ballistic_rack,ballistic_rack,ballistic_rack,ballistic_rack"),
    ],
    [
      "legs_lasers",
      "compressor + lasers×2 + shields + radiator",
      hull("fuel_compressor", "laser,laser,shields,radiator"),
    ],
    [
      "legs_turtle",
      "compressor + shields×2 + radiators×2",
      hull("fuel_compressor", "shields,shields,radiator,radiator"),
    ],
    [
      "legs_guns",
      "compressor + missiles×2 + radiator + shields",
      hull("fuel_compressor", "missiles,missiles,radiator,shields"),
    ],
    [
      "legs_rack",
      "compressor + racks×2 + shields + radiator",
      hull("fuel_compressor", "ballistic_rack,ballistic_rack,shields,radiator"),
    ],
    ["hotrod", "railgun + radiators×4", hull("railgun", "radiator,radiator,radiator,radiator")],
    [
      "rail_sh2_rad",
      "railgun + missiles + shields×2 + radiator",
      hull("railgun", "missiles,shields,shields,radiator"),
    ],
  ] as Array<[string, string, ShipLoadout]>
).map(([name, label, loadout]) => ({
  id: `extreme:${name}`,
  section: "extreme",
  label,
  loadout,
  bar: "any" as const,
}));

const ROWS: RowSpec[] = [
  ...baselineRows,
  ...logicalRows,
  ...illogicalRows,
  ...offbookRows,
  ...extremeRows,
];

const SECTION_TITLE: Record<Section, string> = {
  baselines: "Baselines by primary (seat 1 keeps the card, picks its own mat)",
  logical: "Logical — each preset flown with the card its role implies",
  illogical: "Illogical — mats that fight their card (a row at or above its bar is unpunished)",
  offbook: "Off-book — builds no preset offers, each with the card it is built for",
  extreme: "Extreme hulls, random legal hand",
};

interface Args {
  games: number;
  baseSeed: number;
  workers: number;
  only?: Set<string>;
  output?: string;
  noFail: boolean;
  /** Experiment-only rule overrides, stamped on the page (see sim/ruleOverrides.ts). */
  rules?: RuleOverrides;
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
      case "rules":
        args.rules = parseRuleOverrides(value);
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
const delta = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(Math.round(100 * x))}pp`;
const mean = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;

interface NaturalRow {
  kind: "natural";
  id: string;
  bots: number;
  finish: number;
  rounds: number;
  killsPerGame: number;
  seatWins: number[];
  /** Seat 1's outright wins, the `any` bar for the forced rows. */
  seat1Real: number;
  flags: string[];
}

interface ForcedRow {
  kind: "forced";
  id: string;
  section: Section;
  label: string;
  /** The card forced on the seat, or "own hand" when none was. */
  card: string;
  bar: number;
  barName: BarName;
  /** Games in which the seat really flew this hull and kept this card. */
  stuck: number;
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
  /** Flags a diluted row would have raised, kept out of the gate. */
  suppressed: string[];
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
    id: `natural:${bots}p`,
    bots,
    finish,
    rounds: a.rounds.median,
    killsPerGame: a.destructions.mean,
    seatWins,
    seat1Real,
    flags,
  };
}

/** A forced hull is dropped when no dealt hand can fly it, so check the tiles. */
function flewHull(p: PerPlayerStats, loadout: ShipLoadout): boolean {
  // Side slots are a set, not an order: the engine keeps whatever order the
  // submission used, and a row is the same mat either way.
  const sorted = (xs: Array<string | null>) => [...xs].sort().join(",");
  const tiles = p.loadout.split(",");
  return (
    tiles[0] === loadout.forwardSlots[0] && sorted(tiles.slice(1)) === sorted(loadout.sideSlots)
  );
}

/** "Destroy + Board/Survey" — the primary is everything before the separator. */
function keptPrimary(p: PerPlayerStats, primary: MissionType): boolean {
  return p.handShape.split(" + ")[0] === cardLabel(primary);
}

function forcedRow(spec: RowSpec, batch: BatchResult, bar: number): ForcedRow {
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
  const stuck = b1.length
    ? b1.filter(
        (p) =>
          (spec.loadout === undefined || flewHull(p, spec.loadout)) &&
          (spec.primary === undefined || keptPrimary(p, spec.primary))
      ).length / b1.length
    : 0;

  const flags: string[] = [];
  if (spec.section === "offbook" || spec.section === "extreme") {
    if (real >= bar + OUTLIER_MARGIN) flags.push("outlier");
    if (spec.section === "offbook" && real <= bar - OUTLIER_MARGIN) flags.push("dead");
  }
  // The reverse test: an illogical mat is supposed to cost its pilot something.
  if (spec.section === "illogical" && real >= bar) flags.push("unpunished");
  if (spec.section === "logical" && real <= bar - OUTLIER_MARGIN) flags.push("weak");
  if (1 - finish >= STALL_SHARE) flags.push("stall");
  if (deaths >= 1.5) flags.push("glass");

  // A row that did not fly what it says is not evidence for or against
  // anything: print its numbers, keep its verdict out of the gate.
  const diluted = stuck < STUCK_FLOOR;
  return {
    kind: "forced",
    id: spec.id,
    section: spec.section,
    label: spec.label,
    card: spec.primary ? cardLabel(spec.primary) : "own hand",
    bar,
    barName: spec.bar,
    stuck,
    wins,
    real,
    othersEach: mean(others),
    kills: mean(b1.map((x) => x.kills)),
    deaths,
    dealt: mean(b1.map((x) => x.damageDealt)),
    taken: mean(b1.map((x) => x.damageTaken)),
    finish,
    rounds: a.rounds.median,
    flags: diluted ? ["diluted"] : flags,
    suppressed: diluted ? flags : [],
  };
}

const FAILING = new Set(["outlier", "stall", "slow", "unpunished"]);

function renderForced(rows: ForcedRow[]): string[] {
  const lines: string[] = [];
  lines.push(
    "| row | mat | card | outright | bar | vs bar | stuck | wins | others (each) | kills/g | deaths/g | dealt/g | taken/g | decided before cap | rounds | flags |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const f of rows) {
    const note = f.suppressed.length
      ? `diluted (${f.suppressed.join(", ")} suppressed)`
      : f.flags.join(", ");
    lines.push(
      `| \`${f.id}\` | ${f.label} | ${f.card} | ${pct(f.real)} | ${pct(f.bar)} (${f.barName}) | ${delta(f.real - f.bar)} | ${pct(f.stuck)} | ${pct(f.wins)} | ${pct(f.othersEach)} | ${f.kills} | ${f.deaths} | ${f.dealt} | ${f.taken} | ${pct(f.finish)} | ${f.rounds} | ${note} |`
    );
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // In this process so the page's header stamps the live values; the workers
  // that play the games get the same overrides with every job.
  applyRuleOverrides(args.rules);
  const want = (id: string) => {
    if (!args.only) return true;
    const [section, name] = id.split(":");
    return args.only.has(id) || args.only.has(section) || args.only.has(name);
  };
  const common = {
    games: args.games,
    maxTurns: 400,
    baseSeed: args.baseSeed,
    workers: args.workers,
    tiebreak: true,
    rules: args.rules,
  };
  const started = Date.now();
  const log = (s: string) =>
    console.error(`[balance ${Math.round((Date.now() - started) / 1000)}s] ${s}`);

  const natural: NaturalRow[] = [];
  for (const bots of [3, 2, 4]) {
    if (!want(`natural:${bots}p`)) continue;
    log(`natural play, ${bots} players`);
    natural.push(naturalRow(bots, await runBatch({ ...common, botCount: bots })));
  }

  const bars: Record<BarName, number> = {
    any: natural.find((n) => n.bots === 3)?.seat1Real ?? FALLBACK_BAR,
    destroy: FALLBACK_BAR,
    deliver: FALLBACK_BAR,
    intercept: FALLBACK_BAR,
  };
  const measured: Record<BarName, boolean> = {
    any: natural.some((n) => n.bots === 3),
    destroy: false,
    deliver: false,
    intercept: false,
  };

  const rowsBySection: Record<Section, ForcedRow[]> = {
    baselines: [],
    logical: [],
    illogical: [],
    offbook: [],
    extreme: [],
  };
  for (const spec of ROWS) {
    if (!want(spec.id)) continue;
    log(`${spec.id}: ${spec.label}${spec.primary ? ` + ${cardLabel(spec.primary)}` : ""}`);
    const batch = await runBatch({
      ...common,
      botCount: 3,
      ...(spec.loadout ? { seatLoadouts: { "bot-1": spec.loadout } } : {}),
      ...(spec.primary ? { seatHands: { "bot-1": spec.primary } } : {}),
    });
    const row = forcedRow(spec, batch, bars[spec.bar]);
    rowsBySection[spec.section].push(row);
    // A baseline row *is* its bar: every row under it reads against this.
    if (spec.section === "baselines") {
      const name = spec.id.split(":")[1] as Exclude<BarName, "any">;
      bars[name] = row.real;
      measured[name] = true;
    }
  }

  const lines: string[] = [];
  lines.push(`# Balance suite — ${new Date().toISOString().slice(0, 10)}`);
  // A run under `--rules=` is not the standing matrix: say so where the reader
  // looks first, or two pages get diffed as if they were the same suite.
  if (describeRuleOverrides(args.rules)) {
    lines.push("");
    lines.push(`Experiment overrides: ${describeRuleOverrides(args.rules)}`);
  }
  lines.push("");
  lines.push(
    `${args.games} games per row, seeds ${args.baseSeed}+, turn cap 400, 3 players in every forced row, points to win ${args.rules?.missionsToWin ?? DEFAULT_POINTS_TO_WIN}.`
  );
  lines.push("");
  lines.push(
    `Bars (seat 1's outright wins): any ${pct(bars.any)}, Destroy ${pct(bars.destroy)}, Deliver ${pct(bars.deliver)}, Intercept ${pct(bars.intercept)}.`
  );
  const unmeasured = (Object.keys(bars) as BarName[]).filter((b) => !measured[b]);
  if (unmeasured.length) {
    lines.push("");
    lines.push(
      `Not measured in this run: ${unmeasured.join(", ")} — the fallback constant ${pct(FALLBACK_BAR)} stands in, so every comparison against ${unmeasured.length > 1 ? "those bars is" : "that bar is"} indicative only.`
    );
  }
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
  for (const section of ["baselines", "logical", "illogical", "offbook", "extreme"] as Section[]) {
    const rows = rowsBySection[section];
    if (!rows.length) continue;
    lines.push("");
    lines.push(`## ${SECTION_TITLE[section]}`);
    lines.push("");
    lines.push(...renderForced(rows));
  }

  const allForced = ([] as ForcedRow[]).concat(...Object.values(rowsBySection));
  const flagged = [
    ...natural.map((n) => ({ what: `${n.bots} players`, flags: n.flags })),
    ...allForced.map((f) => ({ what: f.id, flags: f.flags })),
  ];
  const listing = (keep: (flag: string) => boolean) =>
    flagged
      .map(({ what, flags }) => ({ what, flags: flags.filter(keep) }))
      .filter((x) => x.flags.length)
      .map((x) => `${x.what}: ${x.flags.join(", ")}`);
  const failing = listing((f) => FAILING.has(f));
  const info = listing((f) => !FAILING.has(f));
  lines.push("");
  if (failing.length || info.length) {
    const parts: string[] = [];
    if (failing.length) parts.push(`failing — ${failing.join("; ")}`);
    if (info.length) parts.push(`informational — ${info.join("; ")}`);
    lines.push(`**Flags:** ${parts.join(". ")}.`);
  } else {
    lines.push("**No flags: nothing is an outlier, a stall, a slow row or unpunished.**");
  }

  const md = lines.join("\n");
  console.log(md);
  if (args.output) {
    mkdirSync(args.output, { recursive: true });
    writeFileSync(join(args.output, "balance.md"), md + "\n");
    writeFileSync(
      join(args.output, "balance.json"),
      JSON.stringify(
        {
          natural,
          baselines: rowsBySection.baselines,
          forced: [
            ...rowsBySection.logical,
            ...rowsBySection.illogical,
            ...rowsBySection.offbook,
            ...rowsBySection.extreme,
          ],
        },
        null,
        2
      )
    );
  }
  if (failing.length && !args.noFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
