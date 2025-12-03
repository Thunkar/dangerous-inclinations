import type { GameState, Missile, Player, TurnLogEntry } from '../types/game'
import type { ProcessResult } from './actionProcessors'
import { getGravityWell } from '../constants/gravityWells'
import { applyOrbitalMovement } from './movement'
import { applyWeaponDamage } from './damage'

/**
 * Missile configuration constants
 */
export const MISSILE_CONFIG = {
  INITIAL_INVENTORY: 4,
  MAX_INVENTORY: 4,
  FUEL_PER_TURN: 3,
  MAX_TURNS_ALIVE: 3, // Explodes at turn 3
  DAMAGE: 3,
  FUEL_PER_RING: 1,
  FUEL_PER_SECTOR: 1,
} as const

/**
 * Calculate shortest sector distance accounting for wrap-around
 */
function calculateSectorDistance(
  fromSector: number,
  toSector: number,
  sectorCount: number
): { distance: number; direction: 1 | -1 } {
  let diff = toSector - fromSector
  const halfSectors = sectorCount / 2

  // Normalize to shortest path
  if (diff > halfSectors) {
    diff -= sectorCount
  } else if (diff < -halfSectors) {
    diff += sectorCount
  }

  return {
    distance: Math.abs(diff),
    direction: diff >= 0 ? 1 : -1,
  }
}

/**
 * Move missile towards target using available fuel
 * Returns new position and fuel spent
 */
export function calculateMissileMovement(
  missile: Missile,
  target: Player,
  _gameState: GameState
): { ring: number; sector: number; fuelSpent: number; path: string[] } {
  const fuel = MISSILE_CONFIG.FUEL_PER_TURN
  const path: string[] = []

  // Start from missile's current position
  let currentRing = missile.ring
  let currentSector = missile.sector
  let fuelRemaining = fuel

  // Target position
  const targetRing = target.ship.ring
  const targetSector = target.ship.sector

  // Check if target is in same gravity well
  if (missile.wellId !== target.ship.wellId) {
    // Missile can't cross wells, just drift
    path.push(`Target in different gravity well - missile drifts`)
    return { ring: currentRing, sector: currentSector, fuelSpent: 0, path }
  }

  // Calculate distances
  const ringDiff = targetRing - currentRing
  const ringDistance = Math.abs(ringDiff)

  const well = getGravityWell(missile.wellId)
  if (!well) {
    path.push(`Invalid gravity well - missile drifts`)
    return { ring: currentRing, sector: currentSector, fuelSpent: 0, path }
  }

  const currentRingConfig = well.rings.find(r => r.ring === currentRing)!
  const sectorInfo = calculateSectorDistance(currentSector, targetSector, currentRingConfig.sectors)

  path.push(`Start: R${currentRing}S${currentSector}, Target: R${targetRing}S${targetSector}`)
  path.push(`Ring distance: ${ringDistance}, Sector distance: ${sectorInfo.distance}`)

  // PRIORITY 1: Change rings (bigger impact on closing distance)
  if (ringDiff !== 0 && fuelRemaining > 0) {
    const ringSteps = Math.min(ringDistance, fuelRemaining)
    const ringDirection = ringDiff > 0 ? 1 : -1
    currentRing += ringDirection * ringSteps
    fuelRemaining -= ringSteps
    path.push(`Moved ${ringSteps} ring(s) ${ringDirection > 0 ? 'outward' : 'inward'} to R${currentRing}`)

    // If we changed rings, we need to remap the sector
    const newRingConfig = well.rings.find(r => r.ring === currentRing)!
    if (newRingConfig.sectors !== currentRingConfig.sectors) {
      // Remap sector proportionally (1:1 mapping since all rings have 24 sectors)
      // This is simplified - in reality all rings have same sector count
      currentSector = Math.floor(
        (currentSector / currentRingConfig.sectors) * newRingConfig.sectors
      )
      path.push(`Remapped to S${currentSector} on new ring`)
    }
  }

  // PRIORITY 2: Move sectors towards target
  if (fuelRemaining > 0) {
    // Recalculate sector distance from new position
    const newRingConfig = well.rings.find(r => r.ring === currentRing)!
    const newSectorInfo = calculateSectorDistance(
      currentSector,
      targetSector,
      newRingConfig.sectors
    )

    if (newSectorInfo.distance > 0) {
      const sectorSteps = Math.min(newSectorInfo.distance, fuelRemaining)
      currentSector += newSectorInfo.direction * sectorSteps
      // Wrap around
      currentSector = ((currentSector % newRingConfig.sectors) + newRingConfig.sectors) % newRingConfig.sectors
      fuelRemaining -= sectorSteps
      path.push(`Moved ${sectorSteps} sector(s) to S${currentSector}`)
    }
  }

  const fuelSpent = fuel - fuelRemaining
  if (fuelSpent === 0) {
    path.push(`Already at target or no path available`)
  }

  return { ring: currentRing, sector: currentSector, fuelSpent, path }
}

/**
 * Check if missile has hit its target
 */
export function checkMissileHit(missile: Missile, target: Player): boolean {
  return (
    missile.wellId === target.ship.wellId &&
    missile.ring === target.ship.ring &&
    missile.sector === target.ship.sector
  )
}

/**
 * Process missiles in flight
 * Called during turn execution AFTER player tactical actions
 *
 * @param gameState - Current game state
 * @param ownerId - Optional filter to only process missiles owned by this player
 */
