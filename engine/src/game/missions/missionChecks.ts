/**
 * Mission Completion Checks for Dangerous Inclinations
 *
 * Pure functions to check if missions have been completed.
 * Called after relevant game events (ship destruction, cargo delivery).
 */

import type { GameState, Player, Station } from '../../types/game'
import type { Mission, DestroyShipMission, DeliverCargoMission } from './types'
import { isDestroyShipMission, isDeliverCargoMission } from './types'

/**
 * Result of checking missions for a player
 */
export interface MissionCheckResult {
  player: Player
  updatedMissions: Mission[]
  newlyCompletedMissions: Mission[]
  completedMissionCount: number
  hasWon: boolean
}

/**
 * Check if a destroy ship mission is complete
 * Complete when the target player's ship HP reached 0
 * Note: This should be called when a ship is destroyed, before respawn
 */
export function checkDestroyMission(
  mission: DestroyShipMission,
  destroyedPlayerId: string
): boolean {
  return mission.targetPlayerId === destroyedPlayerId
}

/**
 * Check if a cargo mission is complete
 * Complete when:
 * 1. Cargo has been picked up (isPickedUp = true)
 * 2. Player is at the delivery station
 */
export function checkCargoMission(
  mission: DeliverCargoMission,
  player: Player,
  stations: Station[]
): boolean {
  // Find the cargo for this mission
  const cargo = player.cargo.find(c => c.missionId === mission.id)
  if (!cargo || !cargo.isPickedUp) {
    return false
  }

  // Check if player is at the delivery station
  const deliveryStation = stations.find(s => s.planetId === mission.deliveryPlanetId)
  if (!deliveryStation) {
    return false
  }

  return (
    player.ship.wellId === mission.deliveryPlanetId &&
    player.ship.ring === deliveryStation.ring &&
    player.ship.sector === deliveryStation.sector
  )
}

/**
 * Process mission completion for a destroyed player
 * Checks all players' destroy missions against the destroyed player
 * Returns updated players with completed missions marked
 */
export function processDestroyMissionCompletion(
  gameState: GameState,
  destroyedPlayerId: string
): GameState {
  const updatedPlayers = gameState.players.map(player => {
    // Check each mission for completion
    let missionCompleted = false
    const updatedMissions = player.missions.map(mission => {
      if (
        isDestroyShipMission(mission) &&
        !mission.isCompleted &&
        checkDestroyMission(mission, destroyedPlayerId)
      ) {
        missionCompleted = true
        return { ...mission, isCompleted: true }
      }
      return mission
    })

    if (missionCompleted) {
      return {
        ...player,
        missions: updatedMissions,
        completedMissionCount: player.completedMissionCount + 1,
      }
    }

    return player
  })

  return { ...gameState, players: updatedPlayers }
}

/**
 * Process cargo mission completion for a player at a station
 * Called when a player's movement ends at a station
 */
export function processCargoMissionCompletion(
  gameState: GameState,
  playerId: string
): GameState {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId)
  if (playerIndex === -1) return gameState

  const player = gameState.players[playerIndex]
  let completedCount = 0

  // Check each cargo mission for completion
  const updatedMissions = player.missions.map(mission => {
    if (
      isDeliverCargoMission(mission) &&
      !mission.isCompleted &&
      checkCargoMission(mission, player, gameState.stations)
    ) {
      completedCount++
      return { ...mission, isCompleted: true }
    }
    return mission
  })

  // Remove delivered cargo from player's inventory
  const updatedCargo = player.cargo.filter(cargo => {
    const mission = updatedMissions.find(m => m.id === cargo.missionId)
    return mission && !mission.isCompleted
  })

  if (completedCount > 0) {
    const updatedPlayers = [...gameState.players]
    updatedPlayers[playerIndex] = {
      ...player,
      missions: updatedMissions,
      cargo: updatedCargo,
      completedMissionCount: player.completedMissionCount + completedCount,
    }
    return { ...gameState, players: updatedPlayers }
  }

  return gameState
}

/**
 * Check all missions for a player and return completion status
 */
export function checkPlayerMissions(
  player: Player,
  gameState: GameState
): MissionCheckResult {
  let newlyCompleted: Mission[] = []
  let totalCompleted = 0

  const updatedMissions = player.missions.map(mission => {
    if (mission.isCompleted) {
      totalCompleted++
      return mission
    }

    // Check cargo missions (destroy missions are checked separately via events)
    if (isDeliverCargoMission(mission)) {
      if (checkCargoMission(mission, player, gameState.stations)) {
        newlyCompleted.push(mission)
        totalCompleted++
        return { ...mission, isCompleted: true }
      }
    }

    return mission
  })

  return {
    player,
    updatedMissions,
    newlyCompletedMissions: newlyCompleted,
    completedMissionCount: totalCompleted,
    hasWon: totalCompleted >= 3,
  }
}

/**
 * Check if any player has won by completing all 3 missions
 */
export function checkForWinner(gameState: GameState): string | null {
  for (const player of gameState.players) {
    if (player.completedMissionCount >= 3) {
      return player.id
    }
  }
  return null
}

/**
 * Get mission progress summary for a player (for UI)
 */
export function getMissionProgress(player: Player): {
  completed: number
  total: number
  destroyComplete: boolean
  cargoComplete: number
  cargoTotal: number
} {
  const destroyMission = player.missions.find(m => m.type === 'destroy_ship')
  const cargoMissions = player.missions.filter(m => m.type === 'deliver_cargo')

  return {
    completed: player.completedMissionCount,
    total: player.missions.length,
    destroyComplete: destroyMission?.isCompleted ?? false,
    cargoComplete: cargoMissions.filter(m => m.isCompleted).length,
    cargoTotal: cargoMissions.length,
  }
}
