import {
  BOT_LOADOUT_TEMPLATES,
  SUBSYSTEM_CONFIGS,
  canInstallInSlot,
  type ShipLoadout,
  type ShipAppearance,
  type SubsystemType,
} from '@dangerous-inclinations/engine'

import { HULL_INK } from './palette'
import { MOUNTS, type MountId } from './mounts'
export { MOUNTS, type MountId } from './mounts'
export type Vec3 = [number, number, number]
export type Finish = 'paint' | 'resin'
export interface WorkshopConfig {
  /** Optional production cosmetics; authoring controls stay independent. */
  appearance?: ShipAppearance
  identity?: string
  version: 1
  loadout: ShipLoadout
  length: number
  beam: number
  armor: number
  engineSize: number
  engines: 1 | 3 | 5
  paint: string
  accent: string
  finish: Finish
  hullMillimeters: number
  magnetMillimeters: number
}

export const DEFAULT_CONFIG: WorkshopConfig = {
  version: 1,
  loadout: structuredClone(BOT_LOADOUT_TEMPLATES['hunter-aggressive']),
  length: 1,
  beam: 1,
  armor: 1,
  engineSize: 1,
  engines: 3,
  paint: HULL_INK.paint,
  accent: HULL_INK.accent,
  finish: 'paint',
  hullMillimeters: 60,
  magnetMillimeters: 3,
}

export const MODULE_NOTES: Partial<Record<SubsystemType, string>> = {
  railgun: 'Heavy paired rails with a narrow accelerator channel, coil jackets, and cooling lines.',
  sensor_array: 'Four faceted sensor arrays, paired optics, and protected antenna elements.',
  missiles: 'A four-cell silo cassette with exposed warhead noses and armored rims.',
  laser: 'A compact broadside lens recessed into a short armored focusing collar.',
  shields: 'Three exposed field coils in an open protective cage.',
  radiator: 'Twin thin radiator panels with shallow coolant manifolds and exposed radiative faces.',
  fuel_compressor: 'Twin fore–aft pressure tanks, cradled in saddles against the hull.',
  ballistic_rack:
    'An armored PDC turret with a traverse ring, elevation cradle, and short barrel cluster.',
}

export function moduleAt(config: WorkshopConfig, id: MountId): SubsystemType | null {
  const mount = MOUNTS.find(m => m.id === id)!
  return mount.group === 'forward'
    ? config.loadout.forwardSlots[mount.index]
    : config.loadout.sideSlots[mount.index]
}

export function setModule(
  config: WorkshopConfig,
  id: MountId,
  type: SubsystemType | null
): WorkshopConfig {
  const mount = MOUNTS.find(m => m.id === id)!
  if (type && !canInstallInSlot(type, mount.group)) return config
  const loadout = structuredClone(config.loadout)
  if (mount.group === 'forward') loadout.forwardSlots[0] = type
  else loadout.sideSlots[mount.index] = type
  return { ...config, loadout }
}

/**
 * Every mount shares one local frame: +Y is outboard, +X is forward and +Z is
 * dorsal. Starboard is the port mount *reflected* across the centreline, so the
 * two flanks are mirror images of each other rather than the same part rolled
 * upside down; the reflection is the negative Z scale.
 */
export function mountTransform(
  config: WorkshopConfig,
  id: MountId
): { position: Vec3; rotation: Vec3; scale: Vec3; normal: Vec3 } {
  if (id === 'forward-0') {
    return {
      position: [3.05 * config.length, 0, 0],
      // The shoe's long axis spans the bow, so the rails sit side by side.
      rotation: [-Math.PI / 2, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      normal: [1, 0, 0],
    }
  }
  const index = MOUNTS.find(m => m.id === id)!.index
  const side = index < 2 ? -1 : 1
  return {
    position: [(index % 2 === 0 ? 1.58 : -0.64) * config.length, 0, side * 1.08 * config.beam],
    rotation: [(side * Math.PI) / 2, 0, 0],
    scale: [1, 1, -side],
    normal: [0, 0, side],
  }
}

// Imports and links are untrusted. Validate before touching engine helpers,
// which assume their callers already have a valid SubsystemType.
export function parseConfig(value: unknown): WorkshopConfig {
  if (!value || typeof value !== 'object') throw new Error('This is not a shipyard design.')
  const v = value as Record<string, unknown>
  if (v.version !== 1) throw new Error('Unsupported design version.')
  const next = structuredClone(DEFAULT_CONFIG)
  const ranges = {
    length: [0.9, 1.3],
    beam: [0.8, 1.3],
    armor: [0.65, 1.4],
    engineSize: [0.75, 1.3],
    hullMillimeters: [60, 100],
    magnetMillimeters: [2, 4],
  } as const
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const n = v[key]
    const [min, max] = ranges[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
      throw new Error(`Invalid ${key} in design.`)
    }
    next[key] = n
  }
  if (v.engines !== 1 && v.engines !== 3 && v.engines !== 5)
    throw new Error('Invalid engine cluster.')
  next.engines = v.engines
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
