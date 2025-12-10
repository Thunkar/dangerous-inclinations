/**
 * Subsystem-based energy and heat management
 *
 * Each subsystem has independent energy allocation that persists across turns.
 * Energy deallocation is unlimited.
 * Heat is generated when subsystems are USED, equal to their allocated energy.
 * Ships have a dissipation capacity (see DEFAULT_DISSIPATION_CAPACITY) that automatically removes heat each turn.
 * Excess heat (above dissipation capacity) causes hull damage.
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
  // Ammunition-based weapon stats (for missiles, future torpedo/bomb systems)
  maxAmmo?: number // Maximum ammunition capacity (undefined = unlimited)
  fuelPerTurn?: number // Fuel available per turn for guided projectiles
  maxTurnsAlive?: number // How many turns before projectile expires
}

export interface SubsystemConfig {
  id: SubsystemType
  name: string
  minEnergy: number // Minimum energy to function
  maxEnergy: number // Absolute maximum energy (hard cap, cannot exceed)
  generatesHeatOnUse: boolean // Whether using this subsystem generates heat equal to allocated energy
  weaponStats?: WeaponStats // Only present for weapon subsystems
}

export interface Subsystem {
  type: SubsystemType
  allocatedEnergy: number // Current energy allocation (persists across turns)
  isPowered: boolean // Whether subsystem has enough energy to function
  usedThisTurn: boolean // Whether the subsystem was activated this turn (resets each turn)
  ammo?: number // Current ammunition (only for ammo-based weapons like missiles)
  isBroken?: boolean // If true, subsystem is broken and cannot be used until repaired (critical hit effect)
}

export interface ReactorState {
  totalCapacity: number // Total reactor capacity (fixed at 10)
  availableEnergy: number // Unallocated energy in reactor
}

export interface HeatState {
  currentHeat: number // Current heat level
}

// Subsystem configurations
export const SUBSYSTEM_CONFIGS: Record<SubsystemType, SubsystemConfig> = {
  engines: {
    id: 'engines',
    name: 'Engines',
    minEnergy: 1,
    maxEnergy: 3,
    generatesHeatOnUse: true, // Generates heat when burn is executed
  },
  rotation: {
    id: 'rotation',
    name: 'Maneuvering Thrusters',
    minEnergy: 1,
    maxEnergy: 1,
    generatesHeatOnUse: true, // Generates heat when rotation is executed
  },
  scoop: {
    id: 'scoop',
    name: 'Fuel Scoop',
    minEnergy: 3,
    maxEnergy: 3,
    generatesHeatOnUse: true, // Generates heat when scooping
  },
  laser: {
    id: 'laser',
    name: 'Broadside Laser',
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true, // Generates heat when fired
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
    generatesHeatOnUse: true, // Generates heat when fired
    weaponStats: {
      damage: 4,
      ringRange: 0, // Only fires on current ring (same ring)
      sectorRange: 5, // Range of 5 sectors along orbit in facing direction
      arc: 'spinal', // Fires tangentially along orbit in facing direction
      hasRecoil: true, // Causes recoil burn without engine compensation
    },
  },
  missiles: {
    id: 'missiles',
    name: 'Missiles',
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true, // Generates heat when fired
    weaponStats: {
      damage: 2, // Damage dealt on impact (was 3, lowered for balance)
      ringRange: 2, // Can target up to 2 rings away (any direction)
      sectorRange: 3, // Covers ±3 sectors from current position
      arc: 'turret', // Can fire in any direction
      maxAmmo: 4, // Maximum missile capacity
      fuelPerTurn: 3, // Guidance fuel per turn (rings + sectors missile can move)
      maxTurnsAlive: 3, // Missile expires after 3 turns if it doesn't hit
    },
  },
  shields: {
    id: 'shields',
    name: 'Shields',
    minEnergy: 1, // Lowered min energy for flexibility
    maxEnergy: 4, // Increased max to allow more absorption
    generatesHeatOnUse: false, // Reactive, converts damage to heat
  },
}

// Helper functions
export function getSubsystemConfig(type: SubsystemType): SubsystemConfig {
  return SUBSYSTEM_CONFIGS[type]
}

/**
 * Get heat generated when a subsystem is used.
 * Returns allocated energy if subsystem generates heat on use, otherwise 0.
 */
export function getHeatOnUse(subsystem: Subsystem): number {
  const config = getSubsystemConfig(subsystem.type)
  if (!config.generatesHeatOnUse) return 0
  return subsystem.allocatedEnergy
}

export function canSubsystemFunction(subsystem: Subsystem): boolean {
  if (subsystem.isBroken) return false
  const config = getSubsystemConfig(subsystem.type)
  return subsystem.allocatedEnergy >= config.minEnergy
}

/**
 * Get missile-specific stats from the missiles subsystem config
 * Throws if called for non-missile subsystem
 */
export function getMissileStats(): Required<Pick<WeaponStats, 'damage' | 'maxAmmo' | 'fuelPerTurn' | 'maxTurnsAlive'>> {
  const config = SUBSYSTEM_CONFIGS.missiles
  const stats = config.weaponStats!
  return {
    damage: stats.damage,
    maxAmmo: stats.maxAmmo!,
    fuelPerTurn: stats.fuelPerTurn!,
    maxTurnsAlive: stats.maxTurnsAlive!,
  }
}
