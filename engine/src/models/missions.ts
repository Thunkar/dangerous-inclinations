/**
 * Missions: secret objectives. First player to reach the points to win
 * (`GameState.pointsToWin`, three) triggers the final round.
 *
 * Eight mission types, in two kinds:
 *   primaries (2 points): destroy_ship, deliver_cargo, intercept_transmission
 *   secondaries (1 point): survey, piracy, tanker, escort, salvage
 *
 * Completed missions are face-up: everyone can see them.
 */

import type { SubsystemType } from "./subsystems.ts";
import { WEAPON_SUBSYSTEM_TYPES } from "./subsystems.ts";

/**
 * Three points win by default, and a hand is one primary and two secondaries:
 * four held for the three that win. The hand is unchanged by the
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
/** Dealt from the shuffled secondary pile, a card at a time round the table. */
export const SECONDARY_OFFERS_PER_PLAYER = 3;
/**
 * Copies of each secondary kind in the printed pile. A full table is dealt
 * three a seat (eighteen), and five kinds of four is twenty.
 */
export const SECONDARY_COPIES_PER_KIND = 4;
export const SECONDARIES_PER_PLAYER = 2;

export const MISSIONS_PER_PLAYER = PRIMARIES_PER_PLAYER + SECONDARIES_PER_PLAYER;
export const MISSION_OFFERS_PER_PLAYER =
  PRIMARY_OFFERS_PER_PLAYER + SECONDARY_OFFERS_PER_PLAYER;

/** Black hole ring a ship must end its turn on to complete a Survey. */
export const SURVEY_RING = 1;

/**
 * Fuel a Tanker hands in, in one go, on arrival at a station. It was 8 while a
 * Deliver crate and the fuel could change hands on the same visit; with the
 * two on separate visits, 7 gives back about half the length that cost.
 */
export const TANKER_FUEL = 6;

/**
 * What a completed card scores: two for a primary (Destroy for the hunter,
 * Deliver for the hauler, Intercept for the interceptor), one for a secondary.
 * A hand is one primary and two secondaries, so the primary and either
 * secondary is the win.
 */
export const MISSION_POINTS: Readonly<Record<MissionType, number>> = {
  destroy_ship: 2,
  deliver_cargo: 2,
  intercept_transmission: 2,
  survey: 1,
  piracy: 1,
  tanker: 1,
  escort: 1,
  salvage: 1,
};

export function missionPoints(type: MissionType): number {
  return MISSION_POINTS[type];
}

/**
 * What a station buys (RULES §Stations): one item from each player, once per
 * game. A sale is one item handed in (a Deliver crate at its destination, a
 * piece of data filed, loot sold) or a Tanker's fuel pumped; after it, that
 * station buys nothing more from that player. Loading a crate is not a sale.
 *
 * A `dock_sale` action names the sale: the item's cargo id, {@link SELL_FUEL}
 * for the Tanker's pump, or {@link SELL_NOTHING}.
 */
export const SELL_FUEL = "fuel";
export const SELL_NOTHING = "none";
/** What a `dock_sale` action names to load the crates waiting at the station instead of selling. */
export const LOAD_CRATES = "load";

/** Scan range for the scan action (same ring, ±sectors). */
export const SCAN_SECTOR_RANGE = 3;

export type MissionType =
  | "destroy_ship"
  | "deliver_cargo"
  | "intercept_transmission"
  | "survey"
  | "piracy"
  | "tanker"
  | "escort"
  | "salvage";

/** The secondary kinds, in the order the printed pile lists them. */
export const SECONDARY_KINDS_PRINTED: readonly SecondaryKind[] = [
  "survey",
  "piracy",
  "tanker",
  "escort",
  "salvage",
];
export type SecondaryKind = "survey" | "piracy" | "tanker" | "escort" | "salvage";

/**
 * What a card is printed as: its title strip and its colour. The three
 * primaries are three ways of playing (the kill, the cargo run, the stolen
 * transmission), so each is its own family; the secondaries share one.
 */
export type MissionFamily = "combat" | "trade" | "intel" | "secondary";

export const MISSION_FAMILY: Record<MissionType, MissionFamily> = {
  destroy_ship: "combat",
  deliver_cargo: "trade",
  intercept_transmission: "intel",
  survey: "secondary",
  piracy: "secondary",
  tanker: "secondary",
  escort: "secondary",
  salvage: "secondary",
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
  escort: [],
  salvage: [],
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
  /** Id the transmission takes aboard; whether it is aboard is {@link dataAboard}. */
  dataCargoId: string;
}

/**
 * Survey: end a turn on the black hole's innermost ring, take the data, then
 * file it at any station.
 *
 * It asks for no tile and cannot be blocked, which is why it is worth a point
 * rather than two: the two secondaries a hand keeps are two points, one short
 * of the win, so the primary is the card that has to come in.
 */
export interface SurveyMission extends BaseMission {
  type: "survey";
  /** Id the readings take aboard; whether they are aboard is {@link dataAboard}. */
  dataCargoId: string;
}

