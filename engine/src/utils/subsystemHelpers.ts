import type { Subsystem, SubsystemType, ReactorState, HeatState } from '../types/subsystems'
import type { ShipState } from '../types/game'
import { canSubsystemFunction, getSubsystemConfig, getMissileStats } from '../types/subsystems'
import {
  STARTING_REACTION_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
} from '../constants/rings'

// Re-export for convenience
export { getSubsystemConfig }

// Constants for ship initialization
export const DEFAULT_HIT_POINTS = 10

/**
 * Initialize a ship's subsystems with default state
 * Missiles subsystem gets ammo initialized from config
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

  const missileStats = getMissileStats()

  return subsystemTypes.map(type => {
    const base: Subsystem = {
      type,
      allocatedEnergy: 0,
      isPowered: false,
      usedThisTurn: false,
    }

    // Initialize ammo for missiles subsystem
    if (type === 'missiles') {
      base.ammo = missileStats.maxAmmo
    }

    return base
  })
}

/**
 * Initialize reactor state
 */
export function createInitialReactorState(): ReactorState {
  return {
    totalCapacity: 10,
    availableEnergy: 10,  // Start with full reactor
  }
}

/**
 * Initialize heat state
 */
export function createInitialHeatState(): HeatState {
  return {
    currentHeat: 0,
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
 * Deallocate energy from a subsystem (immediate, no limit)
 * Energy returns directly to reactor
 */
export function deallocateEnergyFromSubsystem(
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
    availableEnergy: Math.min(reactor.totalCapacity, reactor.availableEnergy + returnAmount),
  }

  return {
    subsystems: updatedSubsystems,
    reactor: updatedReactor,
  }
}


/**
 * Reset all subsystems' usedThisTurn flags at the start of a turn
 */
export function resetSubsystemUsage(subsystems: Subsystem[]): Subsystem[] {
  return subsystems.map(s => ({ ...s, usedThisTurn: false }))
}


/**
 * Get total allocated energy across all subsystems
 */
export function getTotalAllocatedEnergy(subsystems: Subsystem[]): number {
  return subsystems.reduce((total, s) => total + s.allocatedEnergy, 0)
}

/**
 * Create an initial ship state with all default values.
 * Position fields (wellId, ring, sector, facing) must be provided.
 * All other fields use sensible defaults that can be overridden.
 */
export function createInitialShipState(
  position: {
    wellId: string
    ring: number
    sector: number
    facing: 'prograde' | 'retrograde'
  },
  overrides: Partial<ShipState> = {}
): ShipState {
  return {
    wellId: position.wellId,
    ring: position.ring,
    sector: position.sector,
    facing: position.facing,
    reactionMass: STARTING_REACTION_MASS,
    hitPoints: DEFAULT_HIT_POINTS,
    maxHitPoints: DEFAULT_HIT_POINTS,
    transferState: null,
    subsystems: createInitialSubsystems(),
    reactor: createInitialReactorState(),
    heat: createInitialHeatState(),
    dissipationCapacity: DEFAULT_DISSIPATION_CAPACITY,
    ...overrides,
  }
}
