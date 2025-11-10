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
  sectorRange: number // How many sectors "visible" from current sector on target ring
  arc: 'spinal' | 'broadside' | 'turret' // Firing arc type
  hasRecoil?: boolean // Only for railgun
}

export interface SubsystemConfig {
  id: SubsystemType
  name: string
  minEnergy: number // Minimum energy to function
  maxEnergy: number // Normal max energy (can be exceeded for overclocking)
  overclockThreshold: number // Energy level at which overclocking starts
  heatPerOverclock: number // Heat generated per turn when overclocking
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
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 1, // 3 energy = 1 heat/turn
  },
  rotation: {
    id: 'rotation',
    name: 'Maneuvering Thrusters',
    minEnergy: 1,
    maxEnergy: 1,
    overclockThreshold: 1,
    heatPerOverclock: 0, // Cannot overclock
  },
  scoop: {
    id: 'scoop',
    name: 'Fuel Scoop',
    minEnergy: 1,
    maxEnergy: 1,
    overclockThreshold: 1,
    heatPerOverclock: 0, // Cannot overclock
  },
  laser: {
    id: 'laser',
    name: 'Broadside Laser',
    minEnergy: 2,
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0, // Cannot overclock
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
    maxEnergy: 4,
    overclockThreshold: 3,
    heatPerOverclock: 1, // Always generates heat when firing at 4 energy
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
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0, // Cannot overclock
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
    maxEnergy: 2,
    overclockThreshold: 2,
    heatPerOverclock: 0, // Cannot overclock
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
