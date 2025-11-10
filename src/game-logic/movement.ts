import type { ShipState, PlayerAction } from '../types/game'
import { getRingConfig, BURN_COSTS, mapSectorOnTransfer } from '../constants/rings'

/**
 * Pure function to calculate orbital movement for a ship
 * Returns new ship state with updated sector
 */
export function applyOrbitalMovement(ship: ShipState): ShipState {
  const ringConfig = getRingConfig(ship.ring)
  if (!ringConfig) {
    return ship
  }

  const newSector = (ship.sector + ringConfig.velocity) % ringConfig.sectors

  return {
    ...ship,
    sector: newSector,
  }
}

/**
 * Pure function to initiate a burn/transfer
 * Returns new ship state with transfer initiated and reaction mass consumed
 */
export function initiateBurn(
  ship: ShipState,
  action: PlayerAction
): ShipState {
  if (action.type !== 'burn' || !action.burnIntensity) {
    return ship
  }

  const burnCost = BURN_COSTS[action.burnIntensity]
  const burnDirection = action.targetFacing || ship.facing

  // Calculate destination ring
  const direction = burnDirection === 'prograde' ? 1 : -1
  const destinationRing = ship.ring + direction * burnCost.rings

  // Clamp to valid ring range (1-5)
  const clampedDestination = Math.max(1, Math.min(5, destinationRing))

  return {
    ...ship,
    reactionMass: ship.reactionMass - burnCost.mass,
    transferState: {
      destinationRing: clampedDestination,
      sectorAdjustment: action.sectorAdjustment || 0,
      arriveNextTurn: true,
    },
  }
}

/**
 * Pure function to complete a transfer
 * Returns new ship state at destination ring/sector with transfer cleared
 */
export function completeTransfer(ship: ShipState): ShipState {
  if (!ship.transferState) {
    return ship
  }

  const oldRing = ship.ring
  const newRing = ship.transferState.destinationRing
  const baseSector = mapSectorOnTransfer(oldRing, newRing, ship.sector)
  const adjustment = ship.transferState.sectorAdjustment || 0

  const newRingConfig = getRingConfig(newRing)
  if (!newRingConfig) {
    return ship
  }

  // Apply sector adjustment with wraparound
  const finalSector = (baseSector + adjustment + newRingConfig.sectors) % newRingConfig.sectors

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
  if (action.type !== 'burn' || !action.burnIntensity) {
    return { valid: false, reason: 'Not a burn action' }
  }

  const burnCost = BURN_COSTS[action.burnIntensity]

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
