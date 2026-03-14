/**
 * Mission Types for Dangerous Inclinations
 *
 * Missions are private objectives that players must complete to win.
 * Each player receives 3 missions at game start.
 * First player to complete all 3 missions wins.
 */

import { Player } from "./game";

export type MissionType = "destroy_ship" | "deliver_cargo" | "intercept_transmission";

/**
 * Base mission interface shared by all mission types
 */
export interface BaseMission {
  id: string;
  type: MissionType;
  isCompleted: boolean;
}

/**
 * Destroy Ship Mission
 * Objective: Destroy a specific player's ship (they will respawn)
 * Completion: When target's HP reaches 0
 */
export interface DestroyShipMission extends BaseMission {
  type: "destroy_ship";
  targetPlayerId: string;
}

/**
 * Deliver Cargo Mission
 * Objective: Pick up cargo at one planet's station, deliver to another
 * Completion: When cargo is delivered to destination station
 */
export interface DeliverCargoMission extends BaseMission {
  type: "deliver_cargo";
  pickupPlanetId: string;
  deliveryPlanetId: string;
  cargoId: string; // Links to cargo in player's inventory
}

/**
 * Intercept Transmission Mission
 * Phase 1 — Scan: Be in the same ring as the target player, within ±3 sectors,
 *   with sensor_array powered for 1 turn. This adds a scan_data cargo to inventory.
 * Phase 2 — Deliver: Deliver the scan_data cargo to any station.
 * The powered sensor_array reveals intent, creating tension: shadow then run.
 */
export interface InterceptTransmissionMission extends BaseMission {
  type: "intercept_transmission";
  targetPlayerId: string;
  scanAcquired: boolean; // true once scan phase is complete
  scanCargoId: string;   // ID of the scan_data cargo item (may not be in inventory yet)
}

/**
 * Union type of all mission types
 */
export type Mission = DestroyShipMission | DeliverCargoMission | InterceptTransmissionMission;

/**
 * Cargo being transported by a player
 * Created when a DeliverCargoMission is dealt
 * Picked up when player is at pickup station
 * Delivered when player is at delivery station
 *
 * For InterceptTransmissionMission, type is "scan_data" and deliveryPlanetId is "any"
 */
export interface Cargo {
  id: string;
  missionId: string; // Links back to the mission
  type: "standard" | "scan_data";
  pickupPlanetId: string;
  deliveryPlanetId: string; // "any" for scan_data cargo
  isPickedUp: boolean;
}

/**
 * Type guard for DestroyShipMission
 */
export function isDestroyShipMission(
  mission: Mission
): mission is DestroyShipMission {
  return mission.type === "destroy_ship";
}

/**
 * Type guard for DeliverCargoMission
 */
export function isDeliverCargoMission(
  mission: Mission
): mission is DeliverCargoMission {
  return mission.type === "deliver_cargo";
}

/**
 * Type guard for InterceptTransmissionMission
 */
export function isInterceptTransmissionMission(
  mission: Mission
): mission is InterceptTransmissionMission {
  return mission.type === "intercept_transmission";
}

/**
 * Result of checking missions for a player
 */
export interface MissionCheckResult {
  player: Player;
  updatedMissions: Mission[];
  newlyCompletedMissions: Mission[];
  completedMissionCount: number;
  hasWon: boolean;
}
