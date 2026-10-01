/**
 * Loadout phase: keep one primary and two secondaries of the cards dealt,
 * then a hull that fits them. Positions are unknown at this point (deployment
 * comes after loadout), so the choice is made from the cards alone: the hand
 * is picked by the game's seeded RNG among the flyable ones, and the hull
 * follows from the hand.
 */
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission, MissionType, SecondaryKind } from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import { isOpenMission } from "../types.ts";
import {
  MISSIONS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
} from "../../models/missions.ts";

/**
 * A hull is two decisions, both read off the hand. **The role** is the
 * forward subsystem, and the primary chooses it: a gun, eyes, or legs.
 * **The preset** is how the four side slots are spent, and the secondaries
 * choose it: each bow has three, one of them the default.
 *
 * | Role        | Forward    | Closes off                              |
 * |-------------|------------|-----------------------------------------|
 * | interceptor | sensor     | pays 3 fuel a jump                      |
 * | hunter      | railgun    | pays 3 fuel a jump                      |
 * | hauler      | compressor | cannot scan: no Intercept               |
 */
export type BotRole = "interceptor" | "hunter" | "hauler";
export type BotPresetId =
  | "gunship"
  | "brawler"
  | "missile-hunter"
  | "raider"
  | "watcher"
  | "picket"
  | "hauler"
  | "runner"
  | "privateer";

export const BOT_ROLES: readonly BotRole[] = ["interceptor", "hunter", "hauler"];

/** Each bow's three presets, the default first. */
export const PRESETS_BY_ROLE: Record<BotRole, readonly BotPresetId[]> = {
  hunter: ["gunship", "brawler", "missile-hunter"],
  interceptor: ["raider", "watcher", "picket"],
  hauler: ["hauler", "runner", "privateer"],
};

export const PRESET_NAMES: Record<BotPresetId, string> = {
  gunship: "Gunship",
  brawler: "Brawler",
  "missile-hunter": "Missile hunter",
  raider: "Raider",
  watcher: "Watcher",
  picket: "Missile picket",
  hauler: "Hauler",
  runner: "Runner",
  privateer: "Privateer",
};

export function presetRole(id: BotPresetId): BotRole {
  return BOT_ROLES.find((role) => PRESETS_BY_ROLE[role].includes(id))!;
}

/**
 * The nine loadouts, which are also the presets offered to a human on the
 * loadout screen, so the tables above, the subsystems below and the UI must
 * agree.
 *
 * **Every loadout carries a weapon that deals damage**, which is what a kept
 * Destroy card needs (RULES §Missions): the two roles that spend their forward
 * slot on eyes or legs buy theirs with a side slot.
 *
 * **Why the guns are paired.** A full shield subsystem holds four energy and absorbs
 * two damage, and its owner powers it again every turn, so a lone 2-damage
 * shot never reaches a hull. The railgun's four is exactly two shield subsystems, so it
 * wants a partner, and which partner depends on where the fight is: a laser
 * ignores shields (they are electromagnetic) and reaches two rings out, one
 * further than a rack, while a ballistic rack is the only broadside that deals
 * damage on the railgun's own ring, which is where the spinal shot puts the
 * fight.
 *
 * **Why the gunship carries a rack, and is the hunters' default.** Only the
 * gunship and the brawler carry a ballistic rack, and only a Piracy sends a
 * hunter to the brawler, so the gunship is where point defence lives in
 * natural play. When the default hunter carried two lasers no ship in natural
 * play carried a rack at all: missiles went unanswered, and the compressor
 * hull with two launchers became a 52% outlier. The laser in side-0 keeps the
 * shot that goes through shields and reaches a ring out; the rack in side-1
 * keeps point defence in the field and is the one broadside that deals damage
 * on the railgun's own ring. The brawler trades the laser for plasma. An earlier
 * mapping that sent Survey and Piracy hunters to missiles left a rack on 7%
 * of seats and moved dealt Destroy to 39% and Deliver to 30%, which is why
 * the gunship is the default and missiles fly only for a Salvage.
 *
 * **Why missiles are never a default.** Measured in duels against the
 * strongest off-book hull (a compressor bow with two ballistic racks, a
 * shield subsystem and a radiator), a missile-carrying hunter completed its
 * Destroy 34% of the time: a rack that is up rolls at the missiles that reach
 * it, so a salvo aimed at the one loadout built to answer it arrives as dice.
 * The missile hunter and the picket are for a Salvage, where the work is
 * finishing cripples at the wrecks from range.
 *
 * **Why the raider and the runner carry a disruptor.** Measured 1 Oct 2026
 * with the disruptor in the rack's box, 300 games a row with the role's card
 * dealt: the raider read 32% against an Intercept bar of 32 (two lasers in
 * place of the disruptor and the plasma, 29%); the runner 35% against a
 * Deliver bar of 36 (with a launcher in place of the disruptor, 33%). A
 * runner is carrying something worth chasing, and breaking the pursuer's
 * engines is how it keeps it.
 *
 * **Why every loadout carries a radiator.** Using a subsystem costs its energy in heat,
 * and heat the ship cannot dissipate is carried, so a hull that makes more than
 * it sheds walks up to the redline and pays there. The railgun plus one
 * broadside is six against a dissipation of five; the radiator's +2 makes that
 * pair free. The gunship's full three-gun volley is eight, one over even
 * then: firing everything is a decision, not a default.
 *
 * Mutable on purpose: the simulator's `--loadouts=` writes into it.
 */
