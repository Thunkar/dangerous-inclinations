/**
 * Mission Deck System for Dangerous Inclinations
 *
 * Generates and deals missions to players at game start.
 * Each player receives exactly 3 missions:
 * - Destroy missions: Each player targets exactly ONE other player
 * - Cargo missions: Transport cargo between planet stations
 */

import type { Player, GravityWell } from '../../types/game'
import type { Mission, DestroyShipMission, DeliverCargoMission, Cargo } from './types'

/**
 * Mission deck constants
 */
export const MISSION_CONSTANTS = {
  MISSIONS_PER_PLAYER: 3,
} as const

/**
 * Generate a unique mission ID
 */
function generateMissionId(type: string, index: number): string {
  return `mission-${type}-${index}-${Date.now()}`
}

/**
 * Generate a unique cargo ID linked to a mission
 */
function generateCargoId(missionId: string): string {
  return `cargo-${missionId}`
}

/**
 * Generate all possible destroy ship missions
 * Each mission targets a specific player
 * NOTE: Not currently used - we use circular targeting instead (dealDestroyMissions)
 */
function _generateDestroyMissions(players: Player[]): DestroyShipMission[] {
  return players.map((player, index) => ({
    id: generateMissionId('destroy', index),
    type: 'destroy_ship' as const,
    isCompleted: false,
    targetPlayerId: player.id,
  }))
}
// Suppress unused warning - kept for potential future use
void _generateDestroyMissions

/**
 * Generate all possible cargo delivery missions
 * Creates missions for all planet pairs (A→B, B→A, etc.)
 * 6 planets = 30 possible routes (6 * 5)
 */
function generateCargoMissions(planets: GravityWell[]): DeliverCargoMission[] {
  const missions: DeliverCargoMission[] = []
  let index = 0

  for (const pickupPlanet of planets) {
    for (const deliveryPlanet of planets) {
      if (pickupPlanet.id !== deliveryPlanet.id) {
        const missionId = generateMissionId('cargo', index)
        missions.push({
          id: missionId,
          type: 'deliver_cargo' as const,
          isCompleted: false,
          pickupPlanetId: pickupPlanet.id,
          deliveryPlanetId: deliveryPlanet.id,
          cargoId: generateCargoId(missionId),
        })
        index++
      }
    }
  }

  return missions
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Deal destroy missions so each player targets exactly one other player
 * Uses a circular assignment: player[0] targets player[1], player[1] targets player[2], etc.
 * The last player targets player[0], completing the circle.
 * This ensures everyone is targeted by exactly one player.
 */
function dealDestroyMissions(players: Player[]): Map<string, DestroyShipMission> {
  const assignments = new Map<string, DestroyShipMission>()

  // Shuffle player order for randomization
  const shuffledPlayers = shuffleArray(players)

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const attacker = shuffledPlayers[i]
    const target = shuffledPlayers[(i + 1) % shuffledPlayers.length]

    assignments.set(attacker.id, {
      id: generateMissionId('destroy', i),
      type: 'destroy_ship',
      isCompleted: false,
      targetPlayerId: target.id,
    })
  }

  return assignments
}

/**
 * Deal cargo missions from the available pool
 * Each player gets (MISSIONS_PER_PLAYER - 1) cargo missions
 * (since they get 1 destroy mission)
 */
function dealCargoMissions(
  players: Player[],
  cargoMissions: DeliverCargoMission[]
): Map<string, DeliverCargoMission[]> {
  const assignments = new Map<string, DeliverCargoMission[]>()
  const shuffledMissions = shuffleArray(cargoMissions)
  let missionIndex = 0

  const cargoMissionsPerPlayer = MISSION_CONSTANTS.MISSIONS_PER_PLAYER - 1 // 2 cargo missions each

  for (const player of players) {
    const playerMissions: DeliverCargoMission[] = []

    for (let i = 0; i < cargoMissionsPerPlayer && missionIndex < shuffledMissions.length; i++) {
      // Create a new mission with a unique ID for this player
      const baseMission = shuffledMissions[missionIndex]
      const missionId = generateMissionId('cargo', missionIndex)
      playerMissions.push({
        ...baseMission,
        id: missionId,
        cargoId: generateCargoId(missionId),
      })
      missionIndex++
    }

    assignments.set(player.id, playerMissions)
  }

  return assignments
}

/**
 * Create cargo objects for cargo missions
 */
function createCargoForMissions(missions: DeliverCargoMission[]): Cargo[] {
  return missions.map(mission => ({
    id: mission.cargoId,
    missionId: mission.id,
    pickupPlanetId: mission.pickupPlanetId,
    deliveryPlanetId: mission.deliveryPlanetId,
    isPickedUp: false,
  }))
}

/**
 * Result of dealing missions to players
 */
export interface DealMissionsResult {
  playerMissions: Map<string, Mission[]>
  playerCargo: Map<string, Cargo[]>
}

/**
 * Deal missions to all players
 * Each player receives:
 * - 1 destroy ship mission (targeting one specific other player)
 * - 2 cargo delivery missions
 *
 * Returns a map of playerId -> missions and playerId -> cargo
 */
export function dealMissions(
  players: Player[],
  planets: GravityWell[]
): DealMissionsResult {
  // Generate mission pools
  const cargoMissions = generateCargoMissions(planets)

  // Deal destroy missions (one per player, circular targeting)
  const destroyAssignments = dealDestroyMissions(players)

  // Deal cargo missions
  const cargoAssignments = dealCargoMissions(players, cargoMissions)

  // Combine missions and create cargo objects
  const playerMissions = new Map<string, Mission[]>()
  const playerCargo = new Map<string, Cargo[]>()

  for (const player of players) {
    const missions: Mission[] = []

    // Add destroy mission
    const destroyMission = destroyAssignments.get(player.id)
    if (destroyMission) {
      missions.push(destroyMission)
    }

    // Add cargo missions
    const cargoMissionsList = cargoAssignments.get(player.id) || []
    missions.push(...cargoMissionsList)

    playerMissions.set(player.id, missions)

    // Create cargo for cargo missions
    playerCargo.set(player.id, createCargoForMissions(cargoMissionsList))
  }

  return { playerMissions, playerCargo }
}

/**
 * Get the destroy target for a player (for UI/debug purposes)
 */
export function getDestroyTarget(missions: Mission[]): string | undefined {
  const destroyMission = missions.find(m => m.type === 'destroy_ship') as DestroyShipMission | undefined
  return destroyMission?.targetPlayerId
}

/**
 * Get cargo missions for a player
 */
export function getCargoMissions(missions: Mission[]): DeliverCargoMission[] {
  return missions.filter(m => m.type === 'deliver_cargo') as DeliverCargoMission[]
}