/**
 * Piracy: end a turn, not moored, on an undocked ship carrying cargo and you
 * may take one item of your choice from it (a `seize` action); sell it at any
 * station.
 *
 * The only secondary card somebody else pays for. Neither ship may be moored:
 * a berth is not a place cargo changes hands. What the victim loses goes back
 * to undone: a Deliver reloads at its station, a Survey dives again, an
 * Intercept scans again.
 *
 * The loot rides as {@link cargoId} whatever was taken (loot to everyone
 * watching, sold at *any* station), and the card is done when it is sold.
 * Destroyed with it aboard, the loot goes over the side, and loot on a pirate
 * is loot another pirate can take.
 */
export interface PiracyMission extends BaseMission {
  type: "piracy";
  /** Id the loot takes aboard the pirate. */
  cargoId: string;
}

/**
 * Tanker: arrive at a station with {@link TANKER_FUEL} or more in the tank and
 * pump it in; the card is done.
 *
 * Nothing is carried: a full tank is the whole cost, and the pump is the
 * station's one sale to this player ({@link SELL_FUEL}). It competes with the
 * hold for the station, not for space, and with every burn for everything.
 */
export interface TankerMission extends BaseMission {
  type: "tanker";
}

/**
 * Escort: end a turn, not moored, in the same sector as an undocked rival
 * carrying cargo (a crate or data, loot included) with the marker in hand,
 * and you may put it on that ship, face-up for the table (the `escort_mark`
 * action). The next time that ship delivers, sells or files anything, or
 * pumps a Tanker's fuel, at a station, the card is done. If the marked ship
 * is destroyed first, the
 * marker comes back and the card is undone. A second Escort marks a
 * different ship.
 */
export interface EscortMission extends BaseMission {
  type: "escort";
  /** The ship carrying this card's marker, or null while the marker is in hand. */
  markedPlayerId: string | null;
}

/**
 * Salvage: end a turn on a wreck's sector holding an undone Salvage: take its
 * black box. It is data, and a pirate can seize it. File it at any station
 * and the card is done. One wreck a turn. Rides as {@link cargoId}, data
 * filed at "any" station.
 */
export interface SalvageMission extends BaseMission {
  type: "salvage";
  /** Id the wreck's black box takes aboard. */
  cargoId: string;
}

export type Mission =
  | DestroyShipMission
  | DeliverCargoMission
  | InterceptTransmissionMission
  | SurveyMission
  | PiracyMission
  | TankerMission
  | EscortMission
  | SalvageMission;

export type CargoKind = "crate" | "data";

/**
 * Something a ship carries.
 * - crate: a Deliver mission's, picked up at its origin station; or Piracy's
 *   loot, which sells at any station.
 * - data: an Intercept's scan (filed at the card's station), a Survey's
 *   readings or Salvage's black box (filed at any station).
 * Destroyed ships drop everything: a Deliver crate goes back to its origin,
 * everything else is lost. The hold has no limit.
 *
 * The id is an opaque token dealt with the card (`dealMissionOffers`,
 * game/missions/missionDeck.ts): the table sees an item's id and its kind,
 * never the card behind it, so two pieces of data aboard a rival do not say
 * which is an Intercept's.
 */
export interface Cargo {
  id: string;
  kind: CargoKind;
  /** Mission this item belongs to. Private: never in a rival's view. */
  missionId: string;
  /** Planet whose station it is collected at; absent for a seized crate. */
  pickupPlanetId?: string;
  /** Planet id, or "any". */
  deliveryPlanetId: string;
  isPickedUp: boolean;
}

/** The items in the hold, as opposed to those waiting on a dock or lost. */
export function aboard(cargo: readonly Cargo[]): Cargo[] {
  return cargo.filter((c) => c.isPickedUp);
}

/**
 * Whether an Intercept's transmission or a Survey's readings are in the hold:
 * the card's thing has been done and its data not yet filed. A pirate who
 * takes it, or a kill, puts the card back to undone by taking the data.
 */
export function dataAboard(
  player: { readonly cargo: readonly Cargo[] },
  mission: InterceptTransmissionMission | SurveyMission
): boolean {
  return player.cargo.some((c) => c.id === mission.dataCargoId && c.isPickedUp);
}

/**
 * What an item aboard is to the table: a Deliver crate, loot (a seized item,
 * which rides as a crate with no pickup station), or data.
 */
export type HoldItemKind = "crate" | "loot" | "data";

export function holdItemKind(item: Cargo): HoldItemKind {
  if (item.kind === "data") return "data";
  return item.pickupPlanetId === undefined ? "loot" : "crate";
}

/** What a sale hands in: an item from the hold, or a Tanker's fuel. */
export type SaleKind = HoldItemKind | "fuel";

export function missionTargetsPlayer(
  mission: Mission
): mission is DestroyShipMission | InterceptTransmissionMission {
  return mission.type === "destroy_ship" || mission.type === "intercept_transmission";
}

export function isInterceptTransmissionMission(m: Mission): m is InterceptTransmissionMission {
  return m.type === "intercept_transmission";
}
export function isSurveyMission(m: Mission): m is SurveyMission {
  return m.type === "survey";
}
