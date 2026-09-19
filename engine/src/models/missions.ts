/**
 * Missions: secret objectives. First player to complete MISSIONS_TO_WIN wins.
 *
 * Six mission types, in two kinds:
 *   primaries (2 points): destroy_ship, deliver_cargo, intercept_transmission
 *   secondaries (1 point): survey, board, garbage_disposal
 *
 * Completed missions are face-up: everyone can see them.
 */

import type { SubsystemType } from "./subsystems.ts";
import { WEAPON_SUBSYSTEM_TYPES } from "./subsystems.ts";

/**
 * Four points win, and a hand is one primary and two secondaries — exactly
 * four. Each deck is dealt separately: three primaries to choose one from,
 * three secondaries to choose two from.
 *
 * **Why two decks.** Dealing five from one pile and keeping any three looked
 * like a choice and was not. Because primaries are most of the deck, 94% of
 * hands at three seats and 98% at six could take three of them, and three
 * primaries is the only shape with a spare — four points out of six means any
 * two of the three will do. So almost every seat was offered the same plan and
 * took it, the secondaries were the cards you kept when the deal failed you,
 * and the decision was which cards rather than which kind of game. Measured
 * over 4,000 deals, the second-best hand available sat 10 points behind the
 * best: a lock-in wearing the costume of a choice.
 *
 * Splitting the decks fixes the shape and hands the choice back as content.
 * Every seat gets the same frame — one primary somebody set you, two things you
 * do yourself — and picks inside it: the gap to the second-best hand halves.
 * The cost is the spare. One primary and two secondaries is four points on the
 * nose, so all three cards have to come in, and a hand is a chain rather than a
 * hedge. That is the tension the rest of the balance has to hold.
 */
export let MISSIONS_TO_WIN = 4;

/** Dealt from the primary deck, and kept from that deal. */
export const PRIMARY_OFFERS_PER_PLAYER = 3;
export const PRIMARIES_PER_PLAYER = 1;
/**
 * Dealt from the secondary stacks, and kept from that deal. The offer is one
 * card of each kind, so this is the number of kinds — keep it in step with
 * {@link SECONDARY_MISSION_TYPES} plus Garbage Disposal.
 */
export const SECONDARY_OFFERS_PER_PLAYER = 3;
export let SECONDARIES_PER_PLAYER = 2;

export let MISSIONS_PER_PLAYER = PRIMARIES_PER_PLAYER + SECONDARIES_PER_PLAYER;
export const MISSION_OFFERS_PER_PLAYER =
  PRIMARY_OFFERS_PER_PLAYER + SECONDARY_OFFERS_PER_PLAYER;

/**
 * These are the game's constants, not knobs on the state: a game is played
 * under RULES.md and nothing else. The one door out is the simulator's
 * experiment channel (`yarn sim --rules=missionsToWin=3`, sim/ruleOverrides.ts),
 * which reassigns them once at process start so a proposed change can be
 * measured before it is adopted. Nothing in the server, the UI or the engine's
 * own logic calls this, and a change that survives its experiment is written
 * into the values above. Read the bindings at call time — a module that
 * snapshots one into a top-level const would not see the override.
 */
export function setMissionRules(rules: { toWin?: number; secondariesKept?: number }): void {
  if (rules.toWin !== undefined) MISSIONS_TO_WIN = rules.toWin;
  if (rules.secondariesKept !== undefined) SECONDARIES_PER_PLAYER = rules.secondariesKept;
  MISSIONS_PER_PLAYER = PRIMARIES_PER_PLAYER + SECONDARIES_PER_PLAYER;
}

/** Black hole ring a ship must end its turn on to complete a Survey. */
export const SURVEY_RING = 1;

/**
 * What a completed card scores.
 *
 * One card at two points for each way of playing: Destroy for the hunter,
 * Deliver for the hauler, Intercept for the interceptor. Two of your own kind
 * is a win, so a hand states an intention instead of collecting whatever was
 * cheapest. Survey is the odd one at a point — a dive nobody has to cooperate
 * with, which is exactly why it is not a plan of its own.
 */
export const MISSION_POINTS: Readonly<Record<MissionType, number>> = {
  destroy_ship: 2,
  deliver_cargo: 2,
  intercept_transmission: 2,
  survey: 1,
  board: 1,
  garbage_disposal: 1,
};

export function missionPoints(type: MissionType): number {
  return MISSION_POINTS[type];
}

