/**
 * Missions: secret objectives. First player to complete MISSIONS_TO_WIN wins.
 *
 * Four mission types:
 *   destroy_ship, deliver_cargo, intercept_transmission, survey
 *
 * Completed missions are face-up: everyone can see them.
 */

import type { SubsystemType } from "./subsystems.ts";

export const MISSIONS_TO_WIN = 3;
export const MISSIONS_PER_PLAYER = 3;
export const MISSION_OFFERS_PER_PLAYER = 5;

/** Black hole ring a ship must end its turn on to complete a Survey. */
export const SURVEY_RING = 1;
/** Consecutive own turns a ship must end on SURVEY_RING with sensors powered to take the data. */
export const SURVEY_HOLD_TURNS = 2;
/** Scan range for the scan action (same ring, ±sectors). */
export const SCAN_SECTOR_RANGE = 3;

export type MissionType = "destroy_ship" | "deliver_cargo" | "intercept_transmission" | "survey";

export type MissionFamily = "combat" | "trade" | "daring";

export const MISSION_FAMILY: Record<MissionType, MissionFamily> = {
  destroy_ship: "combat",
  deliver_cargo: "trade",
  intercept_transmission: "trade",
  survey: "daring",
};

/**
 * Tiles a card cannot be completed without.
 *
 * An Intercept opens with a scan and a Survey is held with the sensors lit on
 * the ring, so either card is dead weight on a mat with no sensor array: a
 * loadout is fixed for the game and a station repairs tiles, it never fits
 * one. This is the single table the rule lives in — the referee refuses a
 * submission that breaks it (`missionsMissingSubsystems`, game/loadout.ts) and
 * the loadout screen reads the same list while you choose.
 */
export const MISSION_REQUIRED_SUBSYSTEMS: Readonly<Record<MissionType, readonly SubsystemType[]>> =
  {
    destroy_ship: [],
    deliver_cargo: [],
    intercept_transmission: ["sensor_array"],
    survey: ["sensor_array"],
  };

/** What a card needs aboard to be completable at all; empty for cards any hull can fly. */
export function missionRequiredSubsystems(type: MissionType): readonly SubsystemType[] {
  return MISSION_REQUIRED_SUBSYSTEMS[type];
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

/** Scan the target, then dock at any station with the data. */
export interface InterceptTransmissionMission extends BaseMission {
  type: "intercept_transmission";
  targetPlayerId: string;
  scanAcquired: boolean;
  dataCargoId: string;
}

/**
 * Hold SURVEY_RING for SURVEY_HOLD_TURNS consecutive turns with the sensor
 * array powered (the data is taken on the last), then dock at the named planet.
 */
export interface SurveyMission extends BaseMission {
  type: "survey";
  /** Station the data must be delivered to. */
  deliveryPlanetId: string;
  /** Consecutive turns ended on the ring, sensing. Resets when a turn ends elsewhere or dark. */
  surveyTurns: number;
  surveyAcquired: boolean;
  dataCargoId: string;
}

export type Mission =
  | DestroyShipMission
  | DeliverCargoMission
  | InterceptTransmissionMission
  | SurveyMission;

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
export function isSurveyMission(m: Mission): m is SurveyMission {
  return m.type === "survey";
}
