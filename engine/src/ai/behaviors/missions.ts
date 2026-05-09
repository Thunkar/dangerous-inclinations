import type { Player, GameState } from '../../models/game.ts'
import {
  isDestroyShipMission,
  isDeliverCargoMission,
  isInterceptTransmissionMission,
} from '../../models/missions.ts'
import type { BotGoal } from '../types.ts'
import { estimateTurnsToTarget } from '../movementPlanner/index.ts'
import { getStationForPlanet, STATION_CONSTANTS } from '../../game/stations.ts'
import { getGravityWell } from '../../models/gravityWells.ts'

/**
 * Per-planet station velocity. Stations live on Ring 1 of each planet, which
 * has the planet's Ring-1 velocity (4 per game rules). Stations advance
 * once per ROUND, not per turn. The default here is the right
 * sectors-per-round assumption; actual lookups should use
 * {@link stationSectorsPerRound} below.
 */
const DEFAULT_STATION_SECTORS_PER_ROUND = 4

/**
 * Predict where a station will be after a number of turns elapse. Stations
 * advance once per round (= once per `playerCount` turns). Consumers must
 * pass `sectorsPerRound` (from the planet's ring config) and `playerCount`.
 */
export function predictStationPosition(
  currentSector: number,
  turnsAhead: number,
  sectorsInRing: number = STATION_CONSTANTS.SECTORS_PER_RING,
  sectorsPerRound: number = DEFAULT_STATION_SECTORS_PER_ROUND,
  playerCount: number = 1
): number {
  const rounds = Math.floor(turnsAhead / Math.max(1, playerCount))
  return (currentSector + sectorsPerRound * rounds) % sectorsInRing
}

/**
 * Look up the orbital velocity (sectors-per-round) of the station orbiting
 * a given planet. Falls back to the default if the well is missing.
 */
function stationSectorsPerRound(planetId: string): number {
  const well = getGravityWell(planetId)
  const ring1 = well?.rings.find(r => r.ring === STATION_CONSTANTS.RING)
  return ring1?.velocity ?? DEFAULT_STATION_SECTORS_PER_ROUND
}

/**
 * Wrapper that returns the current station sector if the bot can't reach it
 * (turns = Infinity → no path), else the projected sector that accounts for
 * orbital velocity and round-vs-turn cadence. This is what the goal target
 * sector should aim at.
 */
function predictStationSectorOrCurrent(
  currentSector: number,
  turnsToStation: number,
  planetId: string,
  playerCount: number
): number {
  if (turnsToStation === Infinity) return currentSector
  return predictStationPosition(
    currentSector,
    turnsToStation,
    STATION_CONSTANTS.SECTORS_PER_RING,
    stationSectorsPerRound(planetId),
    playerCount
  )
}

/**
 * Pick the station closest to the bot. For scan delivery missions where
 * any station works, we just want the lowest-cost trip.
 */
function pickClosestStation(
  player: Player,
  gameState: GameState
):
  | { planetId: string; ring: number; sector: number }
  | undefined {
  let best:
    | { planetId: string; ring: number; sector: number; turns: number }
    | undefined
  for (const station of gameState.stations) {
    const turns = estimateTurnsToTarget(player.ship, {
      wellId: station.planetId,
      ring: station.ring,
      sector: station.sector,
    })
    if (best === undefined || turns < best.turns) {
      best = {
        planetId: station.planetId,
        ring: station.ring,
        sector: station.sector,
        turns,
      }
    }
  }
  return best && { planetId: best.planetId, ring: best.ring, sector: best.sector }
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
          const turnsToStation = estimateTurnsToTarget(player.ship, {
            wellId: mission.pickupPlanetId,
            ring: pickupStation.ring,
            sector: pickupStation.sector,
          })
          const predictedSector = predictStationSectorOrCurrent(
            pickupStation.sector,
            turnsToStation,
            mission.pickupPlanetId,
            gameState.players.length
          )

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
          const predictedSector = predictStationSectorOrCurrent(
            deliveryStation.sector,
            turnsToStation,
            mission.deliveryPlanetId,
            gameState.players.length
          )

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
    } else if (isInterceptTransmissionMission(mission)) {
      // Intercept missions are two-phase: shadow → deliver scan.
      // Phase 1 (shadow): be in same well + same ring + within ±3 sectors,
      //                   AND have sensor_array powered.
      // Phase 2 (deliver): take the scan_data cargo to ANY station.
      const targetPlayer = gameState.players.find(p => p.id === mission.targetPlayerId)
      if (!targetPlayer || targetPlayer.ship.hitPoints <= 0) continue

      if (!mission.scanAcquired) {
        // Shadow the target. Aim at their predicted position to be
        // inside the scan window (same ring, same sector is closest).
        const turnsToTarget = estimateTurnsToTarget(player.ship, {
          wellId: targetPlayer.ship.wellId,
          ring: targetPlayer.ship.ring,
          sector: targetPlayer.ship.sector,
        })
        goals.push({
          type: 'shadow_target',
          missionId: mission.id,
          targetPlayerId: mission.targetPlayerId,
          targetWellId: targetPlayer.ship.wellId,
          targetRing: targetPlayer.ship.ring,
          targetSector: targetPlayer.ship.sector,
          estimatedTurns:
            turnsToTarget === Infinity ? 20 : turnsToTarget + 1, // +1 for scan acquire turn
        })
      } else {
        // Carry scan to any station — pick the closest. Scan cargo has
        // deliveryPlanetId === "any"; we just need to be at any station.
        const closestStation = pickClosestStation(player, gameState)
        if (closestStation) {
          const turnsToStation = estimateTurnsToTarget(player.ship, {
            wellId: closestStation.planetId,
            ring: closestStation.ring,
            sector: closestStation.sector,
          })
          const predictedSector = predictStationSectorOrCurrent(
            closestStation.sector,
            turnsToStation,
            closestStation.planetId,
            gameState.players.length
          )
          goals.push({
            type: 'deliver_scan',
            missionId: mission.id,
            targetWellId: closestStation.planetId,
            targetRing: closestStation.ring,
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

  // Commitment rule: a cargo mission with the cargo already on board takes
  // precedence regardless of strategy. The bot has invested ~25-30 turns
  // getting the pickup; bailing now to chase a destroy target that wanders
  // into range means starting over. Scan delivery is intentionally NOT
  // committed — any station works for delivery so the trip is fast and
  // letting the bot keep its options open empirically yields more wins.
  const cargoInHand = goals.find(g => g.type === 'deliver_cargo')
  if (cargoInHand) return cargoInHand

  switch (strategy) {
    case 'combat': {
      const combatGoal = goals.find(g => g.type === 'destroy_target')
      return combatGoal ?? goals[0]
    }
    case 'cargo': {
      const cargoGoal = goals.find(
        g => g.type === 'pickup_cargo' || g.type === 'deliver_cargo'
      )
      return cargoGoal ?? goals[0]
    }
    case 'balanced':
    case 'auto':
    default:
      return goals[0] // already sorted by estimatedTurns
  }
}
