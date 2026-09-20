/**
 * The standing benchmark: one markdown page describing how the rules as they
 * stand actually play, at every seat count worth playing.
 *
 *   yarn bench                          # 120 games per seat count
 *   yarn bench --quick                  # 40 games per seat count
 *   yarn bench --players=3,4            # only these seat counts
 *   yarn bench --minutes=1              # table time at this pace per turn
 *   yarn bench --output=docs/bench-2026-09-18.md
 *   yarn bench --rules=missionsToWin=4   # a page played under a proposed rule
 *   yarn bench --bot=aggressiveness=0.8,targetPreference=weakest  # a page played by bots told to think differently
 *
 * It exists to be diffed. Every run stamps the rules it was played under at
 * the top, so two pages side by side say what changed and what it did — which
 * is the only way to tell a rule that helped from a rule that merely moved the
 * numbers around. Keep the games and the seeds the same between runs and the
 * comparison is honest; change them and it is not.
 *
 * It is a description, not a gate: nothing here fails a build. `yarn balance`
 * is the regression suite with flags and an exit code.
 */
import { cpus } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  BLACKHOLE_RINGS,
  PLANET_RINGS,
  STATION_RING,
} from "../models/gravityWells.ts";
import {
  DEFAULT_POINTS_TO_WIN,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
  MISSION_POINTS,
  CARGO_HOLD_CRATES,
  type MissionType,
} from "../models/missions.ts";
import {
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHIELD_HEAT_PER_POINT,
  STARTING_HIT_POINTS,
} from "../models/game.ts";
import { SHIELD_ENERGY_PER_POINT, SUBSYSTEM_CONFIGS } from "../models/subsystems.ts";

/** What one radiator adds, read from the tile so the stamp cannot drift. */
const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
import { runBatch, type BatchResult } from "./batch.ts";
import {
  describeRuleOverrides,
  parseRuleOverrides,
  type RuleOverrides,
} from "./ruleOverrides.ts";
import {
  applyBotOverrides,
  describeBotOverrides,
  parseBotOverrides,
  type BotOverrides,
} from "./botOverrides.ts";

const DEFAULT_GAMES = 120;
const QUICK_GAMES = 40;
const DEFAULT_PLAYERS = [3, 4, 5, 6];
const BASE_SEED = 20000;
/**
 * High enough that a game ends because someone won, not because the simulator
 * gave up: an unfinished game would flatter every length in the table.
 */
const MAX_TURNS_PER_PLAYER = 150;
/** Minutes a human turn takes, for the table-time column. */
const DEFAULT_MINUTES_PER_TURN = 1;

/** Primaries first, then the one-point cards, as the tables read them. */
const TYPES: MissionType[] = [
  "deliver_cargo",
  "destroy_ship",
  "intercept_transmission",
  "survey",
  "board",
  "garbage_disposal",
];
const TYPE_LABEL: Record<MissionType, string> = {
  deliver_cargo: "Deliver",
  destroy_ship: "Destroy",
  intercept_transmission: "Intercept",
  survey: "Survey",
  board: "Board",
  garbage_disposal: "Garbage",
};

interface Args {
  games: number;
  players: number[];
  minutesPerTurn: number;
  workers: number;
  output?: string;
  /** Experiment-only rule overrides, stamped on the page (see sim/ruleOverrides.ts). */
  rules?: RuleOverrides;
  /** Experiment-only bot parameter overrides, stamped on the page (see sim/botOverrides.ts). */
  bot?: BotOverrides;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    games: DEFAULT_GAMES,
    players: DEFAULT_PLAYERS,
    minutesPerTurn: DEFAULT_MINUTES_PER_TURN,
    workers: Math.max(1, cpus().length - 1),
  };
  for (const raw of argv) {
    if (raw === "--quick") {
      args.games = QUICK_GAMES;
      continue;
    }
    // Split on the first "=" only: values carry their own, as in
    // --rules=missionsToWin=4.
    const flag = raw.replace(/^--/, "");
    const eq = flag.indexOf("=");
    if (eq === -1) continue;
    const key = flag.slice(0, eq);
    const value = flag.slice(eq + 1);
    if (key === "games") args.games = Number(value);
    else if (key === "workers") args.workers = Number(value);
    else if (key === "minutes") args.minutesPerTurn = Number(value);
    else if (key === "output") args.output = value;
    else if (key === "rules") args.rules = parseRuleOverrides(value);
    else if (key === "bot") args.bot = parseBotOverrides(value);
    else if (key === "players") {
      args.players = value
        .split(",")
        .map((n) => Number(n))
        .filter((n) => n >= MIN_PLAYERS && n <= MAX_PLAYERS);
    }
  }
  return args;
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Player-turns at `minutes` each, as hours and minutes. */
function tableTime(turns: number, minutes: number): string {
  const total = Math.round(turns * minutes);
  const h = Math.floor(total / 60);
  return h === 0 ? `${total}m` : `${h}h${String(total % 60).padStart(2, "0")}`;
}

