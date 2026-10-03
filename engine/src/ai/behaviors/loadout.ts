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
 * A hull is two decisions, both read off the hand. **The role** is the plan
 * the primary asks for, and it is a list of presets. **The preset** is the
 * hull itself, and the secondaries choose it among the role's list, the first
 * being the default. A preset's role is the list it is in, never its bow: the
 * corsair flies a missile bow and the warden a disruptor bow, and both hunt.
 */
export type BotRole = "interceptor" | "hunter" | "hauler";
export type BotPresetId =
  | "gunship"
  | "corsair"
  | "striker"
  | "warden"
  | "raider"
  | "jammer"
  | "picket"
  | "sentry"
  | "freighter"
  | "privateer"
  | "smuggler"
  | "ghost";

export const BOT_ROLES: readonly BotRole[] = ["interceptor", "hunter", "hauler"];

/** Each role's presets, the default first. */
export const PRESETS_BY_ROLE: Record<BotRole, readonly BotPresetId[]> = {
  hunter: ["gunship", "corsair", "striker", "warden"],
  interceptor: ["raider", "jammer", "picket", "sentry"],
  hauler: ["freighter", "privateer", "smuggler", "ghost"],
};

export const PRESET_NAMES: Record<BotPresetId, string> = {
  gunship: "Gunship",
  corsair: "Corsair",
  striker: "Striker",
  warden: "Warden",
  raider: "Raider",
  jammer: "Jammer",
  picket: "Picket",
  sentry: "Sentry",
  freighter: "Freighter",
  privateer: "Privateer",
  smuggler: "Smuggler",
  ghost: "Ghost",
};

export function presetRole(id: BotPresetId): BotRole {
  return BOT_ROLES.find((role) => PRESETS_BY_ROLE[role].includes(id))!;
}

/**
 * The twelve loadouts, which are also the presets offered to a human on the
 * loadout screen, so the tables above, the subsystems below and the UI must
 * agree.
 *
 * **Every hunter carries a weapon that deals damage**, which is what a kept
 * Destroy card needs (RULES §Missions), and a Destroy always makes the hand a
 * hunter. The jammer and the ghost carry none: their disruptors break
 * subsystems and never a hull.
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
 * **Why the gunship carries a rack, and is the hunters' default.** The
 * gunship, the corsair and the sentry carry the only racks, so the default
 * hunter is where point defence lives in natural play. When the default
 * hunter carried two lasers no ship in natural play carried a rack at all:
 * missiles went unanswered, and the compressor hull with two launchers became
 * a 52% outlier. An earlier mapping that sent Survey and Piracy hunters to
 * missiles left a rack on 7% of seats, which is why the gunship is the
 * default and a Survey never asks for a launcher.
 *
 * **Why missiles are never a default.** Measured in duels against the
 * strongest off-book hull (a compressor bow with two ballistic racks, a
 * shield subsystem and a radiator), a missile-carrying hunter completed its
 * Destroy 34% of the time: a rack that is up rolls at the missiles that reach
 * it, so a salvo aimed at the one loadout built to answer it arrives as dice.
 * The corsair runs carriers down for a Piracy; the striker, the picket and
 * the smuggler are for a Salvage, where the work is finishing cripples at the
 * wrecks from range.
 *
 * **Why every loadout carries a radiator.** Using a subsystem costs its energy in heat,
 * and heat the ship cannot dissipate is carried, so a hull that makes more than
 * it sheds walks up to the redline and pays there. The railgun plus one
 * broadside is six against a dissipation of five; the radiator's +2 makes that
 * pair free. The gunship's full three-gun volley is eight, one over even
 * then: firing everything is a decision, not a default.
 *
 * **What was left out.** The variety probe (1000 games a hull at three seats,
 * 600 at four) found hunters without walls and with missile or disruptor bows
 * at or above the old gunship and brawler, which is where the corsair and the
 * warden come from. The missile boat (missile bow, missiles×2, radiator,
 * shields: 45 / 38% at three / four seats), the sensor bow with three
 * launchers (46 / 37%) and the gunless turtles (interceptor 38 / 31%, hauler
 * 42 / 41%) are strong in every kind of game, so they are not presets; the
 * rack wall (20 / 17%) is weak.
 *
 * Mutable on purpose: the simulator's `--loadouts=` writes into it.
 */
