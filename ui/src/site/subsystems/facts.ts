/**
 * What the subsystems card states about a subsystem: its slot, its energy,
 * its damage, its one line and what turns it face up. Every number is the
 * engine's; every word is in `text/subsystemCard.ts`.
 */
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  INTERCEPT_HEAT,
  PLANET_RINGS,
  SCAN_SECTOR_RANGE,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  foldEngines,
  baseFoldFuel,
  compressedFoldFuel,
  getMissileStats,
  interceptsPerRack,
  type SubsystemType,
} from '@dangerous-inclinations/engine'
import { PRESS } from '../../design/press'
import { SUBSYSTEM_CARD as T } from '../../text/subsystemCard'
import {
  D10,
  INTERCEPT_ON,
  PLASMA_SHIELD_POINTS,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  energyLabel,
  tileName,
} from '../numbers'

const missile = getMissileStats()
const burns = Object.values(BURN_COSTS)

/** Every number a line may name, read once from the engine. */
export const NUM = {
  railRange: SUBSYSTEM_CONFIGS.railgun.weaponStats!.sectorRange!,
  laserRings: SUBSYSTEM_CONFIGS.laser.weaponStats!.ringRange!,
  laserSectors: SUBSYSTEM_CONFIGS.laser.weaponStats!.sectorRange!,
  plasmaRings: SUBSYSTEM_CONFIGS.plasma_cannon.weaponStats!.ringRange!,
  plasmaSectors: SUBSYSTEM_CONFIGS.plasma_cannon.weaponStats!.sectorRange!,
  /** A burn's price for each ring, and what cancelling recoil costs: a soft burn's. */
  ringFuel: BURN_COSTS.soft.mass,
  ringEnergy: BURN_COSTS.soft.energy,
  plasma: PLASMA_SHIELD_POINTS,
  points: SHIELD_POINTS_PER_ENERGY,
  intercepts: interceptsPerRack(),
  roll: INTERCEPT_ON,
  interceptHeat: INTERCEPT_HEAT,
  steps: missile.stepsPerMove,
  flights: missile.maxMoves,
  ammo: missile.maxAmmo,
  scan: SCAN_SECTOR_RANGE,
  /** The sensor's critical faces, kept on one line. */
  critRange: `${SENSOR_CRIT}\u2060–\u2060${D10[D10.length - 1]}`,
  burnFuel: `${burns[0].mass}–${burns[burns.length - 1].mass}`,
  base: DEFAULT_DISSIPATION_CAPACITY,
  radiator: RADIATOR_DISSIPATION,
  cooled: DEFAULT_DISSIPATION_CAPACITY + RADIATOR_DISSIPATION,
  jump: WELL_TRANSFER_COSTS.mass,
  compressed: COMPRESSED_JUMP_MASS,
  jumpEnergy: WELL_TRANSFER_COSTS.energy,
  foldFuel: baseFoldFuel(),
  foldEngines: foldEngines(),
  foldDrive: SUBSYSTEM_CONFIGS.jump_drive.minEnergy,
  /** A fold's fuel, split as the table pays it: the engines take a jump's, the drive the rest. */
  foldDriveFuel: baseFoldFuel() - WELL_TRANSFER_COSTS.mass,
  compressedFoldFuel: compressedFoldFuel(),
  burnMin: burns[0].rings,
  burnMax: burns[burns.length - 1].rings,
  holeSpeeds: BLACKHOLE_RINGS.map(r => r.velocity).join(', '),
  planetSpeeds: PLANET_RINGS.map(r => r.velocity).join(', '),
} as const

/** The order the cards set them in: weapons, the sensor, then the rest. */
export const TARGETING = [
  'railgun',
  'laser',
  'plasma_cannon',
  'ballistic_rack',
  'disruptor',
  'missiles',
  'sensor_array',
] as const satisfies readonly SubsystemType[]
export type TargetingType = (typeof TARGETING)[number]

export const UTILITY = [
  'shields',
  'radiator',
  'fuel_compressor',
  'jump_drive',
  'engines',
  'rotation',
  'scoop',
] as const satisfies readonly SubsystemType[]
export type UtilityType = (typeof UTILITY)[number]

/** A family's ink: guns red, the sensor violet, moving teal, the wall and the radiator ochre. */
export function inkOf(type: SubsystemType): string {
  if (type === 'sensor_array') return PRESS.violet
  if (SUBSYSTEM_CONFIGS[type].weaponStats) return PRESS.red
  if (type === 'shields' || type === 'radiator') return PRESS.ochre
  return PRESS.teal
}

export const slotOf = (type: SubsystemType) => T.slots[SUBSYSTEM_CONFIGS[type].slotType]

/** "4", "1–2", "–": the energy an action or a power puts on it. */
export const energyOf = (type: SubsystemType) => energyLabel(type)

/** Damage for a weapon, nothing for the rest. */
export const damageOf = (type: SubsystemType): number | undefined =>
  SUBSYSTEM_CONFIGS[type].weaponStats?.damage

export const nameOf = (type: SubsystemType) => T.names[type] ?? tileName(type)
