/**
 * Loadout phase: pick 3 of the offered missions by synergy, then a hull
 * that fits them. Positions are unknown at this point (deployment comes
 * after loadout), so the choice is made from the cards alone and is
 * deterministic.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission, MissionType } from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import { MISSIONS_PER_PLAYER, isPrimaryType } from "../../models/missions.ts";

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
 * The hand a bot keeps: one primary of the three it was dealt, two secondaries
 * of the three (RULES §Missions).
 *
 * **The primary is still chosen at random among the three.** Deliberately. The
 * bot used to score every combination against a table of hand-tuned costs,
 * which meant every seat at every table reached for the same plan and the
 * benchmark restated what the scorer believed instead of measuring the game. A
 * plan the bots never choose is a plan nobody can measure — and the weakest
 * primary is exactly the one a scorer would drop and the one the designer needs
 * numbers for. So the spread stays.
 *
 * **The secondaries are not chosen at random.** Two of them have to be
 * different cards, which the deal guarantees is possible, and one surviving
 * pairing is refused by a rule rather than by taste: a load of garbage fills
 * the hold and so does a delivery crate ({@link CARGO_HOLD_CRATES} is 1), so
 * Deliver with Garbage Disposal is two trips where the other pairings are one.
 * That is the engine's own arithmetic, not an opinion about balance, so the bot
 * avoids it when the deal offers anything else.
 *
 * @param pick chooses among the hands on offer; wire it to the game's seeded
 *   RNG so a seed replays exactly. Without one the first hand is taken, which
 *   keeps the function pure for tests.
 * @param hull a mat already decided for this seat (the simulator forces one to
 *   measure it). Hands that mat could never complete are skipped — the engine
 *   refuses them anyway. A deal with no flyable hand falls back to the first.
 * @param primary experiment only: keep this kind of primary. Ignored when the
 *   deal does not offer one, so a batch never stalls on a seed.
 */
export function selectBotMissions(
  offers: Mission[],
  playerCount: number,
  hull?: ShipLoadout,
  primary?: MissionType,
  pick?: (n: number) => number
): Mission[] {
  void playerCount;
  if (offers.length <= MISSIONS_PER_PLAYER) return offers;
  // Give up the experiment's constraints one at a time rather than all at
  // once: the forced primary first, then the forced mat. The last resort is a
  // hand of whatever was offered, which only a hand-built deal can reach —
  // every real deal holds three primaries and three secondaries.
  let hands = validHands(offers, hull, primary);
  if (hands.length === 0) hands = validHands(offers, hull);
  if (hands.length === 0) hands = validHands(offers, undefined, primary);
  if (hands.length === 0) hands = validHands(offers);
  if (hands.length === 0) return offers.slice(0, MISSIONS_PER_PLAYER);
  // A hold shared between a crate and a load of garbage is two trips: skip
  // those hands while any other hand is on the table.
  const roomy = hands.filter((hand) => !holdIsContested(hand));
  const choose = roomy.length > 0 ? roomy : hands;
  return choose[pick ? pick(choose.length) : 0];
}

/** Deliver and Garbage Disposal both want the one crate the hold takes. */
function holdIsContested(hand: Mission[]): boolean {
  return (
    hand.some((m) => m.type === "deliver_cargo") &&
    hand.some((m) => m.type === "garbage_disposal")
  );
}

/**
 * Every hand of one primary and two secondaries the mat can fly, in a fixed
 * order.
 *
 * "Can fly" is the engine's own rule and the only filter there is: a kept
 * Intercept needs a sensor array, a kept Destroy a gun, and a hand that breaks
 * that is refused at submission. With no mat decided yet every hand is
 * flyable, because the caller fits one to whatever is kept.
 */
export function validHands(
  offers: Mission[],
  hull?: ShipLoadout,
  primary?: MissionType
): Mission[][] {
  const primaries = offers.filter((m) => isPrimaryType(m.type));
  const secondaries = offers.filter((m) => !isPrimaryType(m.type));
  const hands: Mission[][] = [];
  for (const lead of primaries) {
    if (primary !== undefined && lead.type !== primary) continue;
    for (let i = 0; i < secondaries.length; i++) {
      for (let j = i + 1; j < secondaries.length; j++) {
        // The pair has to be two different things to do (RULES §Missions).
        if (secondaries[i].type === secondaries[j].type) continue;
        const hand = [lead, secondaries[i], secondaries[j]];
        if (hull !== undefined && missionsMissingRequirements(hand, hull).length > 0) continue;
        hands.push(hand);
      }
    }
  }
  return hands;
}
