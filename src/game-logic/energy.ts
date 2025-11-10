import type { ShipState } from '../types/game'
import type { Subsystem, SubsystemType } from '../types/subsystems'

/**
 * Pure function to allocate energy to a subsystem
 * Returns new ship state with updated reactor and subsystem
 */
export function allocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): ShipState {
  const subsystem = ship.subsystems.find(s => s.type === subsystemType)
  if (!subsystem) {
    return ship
  }

  // Can't allocate more than available
  if (amount > ship.reactor.availableEnergy) {
    return ship
  }

  const oldAllocation = subsystem.allocatedEnergy
  const difference = amount - oldAllocation

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.availableEnergy - difference,
      energyToReturn: ship.reactor.energyToReturn + oldAllocation,
    },
    subsystems: ship.subsystems.map(s =>
      s.type === subsystemType
        ? {
            ...s,
            allocatedEnergy: amount,
            isPowered: amount > 0,
          }
        : s
    ),
  }
}

/**
 * Pure function to deallocate all energy from a subsystem
 * Returns new ship state with energy returned to reactor
 */
export function deallocateEnergy(ship: ShipState, subsystemType: SubsystemType): ShipState {
  const subsystem = ship.subsystems.find(s => s.type === subsystemType)
  if (!subsystem) {
    return ship
  }

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      energyToReturn: ship.reactor.energyToReturn + subsystem.allocatedEnergy,
    },
    subsystems: ship.subsystems.map(s =>
      s.type === subsystemType
        ? {
            ...s,
            allocatedEnergy: 0,
            isPowered: false,
          }
        : s
    ),
  }
}

/**
 * Pure function to process energy return from subsystems to reactor
 * Returns new ship state with energy returned up to max return rate
 */
export function processEnergyReturn(ship: ShipState): ShipState {
  const { energyToReturn, maxReturnRate, availableEnergy, totalCapacity } = ship.reactor
  const { heatToVent } = ship.heat

  // Calculate actual return amount (limited by max return rate and heat venting)
  const availableReturnCapacity = Math.max(0, maxReturnRate - heatToVent)

  // Can't return more than what would fit in the reactor
  const maxCanFit = totalCapacity - availableEnergy

  // Actual return is the minimum of: what we want to return, what fits, and return capacity
  const actualReturn = Math.min(energyToReturn, availableReturnCapacity, maxCanFit)

  // New available energy
  const newAvailable = availableEnergy + actualReturn

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: newAvailable,
      energyToReturn: energyToReturn - actualReturn,
    },
  }
}

/**
 * Validates if energy can be allocated to a subsystem
 */
export function canAllocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): { valid: boolean; reason?: string } {
  const subsystem = ship.subsystems.find(s => s.type === subsystemType)
  if (!subsystem) {
    return { valid: false, reason: 'Subsystem not found' }
  }

  const difference = amount - subsystem.allocatedEnergy

  if (difference > ship.reactor.availableEnergy) {
    return {
      valid: false,
      reason: `Not enough available energy. Need ${difference}, have ${ship.reactor.availableEnergy}`,
    }
  }

  return { valid: true }
}

/**
 * Gets a subsystem by type
 */
export function getSubsystem(
  subsystems: Subsystem[],
  type: SubsystemType
): Subsystem | undefined {
  return subsystems.find(s => s.type === type)
}

/**
 * Resets all subsystem usage flags
 * Called at the start of each turn
 */
export function resetSubsystemUsage(ship: ShipState): ShipState {
  return {
    ...ship,
    subsystems: ship.subsystems.map(s => ({
      ...s,
      usedThisTurn: false,
    })),
  }
}

/**
 * Marks a subsystem as used this turn
 */
export function markSubsystemUsed(ship: ShipState, type: SubsystemType): ShipState {
  return {
    ...ship,
    subsystems: ship.subsystems.map(s =>
      s.type === type ? { ...s, usedThisTurn: true } : s
    ),
  }
}
