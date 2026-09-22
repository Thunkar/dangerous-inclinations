/**
 * Heat, which is a track and not a budget, and the only limit on a ship.
 *
 * **One rule: at the owner's heat check, every cube on the loadout is a point
 * of heat** (`heatFromCubes`). A tile an action powered is still carrying its
 * cubes when the check runs, so firing costs its four and a burn costs the
 * burn's; a standing tile carries them the whole time, so a wall, a rack or a
 * sensor pays at every check. Absorbed damage adds two per point on top
 * (`damage.ts`), because that heat is the shot, not the cubes.
 *
 * There is no reactor cap any more: a ship may light everything it owns in one
 * turn, and what stops it is this check. At it the ship pays for anything above
 * `MAX_HEAT` in hull, then dissipates and **carries the rest into the next
 * turn**.
 *
 * Heat used to reset to zero here, which made dissipation a spend limit: under
 * it nothing cost anything, over it a point absorbed cost more hull than it
 * saved, and so no ship ever crossed the line (1.5% of turns, with a mean 3.67
 * points of the track unused). Carrying it keeps the long-run price identical
 * (generate more than you dissipate and you pay the difference every turn once the
 * track saturates) while giving the ship ten points of buffer to spend first.
 * That is what makes a hot turn a decision rather than a cliff: you can take one
 * and climb back out over the quiet turns after it.
 */
import type { ShipState } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, MAX_HEAT } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import {
  findSubsystem,
  getDissipationCapacity,
  heatFromCubes,
  revealSubsystem,
  updateSubsystem,
} from "./ship.ts";

export { addHeat } from "./ship.ts";

/** The heat a ship would be carrying at a check, before it dissipates. */
export function heatAtCheck(ship: ShipState): number {
  return ship.heat.currentHeat + heatFromCubes(ship.subsystems);
}

/** Hull the next heat check would cost: whatever is over the top of the track. */
export function calculateHeatDamage(ship: ShipState): number {
  return Math.max(0, heatAtCheck(ship) - MAX_HEAT);
}

/** Heat left on the track after a check: capped at the top, then dissipated. */
export function heatAfterCheck(heat: number, dissipation: number): number {
  return Math.max(0, Math.min(heat, MAX_HEAT) - dissipation);
}

/**
 * End-of-turn heat check.
 *
 * 1. Every cube on the loadout is a point of heat, however it got there.
 * 2. A ship that made no heat at all repairs the tile its owner named.
 * 3. Anything over `MAX_HEAT` is hull damage, and the track stops at the top.
 * 4. The ship dissipates; what is left carries to the next turn.
 *
 * **Cold repair.** Heat 0 at the check means not a cube on the loadout and
 * nothing absorbed since the last check: everything off and the crew outside. It is the only repair that does not need a station,
 * and it is what stops a critical on the engines or the thrusters being a
 * soft-lock: every station is in a planet well, reaching one needs a jump, and
 * a jump needs engines, so a ship without them could otherwise never be fixed.
 * One tile a turn, named by its owner with the turn.
 *
 * Working radiators are revealed whenever the ship dissipated more than a bare hull
 * could have: they are visibly doing it, whether or not damage was avoided.
 * Shields are not revealed by that heat: the cubes on the slot are
 * already public and the dissipation covering them is not, so the arithmetic
 * is a tell and not a proof, which is the trade RULES.md asks for.
 */
export function resolveEndOfTurnHeat(
  ship: ShipState,
  playerId: string,
  /** Tile the owner named for a cold repair, if any. */
  repairChoice?: SubsystemId
): { ship: ShipState; damage: number; events: EventDraft[] } {
  const cubes = heatFromCubes(ship.subsystems);
  const heat = ship.heat.currentHeat + cubes;
  const dissipation = getDissipationCapacity(ship.subsystems);
  const damage = Math.max(0, heat - MAX_HEAT);
  const carried = heatAfterCheck(heat, dissipation);
  const events: EventDraft[] = [];
  let next = ship;

  if (heat === 0 && repairChoice !== undefined) {
    const sub = findSubsystem(next, repairChoice);
    if (sub?.isBroken) {
      next = updateSubsystem(next, repairChoice, { isBroken: false });
      events.push({
        type: "subsystem_repaired",
        playerId,
        subsystemId: repairChoice,
        subsystemType: sub.type,
      });
    }
  }

  // Radiators show themselves whenever they are shedding heat the base ship could not.
  if (heat > DEFAULT_DISSIPATION_CAPACITY && dissipation > DEFAULT_DISSIPATION_CAPACITY) {
    for (const radiator of ship.subsystems.filter((s) => s.type === "radiator" && !s.isBroken)) {
      const r = revealSubsystem(next, playerId, radiator.id, "prevented_heat_damage");
      next = r.ship;
      events.push(...r.events);
    }
  }

  events.push({ type: "heat_check", playerId, heat, cubes, dissipation, damage, carried });
  if (damage > 0) {
    next = { ...next, hitPoints: Math.max(0, next.hitPoints - damage) };
    events.push({ type: "heat_damage", playerId, heat, dissipation, damage });
  }

  return { ship: { ...next, heat: { currentHeat: carried } }, damage, events };
}
