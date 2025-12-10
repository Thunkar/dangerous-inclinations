import type { GravityWell, RingConfig, TransferPoint } from '../types/game'
import { calculateTransferPoints } from '../utils/transferPoints'

/**
 * Black hole ring configuration - 5 rings with variable velocity
 * Inner rings move MUCH faster (dramatic speed differences)
 * All rings have 24 sectors for consistent granularity
 *
 * Spacing strategy:
 * - Large gap from center to Ring 1 (125 units) for visual separation
 * - 60 unit spacing between rings for comfortable ship placement
 * - 5 rings give the black hole more "breathing room" with 6 ships
 *
 * Velocities: 8, 6, 4, 2, 1 (powers of 2 progression with 8 at innermost)
 */
export const BLACKHOLE_RINGS: RingConfig[] = [
  { ring: 1, velocity: 8, radius: 125, sectors: 24 }, // Innermost - EXTREME (120°/turn = 8 sectors)
  { ring: 2, velocity: 6, radius: 185, sectors: 24 }, // Blazing Fast (90°/turn = 6 sectors)
  { ring: 3, velocity: 4, radius: 245, sectors: 24 }, // Very Fast (60°/turn = 4 sectors)
  { ring: 4, velocity: 2, radius: 305, sectors: 24 }, // Medium (30°/turn = 2 sectors)
  { ring: 5, velocity: 1, radius: 365, sectors: 24 }, // Slow (15°/turn = 1 sector) - where well transfers occur
]

/**
 * Planet ring configuration - 3 rings with variable velocity
 * Planets are smaller gravity wells, so fewer rings
 * Velocity progression: 4, 2, 1 (medium speed range for balanced gameplay)
 *
 * Spacing strategy:
 * - Large gap from center to Ring 1 (120 units) for visual separation
 * - Ring 1 is large (120 unit radius) for comfortable ship placement
 * - Rings 2-3 have tight 50 unit spacing
 */
export const PLANET_RINGS: RingConfig[] = [
  { ring: 1, velocity: 4, radius: 120, sectors: 24 }, // Innermost - Very Fast (60°/turn)
  { ring: 2, velocity: 2, radius: 170, sectors: 24 }, // Medium (30°/turn)
  { ring: 3, velocity: 1, radius: 220, sectors: 24 }, // Slow (15°/turn) - where well transfers occur
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
  color: '#18181B', // Near black
  radius: 50, // Larger for better visual appearance of ring arcs
}

/**
 * Planets - Secondary gravity wells at fixed positions relative to black hole
 * Black hole Ring 5 (radius 365) and Planet Ring 3 (radius 220) are separated by 60 units
 * Transfer occurs through fixed elliptic transfer sectors (not at tangent points)
 *
 * Distance calculation: blackhole_R5_radius + gap + planet_R3_radius = 365 + 60 + 220 = 645
 *
 * Planets orbit so slowly that their positions are effectively static during gameplay
 * (This simplifies tabletop implementation - transfer sectors remain constant)
 */
export const PLANET_ALPHA: GravityWell = {
  id: 'planet-alpha',
  name: 'Alpha',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 0, // Fixed at 0 degrees (top of circle)
    velocity: 0, // Static position (or orbits too slowly to matter)
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#3B82F6', // Blue
  radius: 40,
}

export const PLANET_BETA: GravityWell = {
  id: 'planet-beta',
  name: 'Beta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 60, // Fixed at 60 degrees
    velocity: 0, // Static position
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#EF4444', // Red
  radius: 35,
}

export const PLANET_GAMMA: GravityWell = {
  id: 'planet-gamma',
  name: 'Gamma',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 120, // Fixed at 120 degrees
    velocity: 0, // Static position
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#10B981', // Green
  radius: 35,
}

export const PLANET_DELTA: GravityWell = {
  id: 'planet-delta',
  name: 'Delta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 180, // Fixed at 180 degrees
    velocity: 0, // Static position
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#F97316', // Orange
  radius: 35,
}

export const PLANET_EPSILON: GravityWell = {
  id: 'planet-epsilon',
  name: 'Epsilon',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 240, // Fixed at 240 degrees
    velocity: 0, // Static position
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#8B5CF6', // Purple
  radius: 35,
}

export const PLANET_ZETA: GravityWell = {
  id: 'planet-zeta',
  name: 'Zeta',
  type: 'planet',
  rings: PLANET_RINGS,
  orbitalPosition: {
    angle: 300, // Fixed at 300 degrees
    velocity: 0, // Static position
    distance: 645, // Distance from black hole center (365 + 60 gap + 220)
  },
  color: '#06B6D4', // Cyan
  radius: 35,
}

/**
 * All gravity wells in the system
 * Index 0 is always the black hole, followed by planets at 60° intervals
 *
 * Layout (viewing from above):
 *                 Alpha (0°)
 *         Zeta (300°)    Beta (60°)
 *              [Black Hole]
 *      Epsilon (240°)    Gamma (120°)
 *                Delta (180°)
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
