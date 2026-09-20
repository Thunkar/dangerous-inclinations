/**
 * Missions: secret objectives. First player to reach the points to win
 * (`GameState.pointsToWin`, three) triggers the final round.
 *
 * Six mission types, in two kinds:
 *   primaries (2 points): destroy_ship, deliver_cargo, intercept_transmission
 *   secondaries (1 point): survey, piracy, tanker
 *
 * Completed missions are face-up: everyone can see them.
 */

import type { SubsystemType } from "./subsystems.ts";
import { WEAPON_SUBSYSTEM_TYPES } from "./subsystems.ts";

/**
 * Three points win by default, and a hand is one primary and two secondaries:
 * five on the table for the three that win. The hand is unchanged by the
 * number: a primary and either secondary is a win, and the other secondary is
 * the spare a player takes when the game puts it in their way. Two secondaries
 * on their own are two points and cannot win, so the primary somebody else set
 * you is still the card that has to come in. Each deck is dealt separately:
 * three primaries to choose one from, three secondaries to choose two from.
 *
 * **Three, and no option.** Four was offered as a longer evening and cut:
 * measured on 200-game rows it ran 41 to 49 rounds by seat count with games
 * still unfinished at the cap, where three runs 27 rounds at every seat count
 * and every game finishes. What three buys is the spare, and with it a
 * decision about whether the third card is worth the detour. The number still
 * rides on the game (`GameState.pointsToWin`) and everything downstream reads
 * it from there, so the simulator can play a batch to another number
 * (`--rules=missionsToWin=`) without a table ever being offered one.
 *
 * **Why two decks.** Dealing five from one pile and keeping any three looked
 * like a choice and was not. Because primaries are most of the deck, 94% of
 * hands at three seats and 98% at six could take three of them, and three
 * primaries was the only shape with a spare: when four points won, six on the
 * table meant any two of the three would do. So almost every seat was offered
 * the same plan and took it, the secondaries were the cards you kept when the
 * deal failed you, and the decision was which cards rather than which kind of
 * game. Measured over 4,000 deals, the second-best hand available sat 10
 * points behind the best: a lock-in wearing the costume of a choice.
 *
 * Splitting the decks fixes the shape and hands the choice back as content.
 * Every seat gets the same frame (one primary somebody set you, two things you
 * do yourself) and picks inside it: the gap to the second-best hand halves.
 */
export const DEFAULT_POINTS_TO_WIN = 3;


/** Dealt from the primary deck, and kept from that deal. */
export const PRIMARY_OFFERS_PER_PLAYER = 3;
export const PRIMARIES_PER_PLAYER = 1;
/**
 * One of each kind for every seat, and kept from that offer. This is the
 * number of kinds. Keep it in step with what {@link buildSecondaryDeck}
 * prints.
 */
export const SECONDARY_OFFERS_PER_PLAYER = 3;
export const SECONDARIES_PER_PLAYER = 2;

export const MISSIONS_PER_PLAYER = PRIMARIES_PER_PLAYER + SECONDARIES_PER_PLAYER;
export const MISSION_OFFERS_PER_PLAYER =
  PRIMARY_OFFERS_PER_PLAYER + SECONDARY_OFFERS_PER_PLAYER;

/** Black hole ring a ship must end its turn on to complete a Survey. */
export const SURVEY_RING = 1;

/** Fuel a Tanker hands in, in one go, on arrival at a station. */
export const TANKER_FUEL = 8;

/**
 * What a completed card scores.
 *
 * One card at two points for each way of playing: Destroy for the hunter,
 * Deliver for the hauler, Intercept for the interceptor. Two of your own kind
 * is a win, so a hand states an intention instead of collecting whatever was
 * cheapest. Survey is the odd one at a point: a dive nobody has to cooperate
 * with, which is exactly why it is not a plan of its own.
 */
export const MISSION_POINTS: Readonly<Record<MissionType, number>> = {
  destroy_ship: 2,
  deliver_cargo: 2,
  intercept_transmission: 2,
  survey: 1,
  piracy: 1,
  tanker: 1,
};

export function missionPoints(type: MissionType): number {
  return MISSION_POINTS[type];
}