export const BOT_PRESET_LOADOUTS: Record<BotPresetId, ShipLoadout> = {
  gunship: {
    forwardSlots: ["railgun"],
    sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
  },
  brawler: {
    forwardSlots: ["railgun"],
    sideSlots: ["plasma_cannon", "ballistic_rack", "shields", "radiator"],
  },
  "missile-hunter": {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "laser", "shields", "radiator"],
  },
  raider: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "disruptor", "radiator", "plasma_cannon"],
  },
  watcher: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "shields", "radiator", "laser"],
  },
  picket: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["missiles", "missiles", "radiator", "shields"],
  },
  hauler: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "shields", "radiator", "laser"],
  },
  runner: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "disruptor", "radiator", "laser"],
  },
  privateer: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "shields", "radiator", "plasma_cannon"],
  },
};

function count(missions: Mission[], ...types: Mission["type"][]): number {
  return missions.filter((m) => types.includes(m.type)).length;
}

/**
 * The role is the forward subsystem, and the primary decides it. Intercept
 * cannot start without a scan, so that card takes the eyes. A Destroy card has
 * to catch someone and get through their shields, which is what the railgun's
 * four damage is for, while a cargo run would rather not pay three fuel a
 * jump. A Survey is a dive any loadout can make, so the secondaries never
 * move the bow.
 */
export function classifyRole(missions: Mission[]): BotRole {
  const active = missions.filter(isOpenMission);
  if (count(active, "intercept_transmission") > 0) return "interceptor";
  if (count(active, "destroy_ship") > 0) return "hunter";
  return "hauler";
}

/**
 * What each secondary asks of the side slots, bow by bow, as a player would
 * fit for it. A card not named here asks for the bow's default.
 *
 * - Hunter: a Piracy is a point-blank fight with a carrier, so plasma
 *   (brawler); a Salvage is finishing cripples at the wrecks, from range, so
 *   a launcher (missile hunter).
 * - Interceptor: an Escort rides beside a carrier with its walls up
 *   (watcher); a Salvage wants the reach of two launchers (picket).
 * - Hauler: a Piracy takes a fight to a carrier (privateer); a Tanker or a
 *   Salvage is carrying something worth chasing, and the disruptor breaks
 *   the pursuer's engines (runner).
 */
const KIT: Record<BotRole, Partial<Record<SecondaryKind, BotPresetId>>> = {
  hunter: { piracy: "brawler", salvage: "missile-hunter" },
  interceptor: { escort: "watcher", salvage: "picket" },
  hauler: { piracy: "privateer", tanker: "runner", salvage: "runner" },
};

/** When the two secondaries ask for different kits, the earlier card decides. */
const KIT_PRIORITY: readonly SecondaryKind[] = ["piracy", "salvage", "escort", "tanker", "survey"];