interface SeatRow {
  players: number;
  games: number;
  decided: number;
  roundsMedian: number;
  roundsP75: number;
  turns: number;
  kills: number;
  completions: number;
  seatSpread: string;
  burn: number;
  scoop: number;
  firing: number;
  lost: number;
  notes: string;
}

function seatRow(players: number, batch: BatchResult): SeatRow {
  const a = batch.aggregate;
  const decided = (a.endReasons.victory ?? 0) / a.gameCount;
  const wins = Array.from({ length: players }, (_, i) => (a.winsByPlayer[`bot-${i + 1}`] ?? 0));
  const best = Math.max(...wins) / a.gameCount;
  const worst = Math.min(...wins) / a.gameCount;

  // Notes, in the order a reader cares about them: did it end, was it a
  // bloodbath, was any seat handed the game by its position.
  const notes: string[] = [];
  if (decided < 0.9) notes.push(`${pct(1 - decided)} unfinished`);
  if (a.destructions.mean / players >= 1) notes.push("a kill per seat per game");
  if (best - worst >= 0.15) notes.push(`seat spread ${pct(best - worst)}`);

  return {
    players,
    games: a.gameCount,
    decided,
    roundsMedian: a.rounds.median,
    roundsP75: a.rounds.p75,
    turns: a.rounds.median * players,
    kills: round1(a.destructions.mean),
    completions: round1(a.missionCompletions.mean),
    seatSpread: wins.map((w) => pct(w / a.gameCount)).join(" / "),
    burn: a.behaviour.burnShare,
    scoop: a.behaviour.scoopShare,
    firing: a.behaviour.firingShare,
    lost: a.behaviour.lostTurnShare,
    notes: notes.join("; ") || "—",
  };
}

/** Hulls the bots chose for themselves, pooled across seat counts. */
function loadoutRows(batches: BatchResult[]) {
  const pooled: Record<string, { games: number; wins: number }> = {};
  for (const b of batches) {
    for (const [hull, { games, wins }] of Object.entries(b.aggregate.loadoutWins)) {
      pooled[hull] ??= { games: 0, wins: 0 };
      pooled[hull].games += games;
      pooled[hull].wins += wins;
    }
  }
  const seats = Object.values(pooled).reduce((s, h) => s + h.games, 0);
  return Object.entries(pooled)
    .map(([hull, { games, wins }]) => ({
      hull,
      seats: games,
      share: seats === 0 ? 0 : games / seats,
      winRate: games === 0 ? 0 : wins / games,
    }))
    .sort((a, b) => b.seats - a.seats);
}

/**
 * What the deal offers, what gets kept, and what those cards are worth.
 *
 * The pick rate is the honest read on a card: a card nobody keeps is a card
 * that does not exist, whatever it would score. Completions are per hundred
 * kept, so a rare card and a common one can be compared.
 */
