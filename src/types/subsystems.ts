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

export interface WeaponStats {
  damage: number
  ringRange: number // How many rings away can be targeted (±ringRange)
  sectorRange: number // Sector spread: broadside uses ±sectorRange, turret uses sector visibility count
  arc: 'spinal' | 'broadside' | 'turret' // Firing arc type
  hasRecoil?: boolean // Only for railgun
}

export interface SubsystemConfig {
  id: SubsystemType
  name: string
  minEnergy: number // Minimum energy to function
  maxEnergy: number // Absolute maximum energy (hard cap, cannot exceed)
  overclockThreshold: number // Energy level at which overclocking starts (generates 1 heat per energy above this)
  weaponStats?: WeaponStats // Only present for weapon subsystems
}

export interface Subsystem {
  type: SubsystemType
  allocatedEnergy: number // Current energy allocation (persists across turns)
  isPowered: boolean // Whether subsystem has enough energy to function
  usedThisTurn: boolean // Whether the subsystem was activated this turn (resets each turn)
}

export interface ReactorState {
  totalCapacity: number // Total reactor capacity (fixed at 10)
  availableEnergy: number // Unallocated energy in reactor
  maxReturnRate: number // Max energy that can be returned per turn (3)
  energyToReturn: number // Energy queued for return this turn
}

export interface HeatState {
  currentHeat: number // Current heat level
  heatToVent: number // Heat queued for venting this turn
}

// Subsystem configurations
export const SUBSYSTEM_CONFIGS: Record<SubsystemType, SubsystemConfig> = {
  engines: {
    id: 'engines',
    name: 'Engines',
    minEnergy: 1,
    maxEnergy: 3, // Can allocate up to 3 energy
    overclockThreshold: 2, // 3 energy generates 1 heat/turn
  },
  rotation: {
    id: 'rotation',
    name: 'Maneuvering Thrusters',
    minEnergy: 1,
    maxEnergy: 1, // Cannot overclock
    overclockThreshold: 1,
  },
  scoop: {
    id: 'scoop',
    name: 'Fuel Scoop',
    minEnergy: 1,
    maxEnergy: 1, // Cannot overclock
    overclockThreshold: 1,
  },
  laser: {
    id: 'laser',
    name: 'Broadside Laser',
    minEnergy: 2,
    maxEnergy: 2, // Cannot overclock
    overclockThreshold: 2,
    weaponStats: {
      damage: 2,
      ringRange: 1, // Can target ±1 ring (adjacent rings only)
      sectorRange: 1, // Covers ±1 sector "visible" from current position
      arc: 'broadside', // Fires radially from ship's sector
    },
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    minEnergy: 4,
    maxEnergy: 4, // Cannot allocate more than 4 energy
    overclockThreshold: 3, // 4 energy generates 1 heat/turn
    weaponStats: {
      damage: 4,
      ringRange: 0, // Only fires on current ring (same ring)
      sectorRange: 0, // Range is 2×ring number along orbit (calculated dynamically)
      arc: 'spinal', // Fires tangentially along orbit in facing direction
      hasRecoil: true, // Causes recoil burn without engine compensation
    },
  },
  missiles: {
    id: 'missiles',
    name: 'Missiles',
    minEnergy: 2,
    maxEnergy: 2, // Cannot overclock
    overclockThreshold: 2,
    weaponStats: {
      damage: 3,
      ringRange: 2, // Can target up to 2 rings away (any direction)
      sectorRange: 3, // Covers ±3 sectors from current position
      arc: 'turret', // Can fire in any direction
    },
  },
  shields: {
    id: 'shields',
    name: 'Shields',
    minEnergy: 2,
    maxEnergy: 2, // Cannot overclock
    overclockThreshold: 2,
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
  return overclockAmount // Always 1 heat per energy above overclockThreshold
}

export function canSubsystemFunction(subsystem: Subsystem): boolean {
  const config = getSubsystemConfig(subsystem.type)
  return subsystem.allocatedEnergy >= config.minEnergy
}
