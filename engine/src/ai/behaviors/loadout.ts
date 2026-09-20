/**
 * Loadout phase: pick 3 of the offered missions by synergy, then a hull
 * that fits them. Positions are unknown at this point (deployment comes
 * after loadout), so the choice is made from the cards alone and is
 * deterministic.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission, MissionType } from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import {
  MISSIONS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
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
 * | hauler      | compressor | cannot scan: no Intercept               |
 *
 * | Variant    | Spends its side slots on                                  |
 * |------------|-----------------------------------------------------------|
 * | tanky      | two shield tiles, a radiator, and the one gun it needs for Destroy |
 * | aggressive | a second gun — not always another of the same — in place of one of those shield tiles |
 */
export type BotRole = "interceptor" | "hunter" | "hauler";
export type HullVariant = "tanky" | "aggressive";
export type BotArchetype = `${BotRole}-${HullVariant}`;

export const BOT_ROLES: readonly BotRole[] = ["interceptor", "hunter", "hauler"];
export const HULL_VARIANTS: readonly HullVariant[] = ["tanky", "aggressive"];

/**
 * The six loadouts, which are also the presets offered to a human on the loadout
 * screen, so the table above, the tiles below and the UI must agree.
 *
 * **Every loadout carries a weapon**, which is what a kept Destroy card needs
 * (RULES §Missions): the two roles that spend their forward slot on eyes or
 * legs buy theirs with a side slot.
 *
 * **Why the guns are paired.** A shield tile holds two cubes, absorbs two
 * damage a turn and is refilled for free next turn, so a lone 2-damage shot
 * never reaches a hull. The railgun's four is exactly two shield tiles, so it
 * wants a partner, and which partner depends on where the fight is: a laser
 * ignores shields — they are electromagnetic — and reaches two rings out, one
 * further than a rack, while a ballistic rack is the only broadside that fires
 * on the railgun's own ring, which is where the spinal shot puts the fight.
 *
 * **Why neither hunter carries missiles.** Measured in duels against the
 * strongest off-book hull — a compressor bow with two ballistic racks, a
 * shield tile and a radiator — the missile-carrying hunter completed its
 * Destroy 34% of the time: a powered rack rolls at every missile that reaches
 * it, so a salvo aimed at the one loadout built to answer it arrives as dice. The
 * tanky hunter takes the rack instead and keeps both shield tiles, which also
 * buys it the roll against somebody else's missiles; the aggressive one sells
 * a shield tile for a second gun.
 *
 * **Why the aggressive hunter's second gun is a rack and not a laser.** Every
 * bot holding a Destroy flies this loadout, and the interceptor and hauler presets
 * already carry lasers, so while this one carried two of them no ship in
 * natural play carried a ballistic rack at all: point defence had left the
 * table, missiles went unanswered, and the compressor hull with two launchers
 * became a 52% outlier. The laser in side-0 keeps the shot that goes through
 * shields and reaches a ring out; the rack in side-1 keeps point defence in
 * the field and is the one broadside that fires on the railgun's own ring,
 * which is where the spinal shot puts the fight.
 *
 * **Why every loadout carries a radiator.** Using a tile costs its energy in heat,
 * and heat over the dissipation is your own hull. The railgun plus one
 * broadside is six against a dissipation of five; the radiator's +2 makes that
 * pair free. The aggressive hunter's full three-gun volley is eight, one over
 * even then: firing everything is a decision, not a default.
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
    sideSlots: ["ballistic_rack", "shields", "shields", "radiator"],
  },
  "hunter-aggressive": {
    forwardSlots: ["railgun"],
    sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
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
  // Only Intercept asks for the eyes now: a Survey is a dive any loadout can make,
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
 * This ties two of the six loadouts to the role that implies them (a hunter always
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
 * of the four (RULES §Missions).
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
 * pairing is refused by a rule rather than by taste: a seized crate fills the
 * hold and so does a delivery crate ({@link CARGO_HOLD_CRATES} is 1), and a
 * pirate with freight of its own seizes nothing, so Deliver with Piracy is two
 * trips where the other pairings are one. That is the engine's own arithmetic,
 * not an opinion about balance, so the bot avoids it when the deal offers
 * anything else.
 *
 * @param pick chooses among the hands on offer; wire it to the game's seeded
 *   RNG so a seed replays exactly. Without one the first hand is taken, which
 *   keeps the function pure for tests.
 * @param hull a loadout already decided for this seat (the simulator forces one to
 *   measure it). Hands that loadout could never complete are skipped — the engine
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
  // once: the forced primary first, then the forced loadout. The last resort is a
  // hand of whatever was offered, which only a hand-built deal can reach —
  // every real deal holds three primaries and four secondaries.
  let hands = validHands(offers, hull, primary);
  if (hands.length === 0) hands = validHands(offers, hull);
  if (hands.length === 0) hands = validHands(offers, undefined, primary);
  if (hands.length === 0) hands = validHands(offers);
  if (hands.length === 0) return offers.slice(0, MISSIONS_PER_PLAYER);
  // A hold shared between a delivery crate and a seized one is two trips: skip
  // those hands while any other hand is on the table.
  const roomy = hands.filter((hand) => !holdIsContested(hand));
  const choose = roomy.length > 0 ? roomy : hands;
  return choose[pick ? pick(choose.length) : 0];
}

/** Deliver and Piracy both want the one crate the hold takes. */
function holdIsContested(hand: Mission[]): boolean {
  return hand.some((m) => m.type === "deliver_cargo") && hand.some((m) => m.type === "piracy");
}

/**
 * Every hand of one primary and {@link SECONDARIES_PER_PLAYER} secondaries the
 * loadout can fly, in a fixed order.
 *
 * "Can fly" is the engine's own rule and the only filter there is: a kept
 * Intercept needs a sensor array, a kept Destroy a gun, and a hand that breaks
 * that is refused at submission. With no loadout decided yet every hand is
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
    for (const kept of distinctSecondaries(secondaries, SECONDARIES_PER_PLAYER)) {
      const hand = [lead, ...kept];
      if (hull !== undefined && missionsMissingRequirements(hand, hull).length > 0) continue;
      hands.push(hand);
    }
  }
  return hands;
}

/**
 * Every way of taking `count` of the offered secondaries, no two of a kind —
 * the kept cards have to be that many different things to do (RULES
 * §Missions) — in the order they were dealt, so a seed keeps replaying the
 * same hand. Four cards off a pile of three kinds always hold a kind twice, so
 * at the standing two this is three pairs to five, never the six of four
 * different cards.
 */
function distinctSecondaries(offers: Mission[], count: number): Mission[][] {
  if (count <= 0) return [[]];
  const hands: Mission[][] = [];
  for (let i = 0; i <= offers.length - count; i++) {
    for (const rest of distinctSecondaries(offers.slice(i + 1), count - 1)) {
      if (rest.some((m) => m.type === offers[i].type)) continue;
      hands.push([offers[i], ...rest]);
    }
  }
  return hands;
}
