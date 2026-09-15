/**
 * Heat. Subsystems add heat when used (see ship.ts useSubsystem). At the end
 * of a player's turn, heat above the ship's dissipation capacity becomes hull
 * damage and heat resets to 0.
 */
import type { ShipState } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { getDissipationCapacity, revealSubsystem } from "./ship.ts";

export { addHeat } from "./ship.ts";

export function calculateHeatDamage(ship: ShipState): number {
  return Math.max(0, ship.heat.currentHeat - getDissipationCapacity(ship.subsystems));
}

export function resetHeat(ship: ShipState): ShipState {
  return { ...ship, heat: { currentHeat: 0 } };
}

/**
 * End-of-turn heat check. Applies excess heat as hull damage, reveals
 * working radiators whenever heat went above the base dissipation (they are
 * visibly shedding heat, whether or not damage was fully prevented), and
 * resets heat. Emits `heat_damage` only when damage was taken.
 */
export function resolveEndOfTurnHeat(
  ship: ShipState,
  playerId: string
): { ship: ShipState; damage: number; events: EventDraft[] } {
  const heat = ship.heat.currentHeat;
  const dissipation = getDissipationCapacity(ship.subsystems);
  const damage = Math.max(0, heat - dissipation);
  const events: EventDraft[] = [];
  let next = ship;

  // Radiators show themselves whenever they are shedding heat the base ship could not.
  if (heat > DEFAULT_DISSIPATION_CAPACITY && dissipation > DEFAULT_DISSIPATION_CAPACITY) {
    for (const radiator of ship.subsystems.filter((s) => s.type === "radiator" && !s.isBroken)) {
      const r = revealSubsystem(next, playerId, radiator.id, "prevented_heat_damage");
      next = r.ship;
      events.push(...r.events);
    }
  }

  events.push({ type: "heat_check", playerId, heat, dissipation, damage });
  if (damage > 0) {
    next = { ...next, hitPoints: Math.max(0, next.hitPoints - damage) };
    events.push({ type: "heat_damage", playerId, heat, dissipation, damage });
  }

  return { ship: resetHeat(next), damage, events };
}
