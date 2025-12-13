import type { GameState, Player, ShipState, GravityWellId, TransferPoint } from '@dangerous-inclinations/engine'
import type { TacticalSituation, Threat, Target, BotStatus } from './types'
import { calculateFiringSolutions } from '@dangerous-inclinations/engine'
import { SUBSYSTEM_CONFIGS } from '@dangerous-inclinations/engine'
import { getAvailableWellTransfers } from '@dangerous-inclinations/engine'
import { applyOrbitalMovement } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { TRANSFER_POINTS } from '@dangerous-inclinations/engine'

/**
 * Check if two ships are in a shared transfer sector (can target across wells)
 */
function areInSharedTransferSector(
  ship1: ShipState,
  ship2: ShipState,
  transferPoints: TransferPoint[]
): boolean {
  if (ship1.wellId === ship2.wellId) return false // Same well, not a transfer sector issue

  // Check if ship1's position is a transfer point that connects to ship2's well
  const ship1Transfers = transferPoints.filter(tp =>
    tp.fromWellId === ship1.wellId &&
    tp.fromRing === ship1.ring &&
    tp.fromSector === ship1.sector &&
    tp.toWellId === ship2.wellId
  )

  if (ship1Transfers.length === 0) return false

  // Check if ship2 is at the corresponding transfer sector
  return ship1Transfers.some(tp =>
    tp.toRing === ship2.ring &&
    tp.toSector === ship2.sector
  )
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
  // Ships in different wells - check if they're in a shared transfer sector
  if (ship1.wellId !== ship2.wellId) {
    if (areInSharedTransferSector(ship1, ship2, transferPoints)) {
      // They're in the shared transfer sector - treat as adjacent (distance 0)
      return { total: 0, ringDistance: 0, sectorDistance: 0 }
    }
    return { total: 999, ringDistance: 999, sectorDistance: 999 }
  }

  const ringDistance = Math.abs(ship1.ring - ship2.ring)

  // Calculate shortest sector distance (accounting for wrap-around)
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
  // Simple prediction: assume ship will coast (apply orbital movement)
  const afterMovement = applyOrbitalMovement(ship)

  return {
    wellId: afterMovement.wellId,
    ring: afterMovement.ring,
    sector: afterMovement.sector,
  }
}

/**
 * Analyze bot's current status
 */
function analyzeBotStatus(bot: Player): BotStatus {
  const ship = bot.ship
  const subsystems = ship.subsystems

  const getSubsystem = (type: string) => subsystems.find(s => s.type === type)

  const engines = getSubsystem('engines')
  const rotation = getSubsystem('rotation')
  const laser = getSubsystem('laser')
  const railgun = getSubsystem('railgun')
  const missiles = getSubsystem('missiles')
  const shields = getSubsystem('shields')

  return {
    health: ship.hitPoints,
    healthPercent: ship.hitPoints / ship.maxHitPoints,
    heat: ship.heat.currentHeat,
    heatPercent: ship.heat.currentHeat / 10, // Heat scales with ship, assume max ~10 for percentage
    reactionMass: ship.reactionMass,
    availableEnergy: ship.reactor.availableEnergy,
    subsystems: {
      engines: {
        powered: engines?.isPowered || false,
        energy: engines?.allocatedEnergy || 0,
      },
      rotation: {
        powered: rotation?.isPowered || false,
        energy: rotation?.allocatedEnergy || 0,
        used: rotation?.usedThisTurn || false,
      },
      laser: {
        powered: laser?.isPowered || false,
        energy: laser?.allocatedEnergy || 0,
        used: laser?.usedThisTurn || false,
      },
      railgun: {
        powered: railgun?.isPowered || false,
        energy: railgun?.allocatedEnergy || 0,
        used: railgun?.usedThisTurn || false,
      },
      missiles: {
        powered: missiles?.isPowered || false,
        energy: missiles?.allocatedEnergy || 0,
        used: missiles?.usedThisTurn || false,
      },
      shields: {
        powered: shields?.isPowered || false,
        energy: shields?.allocatedEnergy || 0,
      },
    },
    wellId: ship.wellId,
    ring: ship.ring,
    sector: ship.sector,
    facing: ship.facing,
  }
}

/**
 * Analyze threats (enemy ships that can harm us)
 */
