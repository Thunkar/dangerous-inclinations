/**
 * Mission Types for Dangerous Inclinations
 *
 * Missions are private objectives that players must complete to win.
 * Each player receives 3 missions at game start.
 * First player to complete all 3 missions wins.
 */

export type MissionType = 'destroy_ship' | 'deliver_cargo'

/**
 * Base mission interface shared by all mission types
 */
export interface BaseMission {
  id: string
  type: MissionType
  isCompleted: boolean
}

/**
 * Destroy Ship Mission
 * Objective: Destroy a specific player's ship (they will respawn)
 * Completion: When target's HP reaches 0
 */
export interface DestroyShipMission extends BaseMission {
  type: 'destroy_ship'
  targetPlayerId: string
}

/**
 * Deliver Cargo Mission
 * Objective: Pick up cargo at one planet's station, deliver to another
 * Completion: When cargo is delivered to destination station
 */
export interface DeliverCargoMission extends BaseMission {
  type: 'deliver_cargo'
  pickupPlanetId: string
  deliveryPlanetId: string
  cargoId: string // Links to cargo in player's inventory
}

/**
 * Union type of all mission types
 */
export type Mission = DestroyShipMission | DeliverCargoMission

/**
 * Cargo being transported by a player
 * Created when a DeliverCargoMission is dealt
 * Picked up when player is at pickup station
 * Delivered when player is at delivery station
 */
export interface Cargo {
  id: string
  missionId: string // Links back to the mission
  pickupPlanetId: string
  deliveryPlanetId: string
  isPickedUp: boolean
}

/**
 * Type guard for DestroyShipMission
 */
export function isDestroyShipMission(mission: Mission): mission is DestroyShipMission {
  return mission.type === 'destroy_ship'
}

/**
 * Type guard for DeliverCargoMission
 */
export function isDeliverCargoMission(mission: Mission): mission is DeliverCargoMission {
  return mission.type === 'deliver_cargo'
}
