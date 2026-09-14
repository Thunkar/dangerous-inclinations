/**
 * Loadout phase: pick 3 of the 5 offered missions by synergy, then a hull
 * that fits them. Positions are unknown at this point (deployment comes
 * after loadout), so the choice is made from the cards alone and is
 * deterministic.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import {
  MISSIONS_PER_PLAYER,
  MISSION_FAMILY,
  missionTargetsPlayer,
} from "../../models/missions.ts";

export type BotArchetype = "hunter" | "raider" | "hauler" | "scout";

/**
 * | Archetype | Forward      | Side (port 0-1, starboard 2-3)                  | For                                |
 * |-----------|--------------|-------------------------------------------------|------------------------------------|
 * | hunter    | railgun      | laser, radiator, laser, shields                  | two or more Destroy cards          |
 * | raider    | railgun      | laser, radiator, fuel_compressor, shields        | one Destroy card, or a mixed hand  |
 * | hauler    | sensor_array | shields, radiator, fuel_compressor, laser        | two cargo runs                     |
 * | scout     | sensor_array | shields, radiator, fuel_compressor, missiles     | Intercept plus combat              |
 *
 * The hunter spreads its two lasers across the port and starboard sides so
 * one covers each ring direction; both are powered and fired independently
 * because every action names a slot id, not a subsystem type.
 *
 * **Why every combat hull carries a radiator.** A shield tile holds four
 * cubes, absorbs four damage a turn and is refilled for free next turn, so a
 * volley that does not beat four damage in a single turn never reaches a
 * hull at all. Heat is what caps the volley: using a tile costs its energy
 * in heat, and heat over the dissipation is your own hull. At dissipation 5
 * the biggest clean volley is the railgun alone — exactly the four points a
 * shield eats. The radiator's +2 buys the laser that goes with it (6 damage,
 * 6 heat), which is the smallest volley in the game that actually hurts
 * someone. The hunter pays one point of heat damage for a third gun.
 */
export const BOT_LOADOUT_TEMPLATES: Record<BotArchetype, ShipLoadout> = {
  hunter: {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "radiator", "ballistic_rack", "shields"],
  },
  raider: {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "radiator", "fuel_compressor", "shields"],
  },
  hauler: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "radiator", "fuel_compressor", "laser"],
  },
  scout: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "radiator", "fuel_compressor", "missiles"],
  },
};

function count(missions: Mission[], ...types: Mission["type"][]): number {
  return missions.filter((m) => types.includes(m.type)).length;
}

/**
 * Archetype for a set of missions. The forward slot holds either the railgun
 * or the sensor array, and that is the whole decision: Intercept cannot even
 * start without a scan, so any Intercept card rules out the railgun hulls.
 * Between the two sensor hulls, the scout keeps a second gun for the Destroy
 * card it is carrying and the hauler trades it for the radiator and the
 * compressor a long route wants.
 *
 * The sensor array earns the forward slot only when a card needs a scan.
 * A hand of Deliver and Survey cards never scans anything, and the crit
 * bonus is a rounding error next to the difference between a 2-damage
 * broadside and a 6-damage volley — so a hand with no Intercept takes the
 * railgun, whether or not it holds a Destroy card. The bot will be shooting
 * at whoever is one dock from winning in any case (see `behaviors/danger.ts`);
 * the raider is simply the hauler with a gun in the nose.
 */
export function classifyArchetype(missions: Mission[]): BotArchetype {
  const active = missions.filter((m) => !m.isCompleted);
  const destroy = count(active, "destroy_ship");
  const intercept = count(active, "intercept_transmission");
  const travel = count(active, "deliver_cargo", "survey");

  if (intercept > 0) return destroy > 0 || travel === 0 ? "scout" : "hauler";
  if (destroy >= 2) return "hunter";
  return "raider";
}

export function selectBotLoadout(missions: Mission[]): ShipLoadout {
  return BOT_LOADOUT_TEMPLATES[classifyArchetype(missions)];
}

