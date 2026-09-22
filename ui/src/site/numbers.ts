/**
 * The numbers the cheatsheet and the printed card state, worked out once from
 * the engine. Nothing here is a rule of its own: each is a constant or a
 * config read back in the form a sentence needs it.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BASE_CRITICAL_CHANCE,
  FIXED_SUBSYSTEM_TYPES,
  SUBSYSTEM_CONFIGS,
  getAdjustmentRange,
  rollToResult,
} from '@dangerous-inclinations/engine'

export const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0
export const SENSOR_CRIT_BONUS =
  SUBSYSTEM_CONFIGS.sensor_array.passiveEffect?.criticalChanceBonus ?? 0

export const D10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** The lowest face that is a critical, bare and with a powered sensor. */
const lowestCritical = (chance: number) =>
  D10.find(face => rollToResult(face, chance) === 'critical') ?? 10
export const BASE_CRIT = lowestCritical(BASE_CRITICAL_CHANCE)
export const SENSOR_CRIT = lowestCritical(BASE_CRITICAL_CHANCE + SENSOR_CRIT_BONUS)
/** The highest face that misses. */
export const MISS_TOP = D10.filter(face => rollToResult(face) === 'miss').pop() ?? 1

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
