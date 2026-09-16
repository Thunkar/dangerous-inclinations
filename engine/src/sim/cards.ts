/**
 * Card economics: how often a kept card is chosen, and how fast it pays off.
 *
 *   node --experimental-transform-types --no-warnings src/sim/cards.ts 250 3
 *
 * **Why not simply count completions.** A game ends the moment someone reaches
 * three points, so anything that makes cards easier also makes games shorter,
 * and the losers' cards stop completing. Total completions therefore fall when
 * a card gets *easier*, which reads exactly backwards. Two measures here are
 * free of that: completions per thousand player-turns, and the turns a kept
 * card took to score.
 */
import { runGame } from "./runGame.ts";
import type { MissionType } from "../models/missions.ts";

const games = Number(process.argv[2] ?? 250);
const bots = Number(process.argv[3] ?? 3);
const baseSeed = 5000;

const TYPES: MissionType[] = ["destroy_ship", "deliver_cargo", "intercept_transmission", "survey"];
const offered: Record<string, number> = {};
const kept: Record<string, number> = {};
const done: Record<string, number> = {};
const wonWith: Record<string, number> = {};
const turnsTo: Record<string, number[]> = {};
for (const t of TYPES) {
  offered[t] = 0;
  kept[t] = 0;
  done[t] = 0;
  wonWith[t] = 0;
  turnsTo[t] = [];
}

let playerTurns = 0;
const rounds: number[] = [];

for (let g = 0; g < games; g++) {
  const run = runGame({ seed: baseSeed + g, botCount: bots, maxTurns: 400, record: true, tiebreak: true });
  const start = run.recording!.initialState;
  for (const p of start.players) {
    for (const m of p.missionOffers) offered[m.type]++;
    for (const m of p.missions) kept[m.type]++;
  }
  playerTurns += run.turnsPlayed;
  rounds.push(Math.ceil(run.turnsPlayed / bots));
  // When each card scored, from the events, so "how long did it take" is real.
  const firstSeen = new Map<string, number>();
  for (const turn of run.turns)
    for (const e of turn.events)
      if (e.type === "mission_completed" && !firstSeen.has(e.mission.id))
        firstSeen.set(e.mission.id, turn.turnNumber);
  const winner = run.finalState.players.find((p) => p.id === run.finalState.winnerId);
  for (const p of run.finalState.players)
    for (const m of p.missions)
      if (m.isCompleted) {
        done[m.type]++;
        const at = firstSeen.get(m.id);
        if (at !== undefined) turnsTo[m.type].push(Math.ceil(at / bots));
        if (winner && p.id === winner.id) wonWith[m.type]++;
      }
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((1000 * n) / d) / 10}%`);
const med = (xs: number[]) =>
  xs.length === 0 ? "-" : String([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
console.log(
  `games=${games} bots=${bots} player-turns=${playerTurns} rounds(median)=${med(rounds)}`
);
console.log(
  "| card | kept when offered | completions / 1000 player-turns | round it scored (median) | share of winners' cards |"
);
console.log("|---|---|---|---|---|");
const wonTotal = TYPES.reduce((s, t) => s + wonWith[t], 0);
for (const t of TYPES)
  console.log(
    `| ${t} | ${pct(kept[t], offered[t])} | **${(1000 * done[t] / playerTurns).toFixed(2)}** | ${med(turnsTo[t])} | ${pct(wonWith[t], wonTotal)} |`
  );