/**
 * Rough turns to complete each card type, before synergies.
 *
 * Destroy used to be priced as a hunt across the whole map (22 turns), which
 * is what it costs against a target that behaves unpredictably. It does not:
 * a ship carrying cargo has to dock, everyone can see what it carries, and
 * the lanes and stations are a short list of places to wait (see
 * `behaviors/danger.ts`). Priced as an ambush it sits between the Deliver
 * run and the short cards, which is where the sim says it belongs.
 */
const BASE_COST: Record<Mission["type"], number> = {
  destroy_ship: 17,
  deliver_cargo: 16,
  intercept_transmission: 12,
  survey: 12,
};

/**
 * Credit for a Destroy card beyond the point it scores. The bot will be
 * shooting at whoever is about to win in any case; holding their card turns
 * that turn of denial into a point of its own.
 */
const DENIAL_CREDIT = 3;

/**
 * Score a trio: lower total cost and coherent cards score higher.
 */
export function scoreMissionCombo(combo: Mission[], playerCount: number): number {
  let cost = 0;
  for (const m of combo) {
    cost += BASE_COST[m.type];
    // More opponents means more ships to run into and shoot at.
    if (m.type === "destroy_ship") cost -= Math.max(0, playerCount - 2) * 2 + DENIAL_CREDIT;
  }

  let synergy = 0;
  const targeted = combo.filter(missionTargetsPlayer);
  const destroys = targeted.filter((m) => m.type === "destroy_ship");
  const intercepts = targeted.filter((m) => m.type === "intercept_transmission");
  const deliveries = combo.filter((m) => m.type === "deliver_cargo");
  const docks = combo.filter(
    (m) => m.type === "deliver_cargo" || m.type === "intercept_transmission"
  );
  const surveys = combo.filter((m) => m.type === "survey");

  // Same hunt serves two Destroy cards; split hunts cost extra.
  const destroyTargets = new Set(destroys.map((m) => m.targetPlayerId));
  synergy += (destroys.length - destroyTargets.size) * 10;
  if (destroyTargets.size >= 2) synergy -= 4;
  // Intercepting the ship you are hunting.
  synergy += intercepts.filter((m) => destroyTargets.has(m.targetPlayerId)).length * 6;
  // Intercept and Destroy fight over the one forward slot, and the loser is
  // always Destroy: an Intercept cannot start without the sensor array, and
  // no combination of side tiles beats the four damage a shield absorbs
  // every turn. A hand holding both is a hand with a dead card in it.
  if (intercepts.length > 0 && destroys.length > 0) synergy -= 8;

  // Cargo routes sharing planets; a chained route is one trip.
  for (let i = 0; i < deliveries.length; i++) {
    for (let j = i + 1; j < deliveries.length; j++) {
      const a = deliveries[i];
      const b = deliveries[j];
      if (a.deliveryPlanetId === b.pickupPlanetId || b.deliveryPlanetId === a.pickupPlanetId)
        synergy += 8;
      else {
        const planets = new Set([
          a.pickupPlanetId,
          a.deliveryPlanetId,
          b.pickupPlanetId,
          b.deliveryPlanetId,
        ]);
        synergy += (4 - planets.size) * 5;
      }
    }
  }
  // Data is delivered at whatever station the route visits anyway.
  if (surveys.length > 0 && docks.length > 0) synergy += 4;
  if (intercepts.length > 0 && deliveries.length > 0) synergy += 3;

  const families = new Set(combo.map((m) => MISSION_FAMILY[m.type]));
  if (families.size === 1) synergy += 4;

  return -cost + synergy;
}

/**
 * The best trio of the offers. Ties keep the earlier combination, so the
 * choice is deterministic for a given offer order.
 */
export function selectBotMissions(offers: Mission[], playerCount: number): Mission[] {
  if (offers.length <= MISSIONS_PER_PLAYER) return offers;
  let best: Mission[] = offers.slice(0, MISSIONS_PER_PLAYER);
  let bestScore = -Infinity;
  for (let i = 0; i < offers.length - 2; i++) {
    for (let j = i + 1; j < offers.length - 1; j++) {
      for (let k = j + 1; k < offers.length; k++) {
        const combo = [offers[i], offers[j], offers[k]];
        const score = scoreMissionCombo(combo, playerCount);
        if (score > bestScore) {
          bestScore = score;
          best = combo;
        }
      }
    }
  }
  return best;
}
