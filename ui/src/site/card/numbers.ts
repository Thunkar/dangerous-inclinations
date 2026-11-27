/**
 * Every number the player card prints, read from the engine once.
 * Nothing here is a rule of its own.
 */
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_POINTS_TO_WIN,
  BLACK_HOLE_OUTER_RING,
  INTERCEPT_HEAT,
  PLANET_OUTER_RING,
  TRANSFER_ARC_LENGTH,
  MAX_HEAT,
  MISSION_POINTS,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  SHIELD_POINTS_PER_ENERGY,
  STATION_DRIFT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  foldEngines,
  baseFoldFuel,
  compressedFoldFuel,
  getMissileStats,
  heatAfterCheck,
  heatDamage,
} from '@dangerous-inclinations/engine'
import {
  BASE_CRIT,
  FULL_SHIELD,
  D10,
  MISS_TOP,
  PLASMA_SHIELD_POINTS,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  SENSOR_ENERGY,
} from '../numbers'

const soft = BURN_COSTS.soft
const hard = BURN_COSTS.hard

/** "1–3", or "2" when both ends agree. */
export const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)

export const N = {
  points: DEFAULT_POINTS_TO_WIN,
  primary: MISSION_POINTS.destroy_ship,
  secondary: MISSION_POINTS.survey,

  scoop: SUBSYSTEM_CONFIGS.scoop.minEnergy,
  rotate: SUBSYSTEM_CONFIGS.rotation.minEnergy,
  burnEnergy: span(soft.energy, hard.energy),
  burnFuel: span(soft.mass, hard.mass),
  burnRings: span(soft.rings, hard.rings),
  jumpEnergy: WELL_TRANSFER_COSTS.energy,
  jumpFuel: WELL_TRANSFER_COSTS.mass,
  compressed: COMPRESSED_JUMP_MASS,
  foldFuel: baseFoldFuel(),
  compressedFoldFuel: compressedFoldFuel(),
  foldEngines: foldEngines(),
  foldDrive: SUBSYSTEM_CONFIGS.jump_drive.minEnergy,
  foldEnergy: SUBSYSTEM_CONFIGS.jump_drive.minEnergy + foldEngines(),
  laneSectors: TRANSFER_ARC_LENGTH,
  holeOuter: BLACK_HOLE_OUTER_RING,
  planetOuter: PLANET_OUTER_RING,
  phaseFuel: SECTOR_ADJUSTMENT_COST_PER_SECTOR,

  stationDrift: STATION_DRIFT,
  missileSteps: getMissileStats().stepsPerMove,

  d10: D10,
  top: D10[D10.length - 1],
  miss: MISS_TOP,
  hitFrom: MISS_TOP + 1,
  hitTo: BASE_CRIT - 1,
  crit: BASE_CRIT,
  sensorCrit: SENSOR_CRIT,
  sensorEnergy: SENSOR_ENERGY,
  shieldPoints: SHIELD_POINTS_PER_ENERGY,
  plasmaShieldPoints: PLASMA_SHIELD_POINTS,

  interceptHeat: INTERCEPT_HEAT,
  maxHeat: MAX_HEAT,
  dissipation: DEFAULT_DISSIPATION_CAPACITY,
  radiator: RADIATOR_DISSIPATION,
} as const

/**
 * The worked heat check the back draws: heat carried in, the cubes on the
 * loadout, and what the engine says comes of it with no radiator.
 */
export const HEAT_EXAMPLE = (() => {
  const carried = 4
  const cubes = 9
  const total = carried + cubes
  return {
    carried,
    cubes,
    total,
    damage: heatDamage(total),
    carry: heatAfterCheck(total, N.dissipation),
  }
})()

/**
 * The worked shot the back draws: a railgun hit into a full shield, and what
 * the shield stops, as heat, against what reaches the hull.
 */
export const SHOT_EXAMPLE = (() => {
  const damage = SUBSYSTEM_CONFIGS.railgun.weaponStats?.damage ?? 0
  const cubes = FULL_SHIELD
  const stopped = Math.min(damage, cubes * SHIELD_POINTS_PER_ENERGY)
  return { damage, cubes, stopped, hull: damage - stopped }
})()
