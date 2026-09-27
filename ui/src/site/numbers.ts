/**
 * The numbers the cheatsheet and the printed card state, worked out once from
 * the engine. Nothing here is a rule of its own: each is a constant or a
 * config read back in the form a sentence needs it.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  FIXED_SUBSYSTEM_TYPES,
  SHIELD_ENERGY_PER_POINT,
  SUBSYSTEM_CONFIGS,
  getAdjustmentRange,
  interceptsPerRack,
  lowestCriticalFace,
  rollToResult,
} from '@dangerous-inclinations/engine'

export const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0
/** The energy each powered subsystem takes: a half shield, a rack and a sensor alike; a full shield twice it. */
export const HALF_SHIELD = SUBSYSTEM_CONFIGS.shields.minEnergy
export const FULL_SHIELD = SUBSYSTEM_CONFIGS.shields.maxEnergy
export const RACK_ENERGY = SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy
export const SENSOR_ENERGY = SUBSYSTEM_CONFIGS.sensor_array.minEnergy

export const D10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** The lowest face that is a critical, bare and with a powered sensor. */
export const BASE_CRIT = lowestCriticalFace([])
export const SENSOR_CRIT = lowestCriticalFace([
  { type: 'sensor_array', allocatedEnergy: SENSOR_ENERGY, isBroken: false },
])
/** What a face of the d10 does, bare or with a powered sensor: the engine's roll table. */
export const faceResult = (face: number, sensor = false) =>
  rollToResult(face, sensor ? SENSOR_CRIT : BASE_CRIT)
/** The highest face that misses. */
export const MISS_TOP = D10.filter(face => rollToResult(face) === 'miss').pop() ?? 1

/** Shields stop every weapon but a laser, unless the laser's config says otherwise. */
const LASERS_PIERCE = SUBSYSTEM_CONFIGS.laser.weaponStats?.ignoresShields ?? false

/** What a powered subsystem does until its owner's next turn, with the engine's numbers. */
export function poweredEffect(type: SubsystemType): string {
  switch (type) {
    case 'shields':
      return `shields absorb 1 damage per ${SHIELD_ENERGY_PER_POINT} energy${
        LASERS_PIERCE ? ' (not lasers)' : ''
      }`
    case 'ballistic_rack':
      return `a rack rolls at ${interceptsPerRack()} missiles a turn`
    case 'sensor_array':
      return `a sensor makes your criticals ${SENSOR_CRIT}–10`
    default:
      return ''
  }
}

/** A ballistic rack with energy on it downs a missile on this roll or better (`missiles.ts`). */
export const INTERCEPT_ON = 2

export const weaponStats = (type: SubsystemType) => SUBSYSTEM_CONFIGS[type].weaponStats!

/** A tile's energy as a player reads it: "4", "2–4", or "–" for a passive. */
export function energyLabel(type: SubsystemType): string {
  const { minEnergy, maxEnergy } = SUBSYSTEM_CONFIGS[type]
  if (maxEnergy === 0) return '–'
  return minEnergy === maxEnergy ? `${minEnergy}` : `${minEnergy}–${maxEnergy}`
}

/** The name on the tile, without the words a card has no room for. */
export function tileName(type: SubsystemType): string {
  return SUBSYSTEM_CONFIGS[type].name
    .replace('Broadside ', '')
    .replace('Maneuvering ', '')
    .replace('Fuel Compressor', 'Compressor')
}

/** What may go in each slot, read off the tiles' own slot types. */
const TILE_ORDER = Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]
export const FORWARD_TILES = TILE_ORDER.filter(t =>
  ['forward', 'either'].includes(SUBSYSTEM_CONFIGS[t].slotType)
)
export const SIDE_TILES = TILE_ORDER.filter(t =>
  ['side', 'either'].includes(SUBSYSTEM_CONFIGS[t].slotType)
)
export const FIXED_TILES = FIXED_SUBSYSTEM_TYPES

/**
 * Phasing, as a strip of sectors: where a burn from a ring of `speed` can land,
 * counted from the sector it started on, and the fuel each landing costs. The
 * drift is free; each sector short of it or past it is one fuel.
 */
export function phasingStrip(speed: number): Array<{ sector: number; fuel: number }> {
  const { min, max } = getAdjustmentRange(speed)
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const shift = min + i
    return { sector: speed + shift, fuel: Math.abs(shift) }
  })
}
