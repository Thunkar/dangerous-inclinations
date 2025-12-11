/**
 * Cargo System for Dangerous Inclinations
 *
 * Handles cargo pickup and delivery at planetary stations.
 * Cargo is automatically picked up/delivered when a ship is at a station.
 */

import type { GameState, Player, Station } from '../types/game'
import type { Cargo, DeliverCargoMission } from './missions/types'
import { isDeliverCargoMission } from './missions/types'

/**
 * Result of processing cargo at a station
 */
export interface CargoProcessResult {
  player: Player
  pickedUpCargo: Cargo[]
  deliveredCargo: Cargo[]
  logMessages: string[]
}

/**
 * Check if a player can pick up cargo at their current position
 * Returns cargo that can be picked up (not yet picked up, at pickup station)
 */
export function getPickupableCargo(
  player: Player,
  stations: Station[]
): Cargo[] {
  return player.cargo.filter(cargo => {
    if (cargo.isPickedUp) return false

    // Check if player is at the pickup station for this cargo
    const pickupStation = stations.find(s => s.planetId === cargo.pickupPlanetId)
    if (!pickupStation) return false

    return (
      player.ship.wellId === cargo.pickupPlanetId &&
      player.ship.ring === pickupStation.ring &&
      player.ship.sector === pickupStation.sector
    )
  })
}

/**
 * Check if a player can deliver cargo at their current position
 * Returns cargo that can be delivered (picked up, at delivery station)
 */
export function getDeliverableCargo(
  player: Player,
  stations: Station[]
): Cargo[] {
  return player.cargo.filter(cargo => {
    if (!cargo.isPickedUp) return false

    // Check if player is at the delivery station for this cargo
    const deliveryStation = stations.find(s => s.planetId === cargo.deliveryPlanetId)
    if (!deliveryStation) return false

    return (
      player.ship.wellId === cargo.deliveryPlanetId &&
      player.ship.ring === deliveryStation.ring &&
      player.ship.sector === deliveryStation.sector
    )
  })
}

/**
 * Pick up cargo at the current station
 * Updates cargo's isPickedUp flag to true
 */
export function pickupCargo(cargo: Cargo): Cargo {
  return { ...cargo, isPickedUp: true }
}

/**
 * Process all cargo operations for a player at their current position
 * Automatically picks up and delivers cargo as appropriate
 * Returns the updated player and log messages
 */
export function processCargoAtStation(
  player: Player,
  stations: Station[]
): CargoProcessResult {
  const pickedUpCargo: Cargo[] = []
  const deliveredCargo: Cargo[] = []
  const logMessages: string[] = []

  // Get cargo that can be picked up or delivered
  const pickupable = getPickupableCargo(player, stations)
  const deliverable = getDeliverableCargo(player, stations)

  // Update cargo state
  let updatedCargo = player.cargo.map(cargo => {
    // Check for pickup
    if (pickupable.includes(cargo)) {
      pickedUpCargo.push(cargo)
      logMessages.push(`Picked up cargo for delivery to ${cargo.deliveryPlanetId}`)
      return pickupCargo(cargo)
    }
    return cargo
  })

  // Filter out delivered cargo
  updatedCargo = updatedCargo.filter(cargo => {
    if (deliverable.some(d => d.id === cargo.id)) {
      deliveredCargo.push(cargo)
      logMessages.push(`Delivered cargo to ${cargo.deliveryPlanetId}`)
      return false // Remove from inventory
    }
    return true
  })

  return {
    player: { ...player, cargo: updatedCargo },
    pickedUpCargo,
    deliveredCargo,
    logMessages,
  }
}

/**
 * Process cargo for all players in the game
 * Called after movement phase
 */
export function processAllCargoAtStations(gameState: GameState): GameState {
  const updatedPlayers = gameState.players.map(player => {
    const result = processCargoAtStation(player, gameState.stations)
    return result.player
  })

  return { ...gameState, players: updatedPlayers }
}

/**
 * Get cargo status for a player (for UI display)
 */
export function getCargoStatus(player: Player): {
  totalCargo: number
  pickedUp: number
  awaitingPickup: number
} {
  const pickedUp = player.cargo.filter(c => c.isPickedUp).length
  return {
    totalCargo: player.cargo.length,
    pickedUp,
    awaitingPickup: player.cargo.length - pickedUp,
  }
}

/**
 * Get the station a player needs to visit for a specific cargo
 */
export function getNextStationForCargo(
  cargo: Cargo,
  stations: Station[]
): Station | undefined {
  const targetPlanetId = cargo.isPickedUp ? cargo.deliveryPlanetId : cargo.pickupPlanetId
  return stations.find(s => s.planetId === targetPlanetId)
}

/**
 * Get all cargo missions and their current status for a player
 */
export function getCargoMissionStatus(
  player: Player
): Array<{
  mission: DeliverCargoMission
  cargo: Cargo | undefined
  status: 'awaiting_pickup' | 'in_transit' | 'delivered'
}> {
  const cargoMissions = player.missions.filter(isDeliverCargoMission)

  return cargoMissions.map(mission => {
    const cargo = player.cargo.find(c => c.missionId === mission.id)

    let status: 'awaiting_pickup' | 'in_transit' | 'delivered'
    if (mission.isCompleted) {
      status = 'delivered'
    } else if (cargo?.isPickedUp) {
      status = 'in_transit'
    } else {
      status = 'awaiting_pickup'
    }

    return { mission, cargo, status }
  })
}
