import type { GravityWell, RingConfig, TransferPoint } from '../types/game'
import { calculateTransferPoints } from '../utils/transferPoints'

/**
 * Black hole ring configuration - 5 rings with variable velocity
 * Inner rings move MUCH faster (dramatic speed differences)
 * All rings have 24 sectors for consistent granularity
 *
 * Velocities: 8, 6, 4, 2, 1 (powers of 2 progression with 8 at innermost)
 */
export const BLACKHOLE_RINGS: RingConfig[] = [
  { ring: 1, velocity: 8, sectors: 24 }, // Innermost - EXTREME (120°/turn = 8 sectors)
  { ring: 2, velocity: 6, sectors: 24 }, // Blazing Fast (90°/turn = 6 sectors)
  { ring: 3, velocity: 4, sectors: 24 }, // Very Fast (60°/turn = 4 sectors)
  { ring: 4, velocity: 2, sectors: 24 }, // Medium (30°/turn = 2 sectors)
  { ring: 5, velocity: 1, sectors: 24 }, // Slow (15°/turn = 1 sector) - where well transfers occur
]

/**
 * Planet ring configuration - 3 rings with variable velocity
 * Planets are smaller gravity wells, so fewer rings
 * Velocity progression: 4, 2, 1 (medium speed range for balanced gameplay)
 */
export const PLANET_RINGS: RingConfig[] = [
  { ring: 1, velocity: 4, sectors: 24 }, // Innermost - Very Fast (60°/turn)
  { ring: 2, velocity: 2, sectors: 24 }, // Medium (30°/turn)
  { ring: 3, velocity: 1, sectors: 24 }, // Slow (15°/turn) - where well transfers occur
]

/**
 * Black Hole - Primary gravity well at the center of the system
 * All planets orbit around this
 */
export const BLACK_HOLE: GravityWell = {
  id: 'blackhole',
  name: 'Black Hole',
  type: 'blackhole',
  rings: BLACKHOLE_RINGS,
}

/**
 * Planets - Secondary gravity wells at fixed positions
 * Transfer occurs through fixed elliptic transfer sectors (see transferPoints.ts)
 *
 * Planets are static (velocity = 0) to simplify tabletop implementation
 * Transfer sectors remain constant
 */
export const PLANET_ALPHA: GravityWell = {
  id: 'planet-alpha',
  name: 'Alpha',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

export const PLANET_BETA: GravityWell = {
  id: 'planet-beta',
  name: 'Beta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

export const PLANET_GAMMA: GravityWell = {
  id: 'planet-gamma',
  name: 'Gamma',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

export const PLANET_DELTA: GravityWell = {
  id: 'planet-delta',
  name: 'Delta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

export const PLANET_EPSILON: GravityWell = {
  id: 'planet-epsilon',
  name: 'Epsilon',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

export const PLANET_ZETA: GravityWell = {
  id: 'planet-zeta',
  name: 'Zeta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    velocity: 0, // Static position
  },
}

/**
 * All gravity wells in the system
 * Index 0 is always the black hole, followed by 6 planets
 * Planets: Alpha, Beta, Gamma, Delta, Epsilon, Zeta
 *
 * Visual layout is defined in the UI layer
 */
export const GRAVITY_WELLS: GravityWell[] = [
  BLACK_HOLE,
  PLANET_ALPHA,
  PLANET_BETA,
  PLANET_GAMMA,
  PLANET_DELTA,
  PLANET_EPSILON,
  PLANET_ZETA,
]

/**
 * All transfer points between gravity wells (static, computed at module load)
 */
export const TRANSFER_POINTS: TransferPoint[] = calculateTransferPoints(GRAVITY_WELLS)

/**
 * Helper to get a gravity well by ID
 */
export function getGravityWell(wellId: string): GravityWell | undefined {
  return GRAVITY_WELLS.find(w => w.id === wellId)
}

/**
 * Helper to get ring configuration for a specific well and ring number
 */
export function getRingConfigForWell(wellId: string, ring: number): RingConfig | undefined {
  const well = getGravityWell(wellId)
  return well?.rings.find(r => r.ring === ring)
}
