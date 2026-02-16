import type {
  GameState,
  Player,
  ShipState,
  GravityWellId,
  TransferPoint,
} from '../models/game'
import type { TacticalSituation, Threat, Target, BotStatus, SubsystemStatus } from './types'
import { SUBSYSTEM_CONFIGS } from '../models/subsystems'
import { calculateFiringSolutions } from '../utils/weaponRange'
import { getAvailableWellTransfers } from '../models/transferPoints'
import { TRANSFER_POINTS } from '../models/gravityWells'
import { applyOrbitalMovement } from '../game/movement'
import { SECTORS_PER_RING } from '../models/rings'
import { computeMissionGoals, selectCurrentGoal } from './behaviors/missions'

/**
 * Check if two ships are in a shared transfer sector (can target across wells)
 */
function areInSharedTransferSector(
  ship1: ShipState,
  ship2: ShipState,
  transferPoints: TransferPoint[]
): boolean {
  if (ship1.wellId === ship2.wellId) return false

  const ship1Transfers = transferPoints.filter(
    tp =>
      tp.fromWellId === ship1.wellId &&
      tp.fromRing === ship1.ring &&
      tp.fromSector === ship1.sector &&
      tp.toWellId === ship2.wellId
  )

  if (ship1Transfers.length === 0) return false

  return ship1Transfers.some(tp => tp.toRing === ship2.ring && tp.toSector === ship2.sector)
}

/**
 * Calculate distance between two ships
 */
function calculateDistance(
  ship1: ShipState,
  ship2: ShipState,
  transferPoints: TransferPoint[]
): {
  total: number
  ringDistance: number
  sectorDistance: number
} {
  if (ship1.wellId !== ship2.wellId) {
    if (areInSharedTransferSector(ship1, ship2, transferPoints)) {
      return { total: 0, ringDistance: 0, sectorDistance: 0 }
    }
    return { total: 999, ringDistance: 999, sectorDistance: 999 }
  }

  const ringDistance = Math.abs(ship1.ring - ship2.ring)

  let sectorDistance = Math.abs(ship1.sector - ship2.sector)
  const halfRing = SECTORS_PER_RING / 2
  if (sectorDistance > halfRing) {
    sectorDistance = SECTORS_PER_RING - sectorDistance
  }

  return {
    total: ringDistance + sectorDistance,
    ringDistance,
    sectorDistance,
  }
}

/**
 * Predict where a ship will be after its next movement (simple orbital movement)
 */
function predictShipPosition(ship: ShipState): {
  wellId: GravityWellId
  ring: number
  sector: number
} {
  const afterMovement = applyOrbitalMovement(ship)

  return {
    wellId: afterMovement.wellId,
    ring: afterMovement.ring,
    sector: afterMovement.sector,
  }
}

/**
 * Analyze bot's current status - dynamic, works with any loadout
 */
function analyzeBotStatus(bot: Player): BotStatus {
  const ship = bot.ship
  const subsystemStatuses: SubsystemStatus[] = []

  for (let i = 0; i < ship.subsystems.length; i++) {
    const sub = ship.subsystems[i]
    subsystemStatuses.push({
      type: sub.type,
      index: i,
      powered: sub.isPowered,
      energy: sub.allocatedEnergy,
      used: sub.usedThisTurn,
      broken: sub.isBroken ?? false,
      slotType: sub.slotType,
      slotIndex: sub.slotIndex,
      ammo: sub.ammo,
    })
  }

  // Find fixed subsystems (always present)
  const engines = subsystemStatuses.find(s => s.type === 'engines')!
  const rotation = subsystemStatuses.find(s => s.type === 'rotation')!

  // Find all weapon subsystems
  const weapons = subsystemStatuses.filter(s => {
    const config = SUBSYSTEM_CONFIGS[s.type]
    return config?.weaponStats != null
  })

  const hasScoop = subsystemStatuses.some(s => s.type === 'scoop')
  const hasShields = subsystemStatuses.some(s => s.type === 'shields')

  return {
    health: ship.hitPoints,
    healthPercent: ship.hitPoints / ship.maxHitPoints,
    heat: ship.heat.currentHeat,
    heatPercent: ship.heat.currentHeat / 10,
    reactionMass: ship.reactionMass,
    maxReactionMass: ship.reactionMass, // Will be corrected if we have the stats
    availableEnergy: ship.reactor.availableEnergy,
    subsystems: subsystemStatuses,
    engines,
    rotation,
    weapons,
    hasScoop,
    hasShields,
    wellId: ship.wellId,
    ring: ship.ring,
    sector: ship.sector,
    facing: ship.facing,
  }
}

