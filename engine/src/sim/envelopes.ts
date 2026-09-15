/**
 * Weapon envelope analysis on real bot movement. Runs recorded games and, for
 * every acting turn, asks for each (current or hypothetical) weapon envelope
 * whether any opponent in the same well was in range from the ship's
 * pre-move or post-move position, and whether the same opponent is still in
 * range at the start of the attacker's next turn (a second shot without
 * manoeuvring). Weapons that are not carried are evaluated all the same: the
 * question is geometry, not loadout.
 */
import { runGame } from "../sim/runGame.ts";
import { sectorDistance, forwardDistance } from "../game/geometry.ts";
import type { GameState, Facing } from "../models/game.ts";

type Pos = { wellId: string; ring: number; sector: number; facing: Facing };
type Env = (a: Pos, t: Pos) => boolean;

const ahead = (a: Pos, t: Pos) =>
  a.facing === "prograde"
    ? forwardDistance(a.sector, t.sector)
    : forwardDistance(t.sector, a.sector);
const ringD = (a: Pos, t: Pos) => Math.abs(a.ring - t.ring);
const secD = (a: Pos, t: Pos) => sectorDistance(a.sector, t.sector);
/** Starboard tile (side-3/4) fires inward when prograde, outward when retrograde. */
const starboardOk = (a: Pos, t: Pos) =>
  a.facing === "prograde" ? t.ring < a.ring : t.ring > a.ring;
const portOk = (a: Pos, t: Pos) => !starboardOk(a, t);

const ENVELOPES: Record<string, Env> = {
  "railgun (same ring, 1-5 ahead)": (a, t) =>
    ringD(a, t) === 0 && ahead(a, t) >= 1 && ahead(a, t) <= 5,
  "laser now: one tile, starboard (±2 rings one way, ±1 sector)": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 1 && starboardOk(a, t),
  "laser now: one tile, port": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 1 && portOk(a, t),
  "laser: both directions (±2 rings, ±1 sector)": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 1,
  "laser: one way but ±2 sectors": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 2 && starboardOk(a, t),
  "laser: both directions + same ring (turret ±2/±1)": (a, t) =>
    ringD(a, t) <= 2 && secD(a, t) <= 1 && !(ringD(a, t) === 0 && secD(a, t) === 0),
  "forward laser: ±1 ring, 1-3 sectors ahead": (a, t) =>
    ringD(a, t) <= 1 && ahead(a, t) >= 1 && ahead(a, t) <= 3,
  "laser: both directions, ±2 sectors": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 2,
  "laser: one way, ±3 sectors": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 3 && starboardOk(a, t),
  "laser: both directions, ±3 sectors (other rings only)": (a, t) =>
    ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 3,
  "laser: one way ±3 sectors + own ring ±3": (a, t) =>
    (ringD(a, t) >= 1 && ringD(a, t) <= 2 && secD(a, t) <= 3 && starboardOk(a, t)) ||
    (ringD(a, t) === 0 && secD(a, t) >= 1 && secD(a, t) <= 3),
  "rack if one-sided (starboard, same ring kept)": (a, t) =>
    (ringD(a, t) === 1 && secD(a, t) <= 1 && starboardOk(a, t)) ||
    (ringD(a, t) === 0 && secD(a, t) === 1),
  "rack (±1 ring, ±1 sector, same ring 1 away)": (a, t) =>
    ringD(a, t) <= 1 && secD(a, t) <= 1 && !(ringD(a, t) === 0 && secD(a, t) === 0),
  "missiles: direct envelope (±2 rings, ±3 sectors)": (a, t) => ringD(a, t) <= 2 && secD(a, t) <= 3,
};

const games = Number(process.argv[2] ?? 60);
const bots = Number(process.argv[3] ?? 3);
const baseSeed = 5000;

const stats: Record<string, { post: number; either: number; again: number; againBase: number }> =
  {};
for (const k of Object.keys(ENVELOPES)) stats[k] = { post: 0, either: 0, again: 0, againBase: 0 };
let acting = 0;
let sameWellTurns = 0;

const posOf = (state: GameState, id: string): Pos => {
  const s = state.players.find((p) => p.id === id)!.ship;
  return { wellId: s.wellId, ring: s.ring, sector: s.sector, facing: s.facing };
};

for (let g = 0; g < games; g++) {
  const run = runGame({
    seed: baseSeed + g,
    botCount: bots,
    maxTurns: 400,
    record: true,
    tiebreak: true,
  });
  const rec = run.recording!;
  const snaps = [rec.initialState, ...rec.turns.map((t) => t.resultingStateSnapshot)];
  for (let i = 0; i < rec.turns.length; i++) {
    const turn = rec.turns[i];
    const before = snaps[i];
    const after = snaps[i + 1];
    const me = before.players.find((p) => p.id === turn.playerId)!;
    if (me.ship.hitPoints <= 0 || me.skipTurns > 0) continue;
    const lost = turn.events.some(
      (e) => (e.type === "respawned" || e.type === "turn_skipped") && e.playerId === turn.playerId
    );
    if (lost) continue;
    acting++;
    const pre = posOf(before, turn.playerId);
    const post = posOf(after, turn.playerId);
    const opponents = after.players.filter((p) => p.id !== turn.playerId && p.ship.hitPoints > 0);
    if (opponents.some((o) => o.ship.wellId === post.wellId)) sameWellTurns++;
    // The attacker's next acting turn: the snapshot before it holds everyone's positions then.
    let nextIdx = -1;
    for (let j = i + 1; j < rec.turns.length; j++)
      if (rec.turns[j].playerId === turn.playerId) {
        nextIdx = j;
        break;
      }
    for (const [name, env] of Object.entries(ENVELOPES)) {
      let postHit = false,
        eitherHit = false,
        againHit = false,
        againBase = false;
      for (const o of opponents) {
        const t = posOf(after, o.id);
        const inPost = t.wellId === post.wellId && env(post, t);
        const inPre = t.wellId === pre.wellId && env(pre, t);
        postHit ||= inPost;
        eitherHit ||= inPost || inPre;
        if (inPost && nextIdx >= 0) {
          againBase = true;
          const nb = snaps[nextIdx];
          const me2 = posOf(nb, turn.playerId);
          const o2 = nb.players.find((p) => p.id === o.id)!;
          if (o2.ship.hitPoints > 0) {
            const t2 = posOf(nb, o.id);
            if (t2.wellId === me2.wellId && env(me2, t2)) againHit = true;
          }
        }
      }
      if (postHit) stats[name].post++;
      if (eitherHit) stats[name].either++;
      if (againBase) stats[name].againBase++;
      if (againHit) stats[name].again++;
    }
  }
}
const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((1000 * n) / d) / 10}%`);
console.log(
  `games=${games} bots=${bots} acting turns=${acting}, with an opponent in the same well: ${pct(sameWellTurns, acting)}`
);
console.log(
  "| envelope | target in range after moving | before or after | still in range next turn |"
);
console.log("|---|---|---|---|");
for (const [name, s] of Object.entries(stats))
  console.log(
    `| ${name} | ${pct(s.post, acting)} | ${pct(s.either, acting)} | ${pct(s.again, s.againBase)} |`
  );
