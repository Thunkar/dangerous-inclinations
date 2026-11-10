/**
 * The numbers the cheatsheet and the printed card state, worked out once from
 * the engine. Nothing here is a rule of its own: each is a constant or a
 * config read back in the form a sentence needs it.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  D10_FACES,
  FIXED_SUBSYSTEM_TYPES,
  INTERCEPT_HEAT,
  INTERCEPT_ROLL,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  getAdjustmentRange,
  interceptsPerRack,
  lowestCriticalFace,
  rollToResult,
  fill,
  shieldPointsPerEnergyOf,
} from '@dangerous-inclinations/engine'
import { TABLE_TEXT } from '../text/table'

const POWERED = TABLE_TEXT.loadout.powered

export const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0
/** The energy each powered subsystem takes: a full shield, a rack and a sensor alike; a half shield half it. */
export const HALF_SHIELD = SUBSYSTEM_CONFIGS.shields.minEnergy
export const FULL_SHIELD = SUBSYSTEM_CONFIGS.shields.maxEnergy
export const RACK_ENERGY = SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy
export const SENSOR_ENERGY = SUBSYSTEM_CONFIGS.sensor_array.minEnergy

/** The d10's faces, 1 up to the engine's top face. */
export const D10: readonly number[] = Array.from({ length: D10_FACES }, (_, i) => i + 1)

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

/** Points of plasma a shield energy stops, against SHIELD_POINTS_PER_ENERGY of every other weapon. */
export const PLASMA_SHIELD_POINTS = shieldPointsPerEnergyOf(
  SUBSYSTEM_CONFIGS.plasma_cannon.weaponStats
)

/** Shields stop every weapon but a laser, unless the laser's config says otherwise. */
const LASERS_PIERCE = SUBSYSTEM_CONFIGS.laser.weaponStats?.ignoresShields ?? false

/** What a powered subsystem does until its owner's next turn, with the engine's numbers. */
export function poweredEffect(type: SubsystemType): string {
  switch (type) {
    case 'shields':
      return fill(POWERED.shields, {
        points: SHIELD_POINTS_PER_ENERGY,
        plasma: PLASMA_SHIELD_POINTS,
        lasers: LASERS_PIERCE ? POWERED.notLasers : '',
      })
    case 'ballistic_rack':
      return fill(POWERED.rack, { intercepts: interceptsPerRack(), heat: INTERCEPT_HEAT })
    case 'sensor_array':
      return fill(POWERED.sensor, { crit: SENSOR_CRIT, top: D10[D10.length - 1] })
    default:
      return ''
  }
}

/** A ballistic rack with energy on it downs a missile on this roll or better. */
export const INTERCEPT_ON = INTERCEPT_ROLL

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
