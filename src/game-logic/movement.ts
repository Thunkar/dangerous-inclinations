import type { ShipState, PlayerAction, GravityWellId } from '../types/game'
import { BURN_COSTS, mapSectorOnTransfer, SECTORS_PER_RING, calculateBurnMassCost } from '../constants/rings'
import { getGravityWell } from '../constants/gravityWells'

/**
 * Helper to get max ring number for a gravity well
 * Black hole has 4 rings, planets have 3 rings
 */
function getMaxRingForWell(wellId: GravityWellId): number {
  const well = getGravityWell(wellId)
  if (!well) return 4 // Default to black hole
  return well.rings.length
}

/**
 * Pure function to calculate orbital movement for a ship
 * Returns new ship state with updated sector
 *
 * Black hole: sectors increment (clockwise visual rotation)
 * Planets: sectors decrement (counterclockwise visual rotation)
 */
export function applyOrbitalMovement(ship: ShipState): ShipState {
  // Get well-specific ring configuration (planets and black hole have different velocities)
  const well = getGravityWell(ship.wellId)
  if (!well) {
    return ship
  }

  const ringConfig = well.rings.find(r => r.ring === ship.ring)
  if (!ringConfig) {
    return ship
  }

  // All orbital movement increments sector numbers
  // The visual rotation direction is handled by the rendering (direction multiplier)
  // Sector numbers always increment regardless of well type
  const newSector = (ship.sector + ringConfig.velocity) % ringConfig.sectors

  return {
    ...ship,
    sector: newSector,
  }
}

/**
 * Pure function to initiate a burn/transfer
 * Returns new ship state with transfer initiated and reaction mass consumed
 *
 * Note: Burn direction is determined by the ship's CURRENT facing.
 * If rotation is needed, it must be applied before calling this function.
 * All transfers complete immediately in the same turn.
 *
 * @param ship - Current ship state
 * @param action - Burn action to execute
 */
export function initiateBurn(
  ship: ShipState,
  action: PlayerAction
): ShipState {
  if (action.type !== 'burn') {
    return ship
  }

  const burnCost = BURN_COSTS[action.data.burnIntensity]
  const sectorAdjustment = action.data.sectorAdjustment || 0

  // Calculate total mass cost including sector adjustment
  const totalMassCost = calculateBurnMassCost(burnCost.mass, sectorAdjustment)

  // Use the ship's current facing (rotation should have been applied already in Phase 4)
  const burnDirection = ship.facing

  // Calculate destination ring
  const direction = burnDirection === 'prograde' ? 1 : -1
  const destinationRing = ship.ring + direction * burnCost.rings

  // Clamp to valid ring range (1 to max rings for this well)
  const maxRing = getMaxRingForWell(ship.wellId)
  const clampedDestination = Math.max(1, Math.min(maxRing, destinationRing))

  return {
    ...ship,
    reactionMass: ship.reactionMass - totalMassCost,
    transferState: {
      destinationRing: clampedDestination,
      sectorAdjustment: sectorAdjustment,
    },
  }
}

/**
 * Pure function to complete a burn transfer (ring change within same well)
 * Returns new ship state at destination ring/sector with transfer cleared
 *
 * @param ship - Current ship state
 * @returns Updated ship state
 */
export function completeRingTransfer(ship: ShipState): ShipState {
  if (!ship.transferState) {
    return ship
  }

  // Well transfers should never reach here
  if (ship.transferState.isWellTransfer) {
    console.error('Well transfer reached completeTransfer - this should not happen')
    return {
      ...ship,
      transferState: null,
    }
  }

  // Handle burn transfer (ring change within same gravity well)
  const oldRing = ship.ring
  const newRing = ship.transferState.destinationRing
  const baseSector = mapSectorOnTransfer(oldRing, newRing, ship.sector)
  const adjustment = ship.transferState.sectorAdjustment || 0

  // Apply sector adjustment with wraparound (all rings have 24 sectors)
  const finalSector = (baseSector + adjustment + SECTORS_PER_RING) % SECTORS_PER_RING

  return {
    ...ship,
    ring: newRing,
    sector: finalSector,
    transferState: null,
  }
}

/**
 * Pure function to rotate ship facing
 * Returns new ship state with updated facing
 */
export function applyRotation(ship: ShipState, targetFacing: 'prograde' | 'retrograde'): ShipState {
  return {
    ...ship,
    facing: targetFacing,
  }
}

/**
 * Validates if a burn action is possible given current ship state
 */
export function canExecuteBurn(
  ship: ShipState,
  action: PlayerAction
): { valid: boolean; reason?: string } {
  if (action.type !== 'burn') {
    return { valid: false, reason: 'Not a burn action' }
  }

  const burnCost = BURN_COSTS[action.data.burnIntensity]

  // Check reaction mass
  if (ship.reactionMass < burnCost.mass) {
    return {
      valid: false,
      reason: `Need ${burnCost.mass} reaction mass, have ${ship.reactionMass}`,
    }
  }

  // Check engine energy
  const enginesSubsystem = ship.subsystems.find(s => s.type === 'engines')
  if (!enginesSubsystem || enginesSubsystem.allocatedEnergy < burnCost.energy) {
    return {
      valid: false,
      reason: `Need ${burnCost.energy} energy in engines, have ${enginesSubsystem?.allocatedEnergy || 0}`,
    }
  }

  return { valid: true }
}

/**
 * Validates if rotation is possible
 */
export function canRotate(
  ship: ShipState,
  targetFacing: 'prograde' | 'retrograde'
): { valid: boolean; reason?: string } {
  // No rotation needed if already facing that direction
  if (ship.facing === targetFacing) {
    return { valid: true }
  }

  // Check rotation subsystem
  const rotationSubsystem = ship.subsystems.find(s => s.type === 'rotation')
  if (!rotationSubsystem?.isPowered) {
    return {
      valid: false,
      reason: 'Rotation subsystem not powered',
    }
  }

  if (rotationSubsystem.usedThisTurn) {
    return {
      valid: false,
      reason: 'Rotation subsystem already used this turn',
    }
  }

  return { valid: true }
}