/**
 * Crates a hold takes. One: a crate is the size of the hold, so a second
 * route waits until the first is delivered, and two cards that load at the
 * same station are two trips rather than one.
 *
 * Data chits ride free — a scan's transmission and a survey's readings are
 * numbers, not freight — so an Intercept or a Survey can always be carried
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
  | "board"
  | "garbage_disposal";

/**
 * The one-point cards that pay a chit: do the thing, take the chit, file it at
 * any station. Garbage Disposal is a secondary too, but it carries a load instead
 * of a chit and finishes the moment the load is gone.
 */
export type SecondaryMissionType = "survey" | "board";
export const SECONDARY_MISSION_TYPES: readonly SecondaryMissionType[] = ["survey", "board"];

export type MissionFamily = "combat" | "trade" | "secondary";

export const MISSION_FAMILY: Record<MissionType, MissionFamily> = {
  destroy_ship: "combat",
  deliver_cargo: "trade",
  intercept_transmission: "trade",
  survey: "secondary",
  board: "secondary",
  garbage_disposal: "secondary",
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
 * call it by at the table — "weapon" is what a player needs to hear, not four
 * tile names — and the names behind it are `anyOf` (see
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
 * An Intercept opens with a scan and a Survey is held with the sensors lit on
 * the ring, so either card is dead weight on a mat with no sensor array. A
 * Destroy is completed by reducing a hull to 0 yourself, and only a weapon or
 * a missile credits a kill — heat kills nobody's target — so it needs any one
 * gun. A loadout is fixed for the game and a station repairs tiles, it never
 * fits one. This is the single table the rule lives in — the referee refuses
 * a submission that breaks it (`missionsMissingRequirements`, game/loadout.ts)
 * and the loadout screen reads the same list while you choose.
 */
export const MISSION_REQUIREMENTS: Readonly<Record<MissionType, readonly MissionRequirement[]>> = {
  destroy_ship: [WEAPON],
  deliver_cargo: [],
  intercept_transmission: [SENSOR_ARRAY],
  // The secondary cards ask for nothing aboard: they are flown, not fitted, which
  // is what lets any hand carry one as its third.
  board: [],
  garbage_disposal: [],
  // Nothing. A Survey is flown, not instrumented: the dive to the innermost
  // ring is the reading. It asked for a sensor array until 17 Sept 2026, which
  // made the one card any hand could use as filler a card only the sensor mats
  // could keep — and left half the table with no filler at all.
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
 * the cheapest two points on the table — a scan and then whatever dock the
 * route passed anyway — and it took over half of all winning cards (measured
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
 * A secondary card: do the thing, take the chit, file it at any station.
 *
 * Three of them, and the shape is deliberately one shape — the rule at the
 * table is a single sentence with the trigger swapped:
 *
 * | Card   | The thing                                    |
 * |--------|----------------------------------------------|
 * | survey | end a turn on the black hole's innermost ring |
 * | board  | end a turn in another ship's sector           |
 *
 * Neither asks for a tile and neither can be blocked, which is why each is
 * worth a point rather than two: a hand of three secondary cards cannot win.
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
 * Garbage Disposal: load at any station, then drop it into the black hole.
 *
 * Survey run backwards — the same two legs, the same dive, the other way
 * round — and the only secondary card that uses the hold. A load fills it, so a
 * cargo route and a disposal run cannot be flown at once: this is the card a
 * hunter or an interceptor has room for and a hauler has to queue.
 *
 * There is no chit and nothing to file: the load is jettisoned on the
 * innermost ring and the card is done. Destroyed with it aboard, the load is
 * lost — collect another at any station.
 */
export interface GarbageDisposalMission extends BaseMission {
  type: "garbage_disposal";
  cargoId: string;
}

export type Mission =
  | DestroyShipMission
  | DeliverCargoMission
  | InterceptTransmissionMission
  | SecondaryMission
  | GarbageDisposalMission;

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
  /** Planet whose station it is collected at, or "any" for a load of garbage. */
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

export function isDestroyShipMission(m: Mission): m is DestroyShipMission {
  return m.type === "destroy_ship";
}
export function isDeliverCargoMission(m: Mission): m is DeliverCargoMission {
  return m.type === "deliver_cargo";
}
export function isInterceptTransmissionMission(m: Mission): m is InterceptTransmissionMission {
  return m.type === "intercept_transmission";
}
/** The secondary cards that pay a chit (not Garbage Disposal, which pays a load). */
export function isSecondaryMission(m: Mission): m is SecondaryMission {
  return m.type === "survey" || m.type === "board";
}

export function isGarbageDisposalMission(m: Mission): m is GarbageDisposalMission {
  return m.type === "garbage_disposal";
}