/**
 * Crates a hold takes. One: a crate is the size of the hold, so a second
 * route waits until the first is delivered, and two cards that load at the
 * same station are two trips rather than one.
 *
 * Data chits ride free (a scan's transmission and a survey's readings are
 * numbers, not freight), so an Intercept or a Survey can always be carried
 * alongside whatever is in the hold.
 */
export const CARGO_HOLD_CRATES = 1;
/** Scan range for the scan action (same ring, ±sectors). */
export const SCAN_SECTOR_RANGE = 3;

export type MissionType =
  | "destroy_ship"
  | "deliver_cargo"
  | "intercept_transmission"
  | "survey"
  | "piracy"
  | "tanker";

/**
 * The one-point cards that pay a chit: do the thing, take the chit, file it at
 * any station. Survey is the only one left: Piracy pays a crate somebody else
 * loaded and Tanker pays nothing at all, so neither has a chit to file.
 */
export type SecondaryMissionType = "survey";
export const SECONDARY_MISSION_TYPES: readonly SecondaryMissionType[] = ["survey"];

export type MissionFamily = "combat" | "trade" | "secondary";

export const MISSION_FAMILY: Record<MissionType, MissionFamily> = {
  destroy_ship: "combat",
  deliver_cargo: "trade",
  intercept_transmission: "trade",
  survey: "secondary",
  piracy: "secondary",
  tanker: "secondary",
};

/** A card that scores two: the primary mission somebody else set you. */
export function isPrimaryType(type: MissionType): boolean {
  return MISSION_FAMILY[type] !== "secondary";
}

/**
 * One thing a card cannot be completed without.
 *
 * `anyOf` lists the tiles that satisfy it and **one of them is enough**, so a
 * card that needs several different tiles carries several requirements and a
 * card that accepts any of a family carries one. `label` is the bare noun to
 * call it by at the table ("weapon" is what a player needs to hear, not four
 * tile names), and the names behind it are `anyOf` (see
 * `describeMissionRequirement`, game/describe.ts).
 */
export interface MissionRequirement {
  label: string;
  anyOf: readonly SubsystemType[];
}

const SENSOR_ARRAY: MissionRequirement = { label: "sensor array", anyOf: ["sensor_array"] };
const WEAPON: MissionRequirement = { label: "weapon", anyOf: WEAPON_SUBSYSTEM_TYPES };

/**
 * What each card needs aboard to be completable at all.
 *
 * An Intercept opens with a scan, so it is dead weight on a loadout with no
 * sensor array. A Destroy is completed by reducing a hull to 0 yourself, and
 * only a weapon or a missile credits a kill (heat kills nobody's target), so
 * it needs any one gun. A loadout is fixed for the game and a station repairs tiles, it never
 * fits one. This is the single table the rule lives in: the referee refuses
 * a submission that breaks it (`missionsMissingRequirements`, game/loadout.ts)
 * and the loadout screen reads the same list while you choose.
 */
export const MISSION_REQUIREMENTS: Readonly<Record<MissionType, readonly MissionRequirement[]>> = {
  destroy_ship: [WEAPON],
  deliver_cargo: [],
  intercept_transmission: [SENSOR_ARRAY],
  // The secondary cards ask for nothing aboard: they are flown, not fitted, which
  // is what lets any hand carry one as its third.
  piracy: [],
  tanker: [],
  // Nothing. A Survey is flown, not instrumented: the dive to the innermost
  // ring is the reading. It asked for a sensor array until 17 Sept 2026, which
  // made the one card any hand could use as filler a card only the sensor loadouts
  // could keep, and left half the table with no filler at all.
  survey: [],
};

/** What a card needs aboard; empty for cards any hull can fly. */
export function missionRequirements(type: MissionType): readonly MissionRequirement[] {
  return MISSION_REQUIREMENTS[type];
}

interface BaseMission {
  id: string;
  type: MissionType;
  isCompleted: boolean;
}

/** Reduce the target's hull to 0. */
export interface DestroyShipMission extends BaseMission {
  type: "destroy_ship";
  targetPlayerId: string;
}