function missionRows(batches: BatchResult[]) {
  const offered: Record<string, number> = {};
  const kept: Record<string, number> = {};
  const completed: Record<string, number> = {};
  const wonWith: Record<string, number> = {};
  for (const b of batches) {
    for (const t of TYPES) {
      offered[t] = (offered[t] ?? 0) + (b.aggregate.offeredByType[t] ?? 0);
      kept[t] = (kept[t] ?? 0) + (b.aggregate.keptByType[t] ?? 0);
      completed[t] = (completed[t] ?? 0) + (b.aggregate.completionsByType[t] ?? 0);
      wonWith[t] = (wonWith[t] ?? 0) + (b.aggregate.winnerMissionTypes[t] ?? 0);
    }
  }
  const wonTotal = TYPES.reduce((s, t) => s + (wonWith[t] ?? 0), 0);
  return TYPES.map((t) => ({
    type: t,
    offered: offered[t] ?? 0,
    kept: kept[t] ?? 0,
    pickRate: offered[t] ? (kept[t] ?? 0) / offered[t] : 0,
    completedPerHundredKept: kept[t] ? (100 * (completed[t] ?? 0)) / kept[t] : 0,
    shareOfWinningCards: wonTotal ? (wonWith[t] ?? 0) / wonTotal : 0,
  }));
}

/**
 * What shape of hand seats kept, and how it did.
 *
 * The question a three-card hand asks is which plan you came with: two
 * primaries, or one and a pair of secondary cards. If every seat keeps the same
 * shape the table has one plan and the others are untested — that is what this
 * is here to show.
 */
function handShapeRows(batches: BatchResult[]) {
  const pooled: Record<string, { seats: number; wins: number; points: number }> = {};
  for (const b of batches) {
    for (const game of b.perGame) {
      for (const p of Object.values(game.perPlayer)) {
        const row = (pooled[p.handShape] ??= { seats: 0, wins: 0, points: 0 });
        row.seats++;
        row.points += p.completedMissions;
        if (game.winnerId === p.playerId) row.wins++;
      }
    }
  }
  const seats = Object.values(pooled).reduce((n, r) => n + r.seats, 0);
  return Object.entries(pooled)
    .map(([shape, r]) => ({
      shape,
      seats: r.seats,
      share: seats === 0 ? 0 : r.seats / seats,
      winRate: r.seats === 0 ? 0 : r.wins / r.seats,
      pointsPerGame: r.seats === 0 ? 0 : r.points / r.seats,
    }))
    .sort((a, b) => b.seats - a.seats);
}

/** What this run's games were created playing to. */
function pointsToWin(args: Args): number {
  return args.rules?.missionsToWin ?? DEFAULT_POINTS_TO_WIN;
}

