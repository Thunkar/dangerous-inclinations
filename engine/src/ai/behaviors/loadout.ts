/**
 * Loadout phase: pick 3 of the offered missions by synergy, then a hull
 * that fits them. Positions are unknown at this point (deployment comes
 * after loadout), so the choice is made from the cards alone and is
 * deterministic.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import { MISSIONS_PER_PLAYER, MISSION_FAMILY } from "../../models/missions.ts";

/**
 * A hull is two decisions. **The role** is the forward tile, and the cards
 * choose it: a gun, eyes, or legs. **The variant** is how the four side slots
 * are spent, and that is taste — the same role played safe or played hard.
 *
 * | Role        | Forward    | Closes off                              |
 * |-------------|------------|-----------------------------------------|
 * | interceptor | sensor     | pays 3 fuel a jump                      |
 * | hunter      | railgun    | pays 3 fuel a jump                      |
 * | hauler      | compressor | cannot scan: no Intercept               |
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
  // Only Intercept asks for the eyes now: a Survey is a dive any mat can make,
  // so holding one says nothing about which forward tile to bolt on.
  if (count(active, "intercept_transmission") > 0) return "interceptor";
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
/** Whether any hand of `primaries` two-point cards can be dealt from `offers`. */
function hasShape(offers: Mission[], primaries: number): boolean {
  const primary = offers.filter((m) => MISSION_FAMILY[m.type] !== "secondary").length;
  const secondary = offers.length - primary;
  return primaries <= primary && MISSIONS_PER_PLAYER - primaries <= secondary;
}

/**
 * A hand from the offers, chosen at random among the hands this seat could
 * actually fly.
 *
 * Deliberately not "the best hand". The bot used to score every combination
 * against a table of hand-tuned costs, which meant every seat at every table
 * reached for the same shape — 79% of them took three two-point cards and not
 * one ever tried a hand led by secondary cards, so the benchmark measured one
 * plan and guessed about the rest. Forcing a shape (`--hands=`) measured them
 * head to head: within seven points of each other, with the shape the bots
 * never picked beating one they did. The scorer was not describing the game,
 * it was deciding it.
 *
 * So the bots spread instead, and the win rate by hand shape in the benchmark
 * is a measurement rather than a restatement of what the scorer believed.
 *
 * @param pick chooses among the hands on offer; wire it to the game's seeded
 *   RNG so a seed replays exactly. Without one the first hand is taken, which
 *   keeps the function pure for tests.
 * @param hull a mat already decided for this seat (the simulator forces one to
 *   measure it). Hands that mat could never complete are skipped — the engine
 *   refuses them anyway. A deal with no flyable hand falls back to the first.
 * @param primaries experiment only: keep a hand with exactly this many
 *   two-point cards. Ignored when no such hand can be dealt from these offers.
 */
export function selectBotMissions(
  offers: Mission[],
  playerCount: number,
  hull?: ShipLoadout,
  primaries?: number,
  pick?: (n: number) => number
): Mission[] {
  void playerCount;
  if (offers.length <= MISSIONS_PER_PLAYER) return offers;
  const hands = validHands(offers, hull, primaries);
  if (hands.length === 0) return offers.slice(0, MISSIONS_PER_PLAYER);
  return hands[pick ? pick(hands.length) : 0];
}

/**
 * Every hand of MISSIONS_PER_PLAYER the mat can fly, in a fixed order.
 *
 * "Can fly" is the engine's own rule and the only filter there is: a kept
 * Intercept needs a sensor array, a kept Destroy a gun, and a hand that breaks
 * that is refused at submission. With no mat decided yet every hand is
 * flyable, because the caller fits one to whatever is kept.
 */
export function validHands(
  offers: Mission[],
  hull?: ShipLoadout,
  primaries?: number
): Mission[][] {
  const shaped = primaries !== undefined && hasShape(offers, primaries);
  const hands: Mission[][] = [];
  const walk = (from: number, hand: Mission[]) => {
    if (hand.length === MISSIONS_PER_PLAYER) {
      if (shaped && hand.filter((m) => MISSION_FAMILY[m.type] !== "secondary").length !== primaries) {
        return;
      }
      if (hull !== undefined && missionsMissingRequirements(hand, hull).length > 0) return;
      hands.push([...hand]);
      return;
    }
    if (offers.length - from < MISSIONS_PER_PLAYER - hand.length) return;
    for (let i = from; i < offers.length; i++) walk(i + 1, [...hand, offers[i]]);
  };
  walk(0, []);
  return hands;
}