export function processMissiles(gameState: GameState, ownerId?: string): ProcessResult {
  const logEntries: TurnLogEntry[] = []
  let updatedGameState = { ...gameState }
  const missilesToRemove: string[] = []
  const updatedPlayers = [...gameState.players]

  // Filter missiles by owner if specified
  const missilesToProcess = ownerId
    ? gameState.missiles.filter(m => m.ownerId === ownerId)
    : gameState.missiles

  // Process each missile
  for (const missile of missilesToProcess) {
    const owner = updatedPlayers.find(p => p.id === missile.ownerId)
    const target = updatedPlayers.find(p => p.id === missile.targetId)

    if (!owner || !target) {
      missilesToRemove.push(missile.id)
      logEntries.push({
        turn: gameState.turn,
        playerId: missile.ownerId,
        playerName: owner?.name || 'Unknown',
        action: 'Missile',
        result: `Missile ${missile.id} removed (missing owner or target)`,
      })
      continue
    }

    // Step 1: Apply orbital movement to missile (unless skipped for missiles fired after movement)
    let currentRing = missile.ring
    let currentSector = missile.sector
    let currentWellId = missile.wellId

    if (!missile.skipOrbitalThisTurn) {
      const missileAsShip = {
        wellId: missile.wellId,
        ring: missile.ring,
        sector: missile.sector,
        facing: 'prograde' as const,
        reactionMass: 0,
        hitPoints: 1,
        maxHitPoints: 1,
        transferState: null,
        subsystems: [],
        reactor: { totalCapacity: 0, availableEnergy: 0, maxReturnRate: 0, energyToReturn: 0 },
        heat: { currentHeat: 0, heatToVent: 0 },
        missileInventory: 0,
      }
      const afterOrbital = applyOrbitalMovement(missileAsShip)

      currentRing = afterOrbital.ring
      currentSector = afterOrbital.sector
      currentWellId = afterOrbital.wellId
    }

    // Step 2: Spend fuel to approach target
    const movement = calculateMissileMovement(
      { ...missile, ring: currentRing, sector: currentSector, wellId: currentWellId },
      target,
      updatedGameState
    )
    currentRing = movement.ring
    currentSector = movement.sector

    // Step 3: Check for collision
    const missileState = {
      ...missile,
      ring: currentRing,
      sector: currentSector,
      wellId: currentWellId,
    }

    if (checkMissileHit(missileState, target)) {
      // HIT! Apply damage
      const targetIndex = updatedPlayers.findIndex(p => p.id === target.id)
      const damagedShip = applyWeaponDamage(
        target.ship,
        'missiles',
        MISSILE_CONFIG.DAMAGE
      )
      updatedPlayers[targetIndex] = {
        ...target,
        ship: damagedShip,
      }

      missilesToRemove.push(missile.id)
      logEntries.push({
        turn: gameState.turn,
        playerId: owner.id,
        playerName: owner.name,
        action: 'Missile Hit',
        result: `${owner.name}'s missile hit ${target.name} for ${MISSILE_CONFIG.DAMAGE} damage! (R${currentRing}S${currentSector})`,
      })
    } else {
      // Update missile position and clear the skipOrbitalThisTurn flag
      const updatedMissile = {
        ...missile,
        ring: currentRing,
        sector: currentSector,
        wellId: currentWellId,
        turnsAlive: missile.turnsAlive + 1,
        skipOrbitalThisTurn: undefined, // Clear flag for next turn
      }

      // Check if missile has expired
      if (updatedMissile.turnsAlive >= MISSILE_CONFIG.MAX_TURNS_ALIVE) {
        missilesToRemove.push(missile.id)
        logEntries.push({
          turn: gameState.turn,
          playerId: owner.id,
          playerName: owner.name,
          action: 'Missile Expired',
          result: `${owner.name}'s missile exploded (3 turn limit) at R${currentRing}S${currentSector}`,
        })
      } else {
        // Keep missile active
        updatedGameState = {
          ...updatedGameState,
          missiles: updatedGameState.missiles.map(m =>
            m.id === missile.id ? updatedMissile : m
          ),
        }

        logEntries.push({
          turn: gameState.turn,
          playerId: owner.id,
          playerName: owner.name,
          action: 'Missile Tracking',
          result: `${owner.name}'s missile tracking ${target.name}: R${currentRing}S${currentSector} (Turn ${updatedMissile.turnsAlive + 1}/3, spent ${movement.fuelSpent} fuel)`,
        })
      }
    }
  }

  // Remove hit/expired missiles
  updatedGameState = {
    ...updatedGameState,
    missiles: updatedGameState.missiles.filter(m => !missilesToRemove.includes(m.id)),
    players: updatedPlayers,
  }

  return {
    success: true,
    gameState: updatedGameState,
    logEntries,
  }
}

/**
 * Fire a missile from a ship
 * Called from action processor when fire_weapon action is processed
 */
export function fireMissile(
  gameState: GameState,
  ownerId: string,
  targetId: string
): { missile: Missile | null; error?: string } {
  const owner = gameState.players.find(p => p.id === ownerId)
  const target = gameState.players.find(p => p.id === targetId)

  if (!owner) {
    return { missile: null, error: 'Owner not found' }
  }

  if (!target) {
    return { missile: null, error: 'Target not found' }
  }

  // Check inventory
  if (owner.ship.missileInventory <= 0) {
    return { missile: null, error: 'No missiles remaining' }
  }

  // Create missile at ship's position
  const missileId = `missile-${ownerId}-${gameState.turn}-${Date.now()}`
  const missile: Missile = {
    id: missileId,
    ownerId,
    targetId,
    wellId: owner.ship.wellId,
    ring: owner.ship.ring,
    sector: owner.ship.sector,
    turnFired: gameState.turn,
    turnsAlive: 0,
  }

  return { missile }
}