function render(args: Args, rows: SeatRow[], batches: BatchResult[]): string {
  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  out.push(`# Benchmark — ${today}`);
  out.push("");
  out.push(
    `${args.games} games per seat count, seeds ${BASE_SEED}+, bots choosing their own hands and hulls.`
  );
  out.push("");
  out.push("**Rules in force**");
  out.push("");
  out.push("| rule | value |");
  out.push("|---|---|");
  // The value the run was played to: `--rules=missionsToWin=` is dealt into
  // every game of the batch, so the page stamps what the games actually used.
  out.push(`| Points to win | ${pointsToWin(args)} |`);
  out.push(
    `| Card values | ${TYPES.map((t) => `${TYPE_LABEL[t]} ${MISSION_POINTS[t]}`).join(", ")} |`
  );
  out.push(`| Hold | ${CARGO_HOLD_CRATES} crate (data rides free) |`);
  out.push(
    `| The deal | ${PRIMARY_OFFERS_PER_PLAYER} primaries keep ${PRIMARIES_PER_PLAYER}, ` +
      `${SECONDARY_OFFERS_PER_PLAYER} secondaries keep ${SECONDARIES_PER_PLAYER} |`
  );
  out.push(`| Seats allowed | ${MIN_PLAYERS}–${MAX_PLAYERS} |`);
  // The map is a rule: a page run under a different one is not comparable.
  out.push(
    `| Drift | black hole ${BLACKHOLE_RINGS.map((r) => r.velocity).join("/")}, ` +
      `planet ${PLANET_RINGS.map((r) => r.velocity).join("/")} (station on planet ring ${STATION_RING}) |`
  );
  out.push(`| Starting hull | ${STARTING_HIT_POINTS} |`);
  out.push(
    `| Heat track | ${MAX_HEAT}; above it is hull damage, then shed ${DEFAULT_DISSIPATION_CAPACITY} (+${RADIATOR_DISSIPATION} per radiator) and carry the rest |`
  );
  out.push(
    `| Shields | ${SHIELD_ENERGY_PER_POINT} cubes a point absorbed, ${SHIELD_HEAT_PER_POINT} heat a point, and its cubes as heat every turn it is powered |`
  );
  out.push("| Repair | a station on arrival fixes everything; away from one, one tile a turn at 0 heat |");
  out.push(`| Table time assumes | ${args.minutesPerTurn} min per player-turn |`);
  // A page run under `--rules=` is not the standing benchmark: say so where
  // the reader looks first, or two pages get diffed as if they were.
  if (describeRuleOverrides(args.rules))
    out.push(`| Experiment overrides | ${describeRuleOverrides(args.rules)} |`);
  // Bots told to think differently play a different game, so the page says so
  // for the same reason a rule override does.
  if (describeBotOverrides(args.bot))
    out.push(`| Bot overrides | ${describeBotOverrides(args.bot)} |`);
  out.push("");

  out.push("## By seat count");
  out.push("");
  out.push(
    "| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |"
  );
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    out.push(
      `| ${r.players} | ${pct(r.decided)} | ${r.roundsMedian} | ${r.roundsP75} | ${tableTime(
        r.turns,
        args.minutesPerTurn
      )} | ${r.kills} | ${r.completions} | ${pct(r.burn)} | ${pct(r.scoop)} | ${pct(
        r.firing
      )} | ${pct(r.lost)} | ${r.seatSpread} | ${r.notes} |`
    );
  }
  out.push("");
  out.push(
    "_Table time is the median game at the stated pace: rounds x seats player-turns. " +
      "`lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._"
  );
  out.push("");

  out.push("## Hands the bots kept");
  out.push("");
  out.push("| hand | seats | share of seats | win rate | points scored |");
  out.push("|---|---|---|---|---|");
  for (const h of handShapeRows(batches)) {
    out.push(
      `| ${h.shape} | ${h.seats} | ${pct(h.share)} | ${pct(h.winRate)} | ${
        Math.round(h.pointsPerGame * 10) / 10
      } |`
    );
  }
  out.push("");
  out.push(
    "_Every hand is one primary and two secondaries, which is five points held for the " +
      `${pointsToWin(args)} that win, so the row is the primary a seat took and what it took beside ` +
      "it. A hand nobody keeps is a plan the table never tested._"
  );
  out.push("");

  out.push("## Hulls the bots chose");
  out.push("");
  out.push("| hull | seats | share of seats | win rate |");
  out.push("|---|---|---|---|");
  for (const l of loadoutRows(batches)) {
    out.push(`| ${l.hull} | ${l.seats} | ${pct(l.share)} | ${pct(l.winRate)} |`);
  }
  out.push("");
  out.push(
    "_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._"
  );
  out.push("");

  out.push("## Cards");
  out.push("");
  out.push("| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |");
  out.push("|---|---|---|---|---|---|");
  for (const m of missionRows(batches)) {
    out.push(
      `| ${TYPE_LABEL[m.type]} | ${m.offered} | ${m.kept} | ${pct(m.pickRate)} | ${Math.round(
        m.completedPerHundredKept
      )} | ${pct(m.shareOfWinningCards)} |`
    );
  }
  out.push("");
  out.push(
    "_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. " +
      "Two piles serve the table and each is dealt against its own choice, so pick rates inside a " +
      "pile compare and the two piles do not; setup takes out the rival cards a table this size " +
      "cannot use, so the offered column is not flat across seat counts._"
  );
  out.push("");
  return out.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // In this process for the stamp the page prints; the workers that play the
  // games get the same overrides with every job.
  applyBotOverrides(args.bot);
  const rows: SeatRow[] = [];
  const batches: BatchResult[] = [];

  for (const players of args.players) {
    process.stderr.write(`[bench] ${players} seats, ${args.games} games...\n`);
    const batch = await runBatch({
      games: args.games,
      botCount: players,
      baseSeed: BASE_SEED,
      maxTurns: MAX_TURNS_PER_PLAYER * players,
      workers: args.workers,
      rules: args.rules,
      bots: args.bot,
    });
    batches.push(batch);
    rows.push(seatRow(players, batch));
  }

  const page = render(args, rows, batches);
  if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, page + "\n");
    process.stderr.write(`[bench] wrote ${args.output}\n`);
  }
  process.stdout.write(page + "\n");
}

await main();
