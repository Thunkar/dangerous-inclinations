/**
 * Loadout phase: pick 3 of the offered missions by synergy, then a hull
 * that fits them. Positions are unknown at this point (deployment comes
 * after loadout), so the choice is made from the cards alone and is
 * deterministic.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import {
  DESTROY_POINTS,
  MISSIONS_PER_PLAYER,
  MISSION_FAMILY,
  missionTargetsPlayer,
} from "../../models/missions.ts";

/**
 * A hull is two decisions. **The role** is the forward tile, and the cards
 * choose it: a gun, eyes, or legs. **The variant** is how the four side slots
 * are spent, and that is taste — the same role played safe or played hard.
 *
 * | Role        | Forward    | Closes off                              |
 * |-------------|------------|-----------------------------------------|
 * | interceptor | sensor     | pays 3 fuel a jump                      |
 * | hunter      | railgun    | pays 3 fuel a jump                      |
 * | hauler      | compressor | cannot scan: no Intercept, no Survey    |
 *
 * | Variant    | Spends its side slots on                                  |
 * |------------|-----------------------------------------------------------|
 * | tanky      | a second shield tile, and the one gun it needs for Destroy |
 * | aggressive | a second gun, and the radiator that volley needs           |
 */
export type BotRole = "interceptor" | "hunter" | "hauler";
export type HullVariant = "tanky" | "aggressive";
export type BotArchetype = `${BotRole}-${HullVariant}`;

export const BOT_ROLES: readonly BotRole[] = ["interceptor", "hunter", "hauler"];
export const HULL_VARIANTS: readonly HullVariant[] = ["tanky", "aggressive"];

/**
 * The six mats, which are also the presets offered to a human on the loadout
 * screen, so the table above, the tiles below and the UI must agree.
 *
 * **Every mat carries a weapon**, which is what a kept Destroy card needs
 * (RULES §Missions): the two roles that spend their forward slot on eyes or
 * legs buy theirs with a side slot.
 *
 * **Why the guns are paired.** A shield tile holds two cubes, absorbs two
 * damage a turn and is refilled for free next turn, so a lone 2-damage shot
 * never reaches a hull. The railgun's four is exactly two shield tiles: it
 * wants a partner on its own ring, and the ballistic rack is the only
 * broadside that fires there — which is why the aggressive hunter carries
 * both (4 + 2 = 6). Off the ring the laser is the gun that matters, since
 * shields are electromagnetic and do not stop it.
 *
 * **Why the aggressive mats carry a radiator.** Using a tile costs its energy
 * in heat, and heat over the dissipation is your own hull. Railgun plus
 * missiles is six against a dissipation of five; the radiator's +2 makes the
 * volley free. The full three-gun hunter volley is eight, one over even then:
 * firing everything is a decision, not a default.
 */
export const BOT_LOADOUT_TEMPLATES: Record<BotArchetype, ShipLoadout> = {
  "interceptor-tanky": {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "shields", "radiator", "laser"],
  },
  "interceptor-aggressive": {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "laser", "laser", "radiator"],
  },
  "hunter-tanky": {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "radiator", "shields", "shields"],
  },
  "hunter-aggressive": {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "radiator", "ballistic_rack", "shields"],
  },
  "hauler-tanky": {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "shields", "radiator", "laser"],
  },
  "hauler-aggressive": {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["missiles", "radiator", "shields", "laser"],
  },
};

function count(missions: Mission[], ...types: Mission["type"][]): number {
  return missions.filter((m) => types.includes(m.type)).length;
}

/**
 * The role is the forward tile, and the cards decide it. Intercept cannot
 * start without a scan and Survey needs powered sensors on the ring, so
 * either card takes the eyes and rules out the other two. With nothing to
 * scan the choice is the gun or the legs: a Destroy card has to catch someone
 * and get through their shields, which is what the railgun's four damage is
 * for, while a hand of cargo runs would rather not pay three fuel a jump.
 */