export const BOT_PRESET_LOADOUTS: Record<BotPresetId, ShipLoadout> = {
  gunship: {
    forwardSlots: ["railgun"],
    sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
  },
  corsair: {
    forwardSlots: ["missiles"],
    sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
  },
  striker: {
    forwardSlots: ["railgun"],
    sideSlots: ["missiles", "laser", "shields", "radiator"],
  },
  warden: {
    forwardSlots: ["disruptor"],
    sideSlots: ["plasma_cannon", "plasma_cannon", "shields", "radiator"],
  },
  raider: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "disruptor", "radiator", "plasma_cannon"],
  },
  jammer: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["disruptor", "disruptor", "shields", "radiator"],
  },
  picket: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["missiles", "missiles", "radiator", "shields"],
  },
  sentry: {
    forwardSlots: ["sensor_array"],
    sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
  },
  freighter: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "shields", "radiator", "laser"],
  },
  privateer: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["shields", "shields", "radiator", "plasma_cannon"],
  },
  smuggler: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["missiles", "missiles", "radiator", "shields"],
  },
  ghost: {
    forwardSlots: ["fuel_compressor"],
    sideSlots: ["disruptor", "disruptor", "radiator", "radiator"],
  },
};

function count(missions: Mission[], ...types: Mission["type"][]): number {
  return missions.filter((m) => types.includes(m.type)).length;
}

/**
 * The role is the plan, and the primary decides it: Intercept hunts with
 * scans, Destroy with guns, anything else hauls. A Survey is a dive any
 * loadout can make, so the secondaries never move the role.
 */
export function classifyRole(missions: Mission[]): BotRole {
  const active = missions.filter(isOpenMission);
  if (count(active, "intercept_transmission") > 0) return "interceptor";
  if (count(active, "destroy_ship") > 0) return "hunter";
  return "hauler";
}

/**
 * What each secondary asks of the hull, role by role, as a player would
 * fit for it. A card not named here asks for the role's default.
 *
 * - Piracy runs a carrier down: the corsair, the jammer, the privateer.
 * - Salvage finishes cripples at the wrecks from range, so launchers: the
 *   striker, the picket, the smuggler.
 * - Escort rides beside a carrier: the warden and the sentry. A hauler
 *   escorts in its own freighter.
 * - Tanker carries fuel worth chasing, and a hauler's two disruptors break
 *   the pursuer (the ghost).
 */
const KIT: Record<BotRole, Partial<Record<SecondaryKind, BotPresetId>>> = {
  hunter: { piracy: "corsair", salvage: "striker", escort: "warden" },
  interceptor: { piracy: "jammer", salvage: "picket", escort: "sentry" },
  hauler: { piracy: "privateer", salvage: "smuggler", tanker: "ghost" },
};

/** When the two secondaries ask for different kits, the earlier card decides. */
const KIT_PRIORITY: readonly SecondaryKind[] = ["piracy", "salvage", "escort", "survey", "tanker"];

/**
 * The preset a hand flies: the role's default unless an open secondary asks
 * for another, the higher card in {@link KIT_PRIORITY} deciding between two.
 *
 * Measured 2 Oct 2026 in place of the nine presets (three a role). Forced
 * with each role's card, 1000 games a row, every preset sits within 4 points
 * of its bar: gunship 33, corsair 32, striker 38, warden 34 against a Destroy
 * bar of 35; raider 28, jammer 32, picket 31, sentry 29 against Intercept 32;
 * freighter 33, privateer 34, smuggler 36, ghost 36 against Deliver 36. Dealt
 * Destroy / Deliver / Intercept 35 / 36 / 32% (34 / 32 / 34 with the nine).
 * Natural play: missiles on 38–40% of seats (19–22 before), racks 21–25%
 * (unchanged), railguns 13–14% (29–34), kills 1.6 / 2.9 at three / four seats
 * (1.8 / 4.1), rounds unchanged. A first draft that also sent Survey to the
 * missile presets put missiles on 47% of seats, launched 21–28 a game, and
 * racks shot down one in ten.
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