/** Dock at the pickup station, then dock at the delivery station with the crate. */
export interface DeliverCargoMission extends BaseMission {
  type: "deliver_cargo";
  pickupPlanetId: string;
  deliveryPlanetId: string;
  cargoId: string;
}

/**
 * Scan the target, then file what you took at the station the card names.
 *
 * The station is the card's, fixed when it is dealt. Filing anywhere made this
 * the cheapest two points on the table (a scan and then whatever dock the
 * route passed anyway), and it took over half of all winning cards (measured
 * 17 Sept 2026). Every two-point card names what it wants now.
 */
export interface InterceptTransmissionMission extends BaseMission {
  type: "intercept_transmission";
  targetPlayerId: string;
  /** Planet whose station the transmission is filed at. */
  deliveryPlanetId: string;
  scanAcquired: boolean;
  dataCargoId: string;
}

/**
 * A secondary card that pays a chit: do the thing, take the chit, file it at
 * any station.
 *
 * Survey is the one card of this shape: end a turn on the black hole's
 * innermost ring, then dock anywhere. It asks for no tile and cannot be
 * blocked, which is why it is worth a point rather than two: the two
 * secondaries a hand keeps are two points, one short of the win, so the
 * primary is the card that has to come in.
 */
export interface SecondaryMission extends BaseMission {
  type: SecondaryMissionType;
  /** Always "any": a chit is filed wherever the ship next docks. */
  deliveryPlanetId: string;
  /** The thing has been done and the chit is aboard. */
  acquired: boolean;
  dataCargoId: string;
}

/**
 * Piracy: end a turn in the same sector as a ship carrying a crate or a data
 * chit and the loot is yours; sell it at any station.
 *
 * The only secondary card that uses the hold, and the only one somebody else
 * pays for. A pirate needs room ({@link CARGO_HOLD_CRATES} is one, so a
 * pirate already carrying a crate takes nothing), and neither ship may be
 * moored: a berth is not a place cargo changes hands. A crate first when the
 * mark carries both, and what the victim loses goes back to undone: a Deliver
 * reloads at its station, a Survey dives again, an Intercept scans again.
 *
 * The loot rides as {@link cargoId} whatever was taken (a crate to everyone
 * watching, delivered at *any* station), and the card is done when it is sold.
 * Destroyed with it aboard, the loot goes over the side, and a crate on a
 * pirate is a crate another pirate can take.
 */
export interface PiracyMission extends BaseMission {
  type: "piracy";
  /** Id the seized crate takes aboard the pirate. */
  cargoId: string;
}

/**
 * Tanker: arrive at a station with {@link TANKER_FUEL} or more in the tank and
 * pump it in; the card is done.
 *
 * Nothing is carried and nothing is chosen: a full tank is the whole cost,
 * and the card is paid the moment the ship makes port with one. It is the
 * secondary that competes with the hold for nothing at all and with every
 * burn for everything.
 */
export interface TankerMission extends BaseMission {
  type: "tanker";
}

export type Mission =
  | DestroyShipMission
  | DeliverCargoMission
  | InterceptTransmissionMission
  | SecondaryMission
  | PiracyMission
  | TankerMission;

export type CargoKind = "crate" | "data";

/**
 * Something a ship carries.
 * - crate: belongs to a Deliver mission; picked up at its origin station.
 * - data: from a scan or survey; delivered at any station.
 * Destroyed ships drop everything: crates go back to their origin, data is lost.
 */
export interface Cargo {
  id: string;
  kind: CargoKind;
  /** Mission this item belongs to. */
  missionId: string;
  /** Planet whose station it is collected at; absent for a seized crate. */
  pickupPlanetId?: string;
  /** Planet id, or "any". */
  deliveryPlanetId: string;
  isPickedUp: boolean;
}

export function missionTargetsPlayer(
  mission: Mission
): mission is DestroyShipMission | InterceptTransmissionMission {
  return mission.type === "destroy_ship" || mission.type === "intercept_transmission";
}

export function isInterceptTransmissionMission(m: Mission): m is InterceptTransmissionMission {
  return m.type === "intercept_transmission";
}
/** The secondary cards that pay a chit (not Piracy or Tanker, which pay neither). */
export function isSecondaryMission(m: Mission): m is SecondaryMission {
  return m.type === "survey";
}
