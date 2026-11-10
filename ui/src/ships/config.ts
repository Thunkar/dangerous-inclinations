import {
  BOT_PRESET_LOADOUTS,
  COMPRESSED_JUMP_MASS,
  INTERCEPT_HEAT,
  SCAN_SECTOR_RANGE,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  canInstallInSlot,
  fill,
  interceptsPerRack,
  type ShipLoadout,
  type ShipAppearance,
  type SubsystemType,
} from '@dangerous-inclinations/engine'

import {
  PLASMA_SHIELD_POINTS,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  weaponStats,
} from '../site/numbers'
import { SCREENS } from '../text/screens'
import { HULL_INK } from './palette'
import { MOUNTS, type MountId } from './mounts'
import { SHRIKE_MOUNTS, MANTIS_MOUNTS } from './hulls'
import { CORVETTE } from './corvetteShape'
export { MOUNTS, type MountId } from './mounts'
export type Vec3 = [number, number, number]
export type Finish = 'paint' | 'resin'
export interface ShipConfig {
  /** Optional production cosmetics; authoring controls stay independent. */
  appearance?: ShipAppearance
  version: 1
  loadout: ShipLoadout
  length: number
  beam: number
  armor: number
  engineSize: number
  paint: string
  accent: string
  finish: Finish
}

export const DEFAULT_CONFIG: ShipConfig = {
  version: 1,
  loadout: structuredClone(BOT_PRESET_LOADOUTS.gunship),
  length: 1,
  beam: 1,
  armor: 1,
  engineSize: 1,
  paint: HULL_INK.paint,
  accent: HULL_INK.accent,
  finish: 'paint',
}

const notes = SCREENS.shipyard.notes

/** What each module does, with the engine's numbers. */
export const MODULE_NOTES: Partial<Record<SubsystemType, string>> = {
  railgun: fill(notes.railgun, {
    damage: weaponStats('railgun').damage,
    range: weaponStats('railgun').sectorRange ?? 0,
  }),
  sensor_array: fill(notes.sensor_array, { range: SCAN_SECTOR_RANGE, crit: SENSOR_CRIT }),
  missiles: fill(notes.missiles, { ammo: weaponStats('missiles').maxAmmo ?? 0 }),
  laser: fill(notes.laser, { damage: weaponStats('laser').damage }),
  shields: fill(notes.shields, { points: SHIELD_POINTS_PER_ENERGY, plasma: PLASMA_SHIELD_POINTS }),
  radiator: fill(notes.radiator, { dissipation: RADIATOR_DISSIPATION }),
  fuel_compressor: fill(notes.fuel_compressor, {
    compressed: COMPRESSED_JUMP_MASS,
    fuel: WELL_TRANSFER_COSTS.mass,
  }),
  ballistic_rack: fill(notes.ballistic_rack, {
    damage: weaponStats('ballistic_rack').damage,
    intercepts: interceptsPerRack(),
    heat: INTERCEPT_HEAT,
  }),
  plasma_cannon: fill(notes.plasma_cannon, {
    damage: weaponStats('plasma_cannon').damage,
    rings: weaponStats('plasma_cannon').ringRange ?? 0,
    sectors: weaponStats('plasma_cannon').sectorRange ?? 0,
    plasma: PLASMA_SHIELD_POINTS,
  }),
  disruptor: fill(notes.disruptor, { energy: SUBSYSTEM_CONFIGS.disruptor.minEnergy }),
}

export function moduleAt(config: ShipConfig, id: MountId): SubsystemType | null {
  const mount = MOUNTS.find(m => m.id === id)!
  return mount.group === 'forward'
    ? config.loadout.forwardSlots[mount.index]
    : config.loadout.sideSlots[mount.index]
}

export function setModule(config: ShipConfig, id: MountId, type: SubsystemType | null): ShipConfig {
  const mount = MOUNTS.find(m => m.id === id)!
  if (type && !canInstallInSlot(type, mount.group)) return config
  const loadout = structuredClone(config.loadout)
  if (mount.group === 'forward') loadout.forwardSlots[0] = type
  else loadout.sideSlots[mount.index] = type
  return { ...config, loadout }
}

/**
 * Where a mount sits on the hull the ship flies: `hulls.ts` for any but the
 * corvette, whose mounts follow its proportions below. Every mount shares one
 * local frame: +Y is outboard, +X is forward and +Z is dorsal. Starboard is the port mount *reflected* across the centreline, so the
 * two flanks are mirror images of each other rather than the same part rolled
 * upside down; the reflection is the negative Z scale.
 */
export function mountTransform(
  config: ShipConfig,
  id: MountId
): { position: Vec3; rotation: Vec3; scale: Vec3; normal: Vec3 } {
  if (config.appearance?.hull === 'shrike') return SHRIKE_MOUNTS[id]
  if (config.appearance?.hull === 'mantis') return MANTIS_MOUNTS[id]
  if (id === 'forward-0') {
    return {
      position: [CORVETTE.mounts.bow * config.length, 0, 0],
      // The shoe's long axis spans the bow, so the rails sit side by side.
      rotation: [-Math.PI / 2, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      normal: [1, 0, 0],
    }
  }
  const index = MOUNTS.find(m => m.id === id)!.index
  const side = index < 2 ? -1 : 1
  return {
    position: [
      (index % 2 === 0 ? CORVETTE.mounts.fore : CORVETTE.mounts.aft) * config.length,
      0,
      side * CORVETTE.mounts.flank * config.beam,
    ],
    rotation: [(side * Math.PI) / 2, 0, 0],
    scale: [1, 1, -side],
    normal: [0, 0, side],
  }
}

// Imports and links are untrusted. Validate before touching engine helpers,
// which assume their callers already have a valid SubsystemType.
export function parseConfig(value: unknown): ShipConfig {
  if (!value || typeof value !== 'object') throw new Error('This is not a shipyard design.')
  const v = value as Record<string, unknown>
  if (v.version !== 1) throw new Error('Unsupported design version.')
  const next = structuredClone(DEFAULT_CONFIG)
  const ranges = {
    length: [0.9, 1.3],
    beam: [0.8, 1.3],
    armor: [0.65, 1.4],
    engineSize: [0.75, 1.3],
  } as const
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const n = v[key]
    const [min, max] = ranges[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
      throw new Error(`Invalid ${key} in design.`)
    }
    next[key] = n
  }
  for (const key of ['paint', 'accent'] as const) {
    if (typeof v[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(v[key]))
      throw new Error('Invalid paint color.')
    next[key] = v[key]
  }
  if (v.finish !== 'paint' && v.finish !== 'resin') throw new Error('Invalid material finish.')
  next.finish = v.finish
  const loadout = v.loadout as Record<string, unknown> | undefined
  for (const [key, count, group] of [
    ['forwardSlots', 1, 'forward'],
    ['sideSlots', 4, 'side'],
  ] as const) {
    const slots = loadout?.[key]
    if (!Array.isArray(slots) || slots.length !== count) throw new Error('Invalid mount layout.')
    slots.forEach((type, index) => {
      if (
        type !== null &&
        (typeof type !== 'string' ||
          !Object.hasOwn(SUBSYSTEM_CONFIGS, type) ||
          !canInstallInSlot(type as SubsystemType, group))
      )
        throw new Error(`Invalid subsystem in ${key}.`)
      next.loadout[key][index] = type
    })
  }
  return next
}
