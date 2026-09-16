/**
 * Fuel-pressure probe. Answers the question the compressor split turns on:
 * what does fuel actually cost a ship, and where does a tile help?
 *
 *   node --experimental-transform-types --no-warnings src/sim/fuel.ts 120 3
 *
 * Reported per acting turn (recorded games, bots' own hulls):
 * - fuel held as a share of capacity at the start of the turn
 * - turns spent scooping, and how much of the scoop was thrown away because
 *   the tank was already full (the tank tile's whole value)
 * - jumps taken and the fuel a compressor refunded (the compressor's value)
 * - turns where the ship ended with no fuel for even a soft burn
 */
import { runGame } from "./runGame.ts";
import { applyLoadoutOverrides, parseLoadoutOverrides } from "./loadoutOverrides.ts";
import { ringVelocity } from "../game/geometry.ts";
import { MAX_REACTION_MASS } from "../models/game.ts";
import type { GameState } from "../models/game.ts";

const games = Number(process.argv[2] ?? 120);
const bots = Number(process.argv[3] ?? 3);
const baseSeed = 5000;
/** Third argument: bot hull overrides, as `yarn sim --loadouts=` takes them. */
if (process.argv[4]) applyLoadoutOverrides(parseLoadoutOverrides(process.argv[4]));

let acting = 0;
let scoopTurns = 0;
let scoopGain = 0;
let scoopPotential = 0;
let cappedScoops = 0;
let jumps = 0;
let jumpRefunded = 0;
let dryTurns = 0;
let atCapTurns = 0;
const fuelShare: number[] = [];
const capacities = new Map<number, number>();

for (let g = 0; g < games; g++) {
  const run = runGame({ seed: baseSeed + g, botCount: bots, maxTurns: 400, record: true, tiebreak: true });
  const rec = run.recording!;
  const snaps: GameState[] = [rec.initialState, ...rec.turns.map((t) => t.resultingStateSnapshot)];
  for (let i = 0; i < rec.turns.length; i++) {
    const turn = rec.turns[i];
    const before = snaps[i];
    const me = before.players.find((p) => p.id === turn.playerId)!;
    if (me.ship.hitPoints <= 0 || me.skipTurns > 0) continue;
    acting++;
    const cap = MAX_REACTION_MASS;
    capacities.set(cap, (capacities.get(cap) ?? 0) + 1);
    fuelShare.push(me.ship.reactionMass / cap);
    if (me.ship.reactionMass >= cap) atCapTurns++;
    if (me.ship.reactionMass < 1) dryTurns++;
    for (const e of turn.events) {
      if (e.type === "fuel_scooped" && e.playerId === turn.playerId) {
        scoopTurns++;
        scoopGain += e.amount;
        // The scoop runs after the drift, so the ring it is paid for is the
        // one the ship ended on.
        const after = snaps[i + 1].players.find((p) => p.id === turn.playerId)!.ship;
        const offered = ringVelocity(after.wellId, after.ring);
        scoopPotential += offered;
        if (e.amount < offered) cappedScoops++;
      }
      if (e.type === "jumped" && e.playerId === turn.playerId) {
        jumps++;
        if (e.refunded) jumpRefunded++;
      }
    }
  }
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((1000 * n) / d) / 10}%`);
const sorted = [...fuelShare].sort((a, b) => a - b);
const q = (p: number) => Math.round(100 * sorted[Math.floor(p * (sorted.length - 1))]);
console.log(`games=${games} bots=${bots} acting turns=${acting}`);
console.log(`fuel held / capacity at turn start: p10 ${q(0.1)}%, median ${q(0.5)}%, p90 ${q(0.9)}%`);
console.log(`turns at full tank: ${pct(atCapTurns, acting)}; turns under 1 fuel: ${pct(dryTurns, acting)}`);
console.log(
  `scoop turns: ${pct(scoopTurns, acting)} (${scoopTurns}); fuel gained ${scoopGain}, offered ${scoopPotential}, thrown away ${scoopPotential - scoopGain} (${pct(scoopPotential - scoopGain, scoopPotential)} of what the ring offered)`
);
console.log(`scoops capped by a full tank: ${pct(cappedScoops, scoopTurns)}`);
console.log(
  `jumps: ${jumps} (${(jumps / games).toFixed(2)}/game), of which refunded by a compressor ${pct(jumpRefunded, jumps)} — ${jumpRefunded * 3} fuel, ${((jumpRefunded * 3) / games).toFixed(1)}/game`
);
console.log(
  `capacities seen (turns): ${[...capacities.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}: ${pct(n, acting)}`).join(", ")}`
);