export function classifyRole(missions: Mission[]): BotRole {
  const active = missions.filter((m) => !m.isCompleted);
  if (count(active, "intercept_transmission", "survey") > 0) return "interceptor";
  if (count(active, "destroy_ship") > 0) return "hunter";
  return "hauler";
}

/**
 * The variant is taste, and a bot has none — so it reads the hand instead: a
 * Destroy card is the one card that cannot be scored by flying carefully, and
 * a bot holding one takes the second gun over the second shield.
 *
 * This ties two of the six mats to the role that implies them (a hunter always
 * holds a Destroy, a hauler never does), so bots fly four of the six. The
 * other two are measured by forcing them in the balance suite.
 */
export function classifyVariant(missions: Mission[]): HullVariant {
  const active = missions.filter((m) => !m.isCompleted);
  return count(active, "destroy_ship") > 0 ? "aggressive" : "tanky";
}

export function classifyArchetype(missions: Mission[]): BotArchetype {
  return `${classifyRole(missions)}-${classifyVariant(missions)}`;
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
  // The fastest card on the table: measured at a median of round 3 to score,
  // and the likeliest to be finished at all once kept. It was priced above
  // Deliver's own leg, which left it dealt and discarded.
  intercept_transmission: 11,
  // A dive to the innermost ring, one turn held, then the data is filed at
  // whatever station the route reaches anyway: a short card since 16 Sept 2026.
  survey: 13,
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
  const costOf = (m: Mission) =>
    m.type === "destroy_ship"
      ? BASE_COST[m.type] - (Math.max(0, playerCount - 2) * 2 + DENIAL_CREDIT)
      : BASE_COST[m.type];
  let cost = 0;
  if (DESTROY_POINTS >= 2 && combo.some((m) => m.type === "destroy_ship")) {
    // A two-point kill plus the cheapest other card already reaches three points.
    const destroy = combo.find((m) => m.type === "destroy_ship")!;
    const rest = combo
      .filter((m) => m !== destroy)
      .map(costOf)
      .sort((a, b) => a - b);
    cost = costOf(destroy) + (rest[0] ?? 0);
  } else {
    for (const m of combo) cost += costOf(m);
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
  // Intercept and Destroy used to fight over the one forward slot: the array
  // was compulsory for the scan and no side tile could beat a shield, so the
  // Destroy was dead. Two changes on 16 Sept 2026 ended that — a shield tile
  // holds two cubes, not four, and the rack does two damage — so the
  // interceptor-aggressive mat flies both cards off its side slots. What is
  // left of the conflict is the railgun the hand cannot have.
  if (intercepts.length > 0 && destroys.length > 0) synergy -= 2;

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
 *
 * @param hull a mat already decided for this seat (the simulator forces one on
 *   a seat to measure it). Trios that mat could never complete are skipped —
 *   the engine refuses them anyway. A deal that offers no flyable trio at all
 *   returns the best unconstrained one, and the caller fits the hull to it.
 */
export function selectBotMissions(
  offers: Mission[],
  playerCount: number,
  hull?: ShipLoadout
): Mission[] {
  if (offers.length <= MISSIONS_PER_PLAYER) return offers;
  const flyable = (combo: Mission[]) =>
    hull === undefined || missionsMissingRequirements(combo, hull).length === 0;

  let best: Mission[] = offers.slice(0, MISSIONS_PER_PLAYER);
  let bestScore = -Infinity;
  let bestFits = false;
  for (let i = 0; i < offers.length - 2; i++) {
    for (let j = i + 1; j < offers.length - 1; j++) {
      for (let k = j + 1; k < offers.length; k++) {
        const combo = [offers[i], offers[j], offers[k]];
        const fits = flyable(combo);
        // A trio the mat can fly always beats one it cannot, whatever it scores.
        if (bestFits && !fits) continue;
        const score = scoreMissionCombo(combo, playerCount);
        if (score > bestScore || (fits && !bestFits)) {
          bestScore = score;
          bestFits = fits;
          best = combo;
        }
      }
    }
  }
  return best;
}
