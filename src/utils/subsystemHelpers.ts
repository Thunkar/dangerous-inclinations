import type { Subsystem, SubsystemType, ReactorState, HeatState } from '../types/subsystems'
import { getSubsystemConfig, canSubsystemFunction } from '../types/subsystems'

/**
 * Initialize a ship's subsystems with default state
 */
export function createInitialSubsystems(): Subsystem[] {
  const subsystemTypes: SubsystemType[] = [
    'engines',
    'rotation',
    'scoop',
    'laser',
    'railgun',
    'missiles',
    'shields',
  ]

  return subsystemTypes.map(type => ({
    type,
    allocatedEnergy: 0,
    isPowered: false,
    usedThisTurn: false,
  }))
}

/**
 * Initialize reactor state
 */
export function createInitialReactorState(): ReactorState {
  return {
    totalCapacity: 10,
    availableEnergy: 10,  // Start with full reactor
    maxReturnRate: 3,
    energyToReturn: 0,
  }
}

/**
 * Initialize heat state
 */
export function createInitialHeatState(): HeatState {
  return {
    currentHeat: 0,
    heatToVent: 0,
  }
}

/**
 * Get a subsystem by type
 */
export function getSubsystem(subsystems: Subsystem[], type: SubsystemType): Subsystem | undefined {
  return subsystems.find(s => s.type === type)
}

/**
 * Update a specific subsystem
 */
export function updateSubsystem(
  subsystems: Subsystem[],
  type: SubsystemType,
  updates: Partial<Subsystem>
): Subsystem[] {
  return subsystems.map(s => (s.type === type ? { ...s, ...updates } : s))
}

/**
 * Allocate energy to a subsystem
 * Returns updated subsystems and reactor state
 */
export function allocateEnergy(
  subsystems: Subsystem[],
  reactor: ReactorState,
  subsystemType: SubsystemType,
  amount: number
): { subsystems: Subsystem[]; reactor: ReactorState } {
  const subsystem = getSubsystem(subsystems, subsystemType)
  if (!subsystem) {
    return { subsystems, reactor }
  }

  const delta = amount - subsystem.allocatedEnergy

  // Check if we have enough energy in the reactor
  if (delta > reactor.availableEnergy) {
    return { subsystems, reactor }
  }

  const updatedSubsystems = updateSubsystem(subsystems, subsystemType, {
    allocatedEnergy: amount,
    isPowered: canSubsystemFunction({ ...subsystem, allocatedEnergy: amount }),
  })

  const updatedReactor = {
    ...reactor,
    availableEnergy: reactor.availableEnergy - delta,
  }

  return {
    subsystems: updatedSubsystems,
    reactor: updatedReactor,
  }
}

/**
 * Request energy return from a subsystem
 * Adds to the energyToReturn queue, which will be processed at end of turn
 */
export function requestEnergyReturn(
  subsystems: Subsystem[],
  reactor: ReactorState,
  subsystemType: SubsystemType,
  amount: number
): { subsystems: Subsystem[]; reactor: ReactorState } {
  const subsystem = getSubsystem(subsystems, subsystemType)
  if (!subsystem) {
    return { subsystems, reactor }
  }

  const returnAmount = Math.min(amount, subsystem.allocatedEnergy)

  const updatedSubsystems = updateSubsystem(subsystems, subsystemType, {
    allocatedEnergy: subsystem.allocatedEnergy - returnAmount,
    isPowered: canSubsystemFunction({ ...subsystem, allocatedEnergy: subsystem.allocatedEnergy - returnAmount }),
  })

  const updatedReactor = {
    ...reactor,
    energyToReturn: reactor.energyToReturn + returnAmount,
  }

  return {
    subsystems: updatedSubsystems,
    reactor: updatedReactor,
  }
}

/**
 * Process end-of-turn energy return (limited by maxReturnRate and heat venting)
 */
export function processEnergyReturn(
  reactor: ReactorState,
  heat: HeatState
): { reactor: ReactorState; heat: HeatState } {
  // Heat venting reduces available return rate 1:1
  const effectiveReturnRate = Math.max(0, reactor.maxReturnRate - heat.heatToVent)

  // Return energy up to the effective rate
  const actualReturn = Math.min(reactor.energyToReturn, effectiveReturnRate)

  // Vent heat
  const actualVent = Math.min(heat.heatToVent, heat.currentHeat)

  return {
    reactor: {
      ...reactor,
      availableEnergy: Math.min(
        reactor.totalCapacity,
        reactor.availableEnergy + actualReturn
      ),
      energyToReturn: reactor.energyToReturn - actualReturn,
    },
    heat: {
      ...heat,
      currentHeat: heat.currentHeat - actualVent,
      heatToVent: 0,
    },
  }
}

/**
 * Reset all subsystems' usedThisTurn flags at the start of a turn
 */
export function resetSubsystemUsage(subsystems: Subsystem[]): Subsystem[] {
  return subsystems.map(s => ({ ...s, usedThisTurn: false }))
}

/**
 * Calculate total heat generation from all subsystems
 */
export function calculateHeatGeneration(subsystems: Subsystem[]): number {
  return subsystems.reduce((total, subsystem) => {
    const config = getSubsystemConfig(subsystem.type)
    if (subsystem.allocatedEnergy > config.overclockThreshold) {
      const overclockAmount = subsystem.allocatedEnergy - config.overclockThreshold
      return total + overclockAmount // Always 1 heat per energy above threshold
    }
    return total
  }, 0)
}

/**
 * Get total allocated energy across all subsystems
 */
export function getTotalAllocatedEnergy(subsystems: Subsystem[]): number {
  return subsystems.reduce((total, s) => total + s.allocatedEnergy, 0)
}
