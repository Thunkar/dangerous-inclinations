import type {
  PlayerAction,
  ShipState,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  FireWeaponAction,
  RotateAction,
  BurnAction,
} from '../types/game'
import { getSubsystemConfig } from '../types/subsystems'
import { WEAPONS } from '../constants/weapons'
import { BURN_COSTS, getAdjustmentRange, calculateBurnMassCost } from '../constants/rings'
import { getGravityWell } from '../constants/gravityWells'

export interface ValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Validates a single action against ship state independently
 * Each action is validated based only on the current ship state
 */
export function validateSingleAction(ship: ShipState, action: PlayerAction): ValidationResult {
  switch (action.type) {
    case 'coast':
      return { valid: true } // Coast is always valid

    case 'burn':
      return validateBurnAction(ship, action)

    case 'rotate':
      return validateRotateAction(ship, action)

    case 'allocate_energy':
      return validateAllocateAction(ship, action)

    case 'deallocate_energy':
      return validateDeallocateAction(ship, action)

    case 'fire_weapon':
      return validateFireWeaponAction(ship, action)

    default:
      return { valid: false, reason: 'Unknown action type' }
  }
}

function validateBurnAction(ship: ShipState, action: BurnAction): ValidationResult {
  const burnCost = BURN_COSTS[action.data.burnIntensity]
  const sectorAdjustment = action.data.sectorAdjustment || 0

  // Check engine energy
  const enginesSubsystem = ship.subsystems.find(s => s.type === 'engines')

  // Check if engines are broken
  if (enginesSubsystem?.isBroken) {
    return { valid: false, reason: 'Engines are broken and cannot be used' }
  }

  const currentEngineEnergy = enginesSubsystem?.allocatedEnergy || 0

  if (currentEngineEnergy < burnCost.energy) {
    return {
      valid: false,
      reason: `Need ${burnCost.energy} energy in engines for ${action.data.burnIntensity} burn (have ${currentEngineEnergy})`,
    }
  }

  // Get current ring velocity to determine allowed adjustment range
  const well = getGravityWell(ship.wellId)
  const ringConfig = well?.rings.find(r => r.ring === ship.ring)
  const velocity = ringConfig?.velocity || 1

  // Validate sector adjustment range
  const { min, max } = getAdjustmentRange(velocity)
  if (sectorAdjustment < min || sectorAdjustment > max) {
    return {
      valid: false,
      reason: `Sector adjustment ${sectorAdjustment} out of range (${min} to ${max} for velocity ${velocity})`,
    }
  }

  // Check total reaction mass including adjustment cost
  const totalMassCost = calculateBurnMassCost(burnCost.mass, sectorAdjustment)
  if (ship.reactionMass < totalMassCost) {
    return {
      valid: false,
      reason: `Need ${totalMassCost} reaction mass (${burnCost.mass} base + ${Math.abs(sectorAdjustment)} adjustment), have ${ship.reactionMass}`,
    }
  }

  return { valid: true }
}

function validateRotateAction(ship: ShipState, action: RotateAction): ValidationResult {
  // No rotation needed if already facing that direction
  if (ship.facing === action.data.targetFacing) {
    return { valid: false, reason: 'Already facing that direction' }
  }

  // Check if rotation subsystem is powered
  const rotationSubsystem = ship.subsystems.find(s => s.type === 'rotation')
  if (!rotationSubsystem) {
    return { valid: false, reason: 'Rotation subsystem not found' }
  }

  // Check if rotation subsystem is broken
  if (rotationSubsystem.isBroken) {
    return { valid: false, reason: 'Maneuvering thrusters are broken and cannot be used' }
  }

  if (rotationSubsystem.allocatedEnergy === 0) {
    return { valid: false, reason: 'Rotation subsystem not powered' }
  }

  if (rotationSubsystem.usedThisTurn) {
    return { valid: false, reason: 'Rotation subsystem already used this turn' }
  }

  return { valid: true }
}