/**
 * The preset a hand flies: the bow's default unless an open secondary asks
 * for another, the higher card in {@link KIT_PRIORITY} deciding between two.
 *
 * Measured 1 Oct 2026, 1000 games a row: dealt Destroy / Deliver / Intercept
 * 37 / 32 / 33% against 35 / 34 / 33 with the six presets this replaced.
 * Natural play keeps a rack on 21–25% of seats, and racks shoot down 1.2 of
 * 7.8 missiles a game at three seats. Forced, every preset flown with its
 * bow's card reads 32–37%.
 */
export function classifyPreset(missions: Mission[]): BotPresetId {
  const role = classifyRole(missions);
  const fallback = PRESETS_BY_ROLE[role][0];
  const open = missions.filter((m) => !m.isCompleted);
  for (const kind of KIT_PRIORITY) {
    const ask = KIT[role][kind];
    if (ask && ask !== fallback && count(open, kind) > 0) return ask;
  }
  return fallback;
}

export function selectBotLoadout(missions: Mission[]): ShipLoadout {
  return BOT_PRESET_LOADOUTS[classifyPreset(missions)];
}

/**
 * The hand a bot keeps: one primary of the three it was dealt, two secondaries
 * of the three (RULES §Missions).
 *
 * **The primary is still chosen at random among the three.** Deliberately. The
 * bot used to score every combination against a table of hand-tuned costs,
 * which meant every seat at every table reached for the same plan and the
 * benchmark restated what the scorer believed instead of measuring the game. A
 * plan the bots never choose is a plan nobody can measure, and the weakest
 * primary is exactly the one a scorer would drop and the one the designer needs
 * numbers for. So the spread stays.
 *
 * The secondaries are chosen the same way, at random among the legal hands.
 * Deliver with Piracy was refused while the hold took one crate (two trips
 * where the other pairings were one); with no limit on the hold nothing is
 * shared and nothing is refused.
 *
 * @param pick chooses among the hands on offer; wire it to the game's seeded
 *   RNG so a seed replays exactly. Without one the first hand is taken, which
 *   keeps the function pure for tests.
 * @param hull a loadout already decided for this seat (the simulator forces one to
 *   measure it). Hands that loadout could never complete are skipped: the engine
 *   refuses them anyway. A deal with no flyable hand falls back to the first.
 * @param primary experiment only: keep this kind of primary. Ignored when the
 *   deal does not offer one, so a batch never stalls on a seed.
 */
export function selectBotMissions(
  offers: Mission[],
  hull?: ShipLoadout,
  primary?: MissionType,
  pick?: (n: number) => number
): Mission[] {
  if (offers.length <= MISSIONS_PER_PLAYER) return offers;
  // Give up the experiment's constraints one at a time rather than all at
  // once: the forced primary first, then the forced loadout. The last resort is a
  // hand of whatever was offered, which only a hand-built deal can reach:
  // every real deal holds three primaries and three secondaries.
  let hands = validHands(offers, hull, primary);
  if (hands.length === 0) hands = validHands(offers, hull);
  if (hands.length === 0) hands = validHands(offers, undefined, primary);
  if (hands.length === 0) hands = validHands(offers);
  if (hands.length === 0) return offers.slice(0, MISSIONS_PER_PLAYER);
  return hands[pick ? pick(hands.length) : 0];
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
    for (const kept of secondaryCombinations(secondaries, SECONDARIES_PER_PLAYER)) {
      const hand = [lead, ...kept];
      if (hull !== undefined && missionsMissingRequirements(hand, hull).length > 0) continue;
      hands.push(hand);
    }
  }
  return hands;
}

/**
 * Every way of taking `count` of the offered secondaries, in the order they
 * were dealt, so a seed keeps replaying the same hand. Two of a kind are
 * allowed (RULES §Missions): the pile is shuffled, so a seat can be dealt
 * three of one kind, and a hand keeps any two.
 */
function secondaryCombinations(offers: Mission[], count: number): Mission[][] {
  if (count <= 0) return [[]];
  const hands: Mission[][] = [];
  for (let i = 0; i <= offers.length - count; i++) {
    for (const rest of secondaryCombinations(offers.slice(i + 1), count - 1)) {
      hands.push([offers[i], ...rest]);
    }
  }
  return hands;
}
