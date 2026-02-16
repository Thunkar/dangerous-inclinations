import type { Player, GameState } from '../../models/game'
import { isDestroyShipMission, isDeliverCargoMission } from '../../models/missions'
import type { BotGoal } from '../types'
import { estimateTurnsToTarget } from '../movementPlanner'
import { getStationForPlanet, STATION_CONSTANTS } from '../../game/stations'

/**
 * Predict where a station will be after a certain number of turns.
 * Stations orbit at Ring 1 with velocity from ring config.
 * Ring 1 has 6 sectors, velocity 1 → moves 1 sector per round.
 */
export function predictStationPosition(
  currentSector: number,
  turnsAhead: number,
  sectorsInRing: number = 6,
  velocity: number = 1
): number {
  return (currentSector + velocity * turnsAhead) % sectorsInRing
}

/**
 * Compute mission-derived goals for the bot.
 * Each incomplete mission generates a goal with estimated turns to completion.
 */
export function computeMissionGoals(
  player: Player,
  gameState: GameState
): BotGoal[] {
  const goals: BotGoal[] = []

  for (const mission of player.missions) {
    if (mission.isCompleted) continue

    if (isDestroyShipMission(mission)) {
      // Find target player
      const targetPlayer = gameState.players.find(p => p.id === mission.targetPlayerId)
      if (!targetPlayer || targetPlayer.ship.hitPoints <= 0) continue

      // Estimate turns to reach target
      const turnsToTarget = estimateTurnsToTarget(player.ship, {
        wellId: targetPlayer.ship.wellId,
        ring: targetPlayer.ship.ring,
        sector: targetPlayer.ship.sector,
      })

      goals.push({
        type: 'destroy_target',
        missionId: mission.id,
        targetPlayerId: mission.targetPlayerId,
        estimatedTurns: turnsToTarget === Infinity ? 20 : turnsToTarget + 3, // +3 for combat
      })
    } else if (isDeliverCargoMission(mission)) {
      // Check if cargo is picked up
      const cargo = player.cargo.find(c => c.missionId === mission.id)
      const isPickedUp = cargo?.isPickedUp ?? false

      if (!isPickedUp) {
        // Need to pick up cargo first
        const pickupStation = getStationForPlanet(gameState.stations, mission.pickupPlanetId)
        if (pickupStation) {
          // Predict station position
          const turnsToStation = estimateTurnsToTarget(player.ship, {
            wellId: mission.pickupPlanetId,
            ring: pickupStation.ring,
            sector: pickupStation.sector,
          })

          const predictedSector = turnsToStation === Infinity
            ? pickupStation.sector
            : predictStationPosition(pickupStation.sector, turnsToStation, STATION_CONSTANTS.SECTORS_PER_RING)

          goals.push({
            type: 'pickup_cargo',
            missionId: mission.id,
            targetWellId: mission.pickupPlanetId,
            targetRing: pickupStation.ring,
            targetSector: predictedSector,
            estimatedTurns: turnsToStation === Infinity ? 20 : turnsToStation,
          })
        }
      } else {
        // Cargo picked up, need to deliver
        const deliveryStation = getStationForPlanet(gameState.stations, mission.deliveryPlanetId)
        if (deliveryStation) {
          const turnsToStation = estimateTurnsToTarget(player.ship, {
            wellId: mission.deliveryPlanetId,
            ring: deliveryStation.ring,
            sector: deliveryStation.sector,
          })

          const predictedSector = turnsToStation === Infinity
            ? deliveryStation.sector
            : predictStationPosition(deliveryStation.sector, turnsToStation, STATION_CONSTANTS.SECTORS_PER_RING)

          goals.push({
            type: 'deliver_cargo',
            missionId: mission.id,
            targetWellId: mission.deliveryPlanetId,
            targetRing: deliveryStation.ring,
            targetSector: predictedSector,
            estimatedTurns: turnsToStation === Infinity ? 20 : turnsToStation,
          })
        }
      }
    }
  }

  // Sort by estimated turns (most urgent first)
  goals.sort((a, b) => a.estimatedTurns - b.estimatedTurns)

  return goals
}

/**
 * Select the current goal to pursue.
 * Strategy-based selection:
 * - 'combat': Prefer destroy missions
 * - 'cargo': Prefer cargo missions
 * - 'balanced'/'auto': Pick cheapest (lowest estimatedTurns)
 */
export function selectCurrentGoal(
  goals: BotGoal[],
  strategy: 'combat' | 'cargo' | 'balanced' | 'auto'
): BotGoal | null {
  if (goals.length === 0) return null

  switch (strategy) {
    case 'combat': {
      const combatGoal = goals.find(g => g.type === 'destroy_target')
      return combatGoal ?? goals[0]
    }
    case 'cargo': {
      const cargoGoal = goals.find(g => g.type === 'pickup_cargo' || g.type === 'deliver_cargo')
      return cargoGoal ?? goals[0]
    }
    case 'balanced':
    case 'auto':
    default:
      // Auto: pick cheapest goal
      return goals[0] // Already sorted by estimatedTurns
  }
}