function validateAllocateAction(ship: ShipState, action: AllocateEnergyAction): ValidationResult {
  const { subsystemType, amount } = action.data

  // Find the subsystem
  const subsystem = ship.subsystems.find(s => s.type === subsystemType)
  if (!subsystem) {
    return { valid: false, reason: `Subsystem ${subsystemType} not found` }
  }

  // Check if subsystem is broken
  if (subsystem.isBroken) {
    return { valid: false, reason: `${subsystemType} is broken and cannot receive energy` }
  }

  // Check reactor has enough available energy
  if (ship.reactor.availableEnergy < amount) {
    return {
      valid: false,
      reason: `Not enough energy available (need ${amount}, have ${ship.reactor.availableEnergy})`,
    }
  }

  // Get subsystem config to check energy constraints
  const config = getSubsystemConfig(subsystemType)

  // Check if allocation would exceed subsystem absolute maximum
  const newTotal = subsystem.allocatedEnergy + amount
  if (newTotal > config.maxEnergy) {
    return {
      valid: false,
      reason: `Would exceed ${subsystemType} absolute maximum capacity (${newTotal}/${config.maxEnergy})`,
    }
  }

  // Subsystems can only be unpowered (0) or powered (>= minEnergy)
  // If currently at 0, must allocate at least minEnergy to power on
  if (subsystem.allocatedEnergy === 0 && newTotal < config.minEnergy) {
    return {
      valid: false,
      reason: `Must allocate at least ${config.minEnergy} energy to power ${subsystemType} (tried to allocate ${amount})`,
    }
  }

  return { valid: true }
}

function validateDeallocateAction(ship: ShipState, action: DeallocateEnergyAction): ValidationResult {
  const { subsystemType, amount } = action.data

  // Find the subsystem
  const subsystem = ship.subsystems.find(s => s.type === subsystemType)
  if (!subsystem) {
    return { valid: false, reason: `Subsystem ${subsystemType} not found` }
  }

  // Check subsystem has energy to deallocate
  if (subsystem.allocatedEnergy === 0) {
    return { valid: false, reason: `${subsystemType} has no energy to deallocate` }
  }

  // Check we're not trying to deallocate more than available
  if (amount > subsystem.allocatedEnergy) {
    return {
      valid: false,
      reason: `Cannot deallocate ${amount} from ${subsystemType} (only ${subsystem.allocatedEnergy} allocated)`,
    }
  }

  // Get subsystem config for min energy check
  const config = getSubsystemConfig(subsystemType)
  const remaining = subsystem.allocatedEnergy - amount

  // Subsystems can only be unpowered (0) or powered (>= minEnergy)
  // Can't leave a subsystem in a partial state between 0 and minEnergy
  if (remaining > 0 && remaining < config.minEnergy) {
    return {
      valid: false,
      reason: `Cannot leave ${subsystemType} partially powered (${remaining}). Deallocate all ${subsystem.allocatedEnergy} to turn off, or deallocate less to stay at ${config.minEnergy}+ energy.`,
    }
  }

  return { valid: true }
}

function validateFireWeaponAction(ship: ShipState, action: FireWeaponAction): ValidationResult {
  const { weaponType, targetPlayerIds } = action.data

  // Check weapon subsystem exists and is powered
  const weaponSubsystem = ship.subsystems.find(s => s.type === weaponType)
  if (!weaponSubsystem) {
    return { valid: false, reason: `${weaponType} not found` }
  }

  // Check if weapon is broken
  if (weaponSubsystem.isBroken) {
    return { valid: false, reason: `${weaponType} is broken and cannot be used` }
  }

  if (!weaponSubsystem.isPowered) {
    return { valid: false, reason: `${weaponType} not powered` }
  }

  if (weaponSubsystem.usedThisTurn) {
    return { valid: false, reason: `${weaponType} already used this turn` }
  }

  // Get weapon config
  const weaponConfig = WEAPONS[weaponType]
  if (!weaponConfig) {
    return { valid: false, reason: `Unknown weapon type: ${weaponType}` }
  }

  // Check target count
  if (targetPlayerIds.length === 0) {
    return { valid: false, reason: 'Must have at least one target' }
  }

  // Each weapon fires once at a single target
  if (targetPlayerIds.length > 1) {
    return {
      valid: false,
      reason: `${weaponType} can only target 1 player at a time, got ${targetPlayerIds.length}`,
    }
  }

  // Check energy cost (single target)
  const totalEnergyCost = weaponConfig.energyCost
  if (weaponSubsystem.allocatedEnergy < totalEnergyCost) {
    return {
      valid: false,
      reason: `Not enough energy (need ${totalEnergyCost}, have ${weaponSubsystem.allocatedEnergy})`,
    }
  }

  return { valid: true }
}
