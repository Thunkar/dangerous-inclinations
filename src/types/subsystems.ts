/**
 * Subsystem-based energy and heat management
 *
 * Each subsystem has independent energy allocation that persists across turns.
 * Energy can only be returned to the reactor at a limited rate (3/turn max).
 * Overclocking generates heat, which causes hull damage if not dissipated.
 */

export type SubsystemType =
  | 'engines'
  | 'rotation'
  | 'scoop'
  | 'laser'
  | 'railgun'
  | 'missiles'
  | 'shields'

export interface SubsystemConfig {
  id: SubsystemType
  name: string
  minEnergy: number      // Minimum energy to function
  maxEnergy: number      // Normal max energy (can be exceeded for overclocking)
  overclockThreshold: number  // Energy level at which overclocking starts
  heatPerOverclock: number    // Heat generated per turn when overclocking
}

export interface Subsystem {
  type: SubsystemType
  allocatedEnergy: number  // Current energy allocation (persists across turns)
  isPowered: boolean       // Whether subsystem has enough energy to function
  usedThisTurn: boolean    // Whether the subsystem was activated this turn (resets each turn)
}

export interface ReactorState {
  totalCapacity: number    // Total reactor capacity (fixed at 10)
  availableEnergy: number  // Unallocated energy in reactor
  maxReturnRate: number    // Max energy that can be returned per turn (3)
  energyToReturn: number   // Energy queued for return this turn
}

export interface HeatState {
  currentHeat: number      // Current heat level
  heatToVent: number       // Heat queued for venting this turn
}

// Subsystem configurations
export const SUBSYSTEM_CONFIGS: Record<SubsystemType, SubsystemConfig> = {
  engines: {
    id: 'engines',
    name: 'Engines',
    minEnergy: 1,
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 1,  // 3 energy = 1 heat/turn
  },
  rotation: {
    id: 'rotation',
    name: 'Maneuvering Thrusters',
    minEnergy: 1,
    maxEnergy: 1,
    overclockThreshold: 1,
    heatPerOverclock: 0,  // Cannot overclock
  },
  scoop: {
    id: 'scoop',
    name: 'Fuel Scoop',
    minEnergy: 1,
    maxEnergy: 1,
    overclockThreshold: 1,
    heatPerOverclock: 0,  // Cannot overclock
  },
  laser: {
    id: 'laser',
    name: 'Broadside Laser',
    minEnergy: 2,
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0,  // Cannot overclock
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    minEnergy: 3,
    maxEnergy: 3,
    overclockThreshold: 3,
    heatPerOverclock: 0,  // Cannot overclock
  },
  missiles: {
    id: 'missiles',
    name: 'Missiles',
    minEnergy: 2,
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0,  // Cannot overclock
  },
  shields: {
    id: 'shields',
    name: 'Shields',
    minEnergy: 2,
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0,  // Cannot overclock
  },
}

// Helper functions
export function getSubsystemConfig(type: SubsystemType): SubsystemConfig {
  return SUBSYSTEM_CONFIGS[type]
}

export function isSubsystemOverclocked(subsystem: Subsystem): boolean {
  const config = getSubsystemConfig(subsystem.type)
  return subsystem.allocatedEnergy > config.overclockThreshold
}

export function getSubsystemHeatGeneration(subsystem: Subsystem): number {
  if (!isSubsystemOverclocked(subsystem)) return 0
  const config = getSubsystemConfig(subsystem.type)
  const overclockAmount = subsystem.allocatedEnergy - config.overclockThreshold
  return overclockAmount * config.heatPerOverclock
}

export function canSubsystemFunction(subsystem: Subsystem): boolean {
  const config = getSubsystemConfig(subsystem.type)
  return subsystem.allocatedEnergy >= config.minEnergy
}