/**
 * Analyze threats (enemy ships that can harm us) - dynamic weapon detection
 */
function analyzeThreats(bot: Player, enemies: Player[], transferPoints: TransferPoint[]): Threat[] {
  const threats: Threat[] = []

  for (const enemy of enemies) {
    const distance = calculateDistance(bot.ship, enemy.ship, transferPoints)
    const predictedPosition = predictShipPosition(enemy.ship)

    // Check ALL weapon subsystems on enemy ship
    const weaponsInRange: Threat['weaponsInRange'] = []

    for (let i = 0; i < enemy.ship.subsystems.length; i++) {
      const sub = enemy.ship.subsystems[i]
      const config = SUBSYSTEM_CONFIGS[sub.type]
      if (!config?.weaponStats) continue
      if (!sub.isPowered) continue

      const solutions = calculateFiringSolutions(
        sub,
        enemy.ship,
        [bot],
        enemy.id
      )
      weaponsInRange.push({
        weaponType: sub.type,
        subsystemIndex: i,
        inRange: solutions.some(s => s.inRange),
      })
    }

    threats.push({
      player: enemy,
      distance: distance.total,
      ringDistance: distance.ringDistance,
      sectorDistance: distance.sectorDistance,
      weaponsInRange,
      predictedPosition,
    })
  }

  threats.sort((a, b) => a.distance - b.distance)

  return threats
}

/**
 * Analyze targets (enemies we can attack) - dynamic weapon detection
 */
function analyzeTargets(bot: Player, enemies: Player[], transferPoints: TransferPoint[]): Target[] {
  const targets: Target[] = []

  for (const enemy of enemies) {
    const distance = calculateDistance(bot.ship, enemy.ship, transferPoints)
    const predictedPosition = predictShipPosition(enemy.ship)

    // Calculate firing solutions for EVERY weapon subsystem on our ship
    const firingSolutions = new Map<number, import('../utils/weaponRange').FiringSolution>()

    for (let i = 0; i < bot.ship.subsystems.length; i++) {
      const sub = bot.ship.subsystems[i]
      const config = SUBSYSTEM_CONFIGS[sub.type]
      if (!config?.weaponStats) continue
      if (!sub.isPowered) continue

      const solutions = calculateFiringSolutions(
        sub,
        bot.ship,
        [enemy],
        bot.id
      )
      if (solutions.length > 0) {
        firingSolutions.set(i, solutions[0])
      }
    }

    const priority = 100 - (enemy.ship.hitPoints / enemy.ship.maxHitPoints) * 100

    targets.push({
      player: enemy,
      distance: distance.total,
      firingSolutions,
      predictedPosition,
      priority,
    })
  }

  targets.sort((a, b) => b.priority - a.priority)

  return targets
}

/**
 * Main tactical situation analyzer
 * Extracts all relevant information from game state for bot decision-making
 */
export function analyzeTacticalSituation(
  gameState: GameState,
  botPlayerId: string
): TacticalSituation {
  const botPlayer = gameState.players.find(p => p.id === botPlayerId)
  if (!botPlayer) {
    throw new Error(`Bot player ${botPlayerId} not found`)
  }

  const enemies = gameState.players.filter(p => p.id !== botPlayerId && p.ship.hitPoints > 0)

  const status = analyzeBotStatus(botPlayer)

  const threats = analyzeThreats(botPlayer, enemies, TRANSFER_POINTS)
  const targets = analyzeTargets(botPlayer, enemies, TRANSFER_POINTS)

  const primaryThreat =
    threats.find(t => t.weaponsInRange.some(w => w.inRange)) || threats[0] || null

  const primaryTarget =
    targets.find(t => {
      for (const sol of t.firingSolutions.values()) {
        if (sol.inRange) return true
      }
      return false
    }) || targets[0] || null

  const availableTransfers = getAvailableWellTransfers(
    botPlayer.ship.wellId,
    botPlayer.ship.ring,
    botPlayer.ship.sector,
    TRANSFER_POINTS
  ).map(tp => ({
    toWellId: tp.toWellId,
    fromSector: tp.fromSector,
    toSector: tp.toSector,
  }))

  // Compute mission-derived goals
  const allGoals = computeMissionGoals(botPlayer, gameState)
  const currentGoal = selectCurrentGoal(allGoals, 'auto')

  return {
    botPlayer,
    status,
    threats,
    targets,
    primaryThreat,
    primaryTarget,
    availableTransfers,
    currentGoal,
    allGoals,
  }
}