function analyzeThreats(bot: Player, enemies: Player[], transferPoints: TransferPoint[]): Threat[] {
  const threats: Threat[] = []

  for (const enemy of enemies) {
    const distance = calculateDistance(bot.ship, enemy.ship, transferPoints)
    const predictedPosition = predictShipPosition(enemy.ship)

    // Check which enemy weapons can hit us
    const weaponsInRange = []

    // Laser check
    const laserSubsystem = enemy.ship.subsystems.find(s => s.type === 'laser')
    if (laserSubsystem?.isPowered && SUBSYSTEM_CONFIGS.laser.weaponStats) {
      const laserSolutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.laser.weaponStats,
        enemy.ship,
        [bot],
        enemy.id
      )
      weaponsInRange.push({
        weaponType: 'laser' as const,
        inRange: laserSolutions.some(s => s.inRange),
      })
    }

    // Railgun check
    const railgunSubsystem = enemy.ship.subsystems.find(s => s.type === 'railgun')
    if (railgunSubsystem?.isPowered && SUBSYSTEM_CONFIGS.railgun.weaponStats) {
      const railgunSolutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.railgun.weaponStats,
        enemy.ship,
        [bot],
        enemy.id
      )
      weaponsInRange.push({
        weaponType: 'railgun' as const,
        inRange: railgunSolutions.some(s => s.inRange),
      })
    }

    // Missiles check
    const missilesSubsystem = enemy.ship.subsystems.find(s => s.type === 'missiles')
    if (missilesSubsystem?.isPowered && SUBSYSTEM_CONFIGS.missiles.weaponStats) {
      const missileSolutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.missiles.weaponStats,
        enemy.ship,
        [bot],
        enemy.id
      )
      weaponsInRange.push({
        weaponType: 'missiles' as const,
        inRange: missileSolutions.some(s => s.inRange),
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

  // Sort by distance (closest first)
  threats.sort((a, b) => a.distance - b.distance)

  return threats
}

/**
 * Analyze targets (enemies we can attack)
 */
function analyzeTargets(bot: Player, enemies: Player[], transferPoints: TransferPoint[]): Target[] {
  const targets: Target[] = []

  for (const enemy of enemies) {
    const distance = calculateDistance(bot.ship, enemy.ship, transferPoints)
    const predictedPosition = predictShipPosition(enemy.ship)

    // Calculate firing solutions for each weapon
    const firingSolutions: Target['firingSolutions'] = {}

    const laserSubsystem = bot.ship.subsystems.find(s => s.type === 'laser')
    if (laserSubsystem?.isPowered && SUBSYSTEM_CONFIGS.laser.weaponStats) {
      const solutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.laser.weaponStats,
        bot.ship,
        [enemy],
        bot.id
      )
      if (solutions.length > 0) {
        firingSolutions.laser = solutions[0]
      }
    }

    const railgunSubsystem = bot.ship.subsystems.find(s => s.type === 'railgun')
    if (railgunSubsystem?.isPowered && SUBSYSTEM_CONFIGS.railgun.weaponStats) {
      const solutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.railgun.weaponStats,
        bot.ship,
        [enemy],
        bot.id
      )
      if (solutions.length > 0) {
        firingSolutions.railgun = solutions[0]
      }
    }

    const missilesSubsystem = bot.ship.subsystems.find(s => s.type === 'missiles')
    if (missilesSubsystem?.isPowered && SUBSYSTEM_CONFIGS.missiles.weaponStats) {
      const solutions = calculateFiringSolutions(
        SUBSYSTEM_CONFIGS.missiles.weaponStats,
        bot.ship,
        [enemy],
        bot.id
      )
      if (solutions.length > 0) {
        firingSolutions.missiles = solutions[0]
      }
    }

    // Priority: lower HP = higher priority
    const priority = 100 - (enemy.ship.hitPoints / enemy.ship.maxHitPoints) * 100

    targets.push({
      player: enemy,
      distance: distance.total,
      firingSolutions,
      predictedPosition,
      priority,
    })
  }

  // Sort by priority (highest priority first)
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
  // Find bot player
  const botPlayer = gameState.players.find(p => p.id === botPlayerId)
  if (!botPlayer) {
    throw new Error(`Bot player ${botPlayerId} not found`)
  }

  // Get enemies (all other players with HP > 0)
  const enemies = gameState.players.filter(
    p => p.id !== botPlayerId && p.ship.hitPoints > 0
  )

  // Analyze bot status
  const status = analyzeBotStatus(botPlayer)

  // Analyze threats and targets (passing transferPoints for cross-well targeting)
  const threats = analyzeThreats(botPlayer, enemies, TRANSFER_POINTS)
  const targets = analyzeTargets(botPlayer, enemies, TRANSFER_POINTS)

  // Identify primary threat (closest enemy with weapons in range)
  const primaryThreat = threats.find(t =>
    t.weaponsInRange.some(w => w.inRange)
  ) || threats[0] || null

  // Identify primary target (best firing solution + highest priority)
  const primaryTarget = targets.find(t =>
    Object.values(t.firingSolutions).some(s => s?.inRange)
  ) || targets[0] || null

  // Get available transfer points
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

  return {
    botPlayer,
    status,
    threats,
    targets,
    primaryThreat,
    primaryTarget,
    availableTransfers,
  }
}
