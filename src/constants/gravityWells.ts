import type { GravityWell, RingConfig } from '../types/game'

/**
 * Black hole ring configuration - 4 rings with variable velocity
 * Inner rings move MUCH faster (dramatic speed differences)
 * All rings have 24 sectors for consistent granularity
 *
 * Spacing strategy:
 * - Large gap from center to Ring 1 (120 units) for visual separation
 * - Ring 1 is large (120 unit radius) for comfortable ship placement
 * - Rings 2-4 have tight 50 unit spacing to maximize Ring 1 size
 */
export const BLACKHOLE_RINGS: RingConfig[] = [
  { ring: 1, velocity: 6, radius: 120, sectors: 24 }, // Innermost - BLAZING FAST (120°/turn)
  { ring: 2, velocity: 4, radius: 170, sectors: 24 }, // Very Fast (60°/turn)
  { ring: 3, velocity: 2, radius: 220, sectors: 24 }, // Medium (30°/turn)
  { ring: 4, velocity: 1, radius: 270, sectors: 24 }, // Slow (15°/turn) - where well transfers occur
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
  radius: 30,
}

/**
 * Planets - Secondary gravity wells at fixed positions relative to black hole
 * Black hole Ring 4 (radius 270) and Planet Ring 3 (radius 220) are separated by 30 units
 * Transfer occurs through fixed elliptic transfer sectors (not at tangent points)
 *
 * Distance calculation: blackhole_R4_radius + gap + planet_R3_radius = 270 + 30 + 220 = 520
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
    distance: 520, // Distance from black hole center (270 + 30 gap + 220)
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
    angle: 120, // Fixed at 120 degrees
    velocity: 0, // Static position
    distance: 520, // Distance from black hole center (270 + 30 gap + 220)
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
    angle: 240, // Fixed at 240 degrees
    velocity: 0, // Static position
    distance: 520, // Distance from black hole center (270 + 30 gap + 220)
  },
  color: '#10B981', // Green
  radius: 35,
}

/**
 * All gravity wells in the system
 * Index 0 is always the black hole, followed by planets
 */
export const ALL_GRAVITY_WELLS: GravityWell[] = [
  BLACK_HOLE,
  PLANET_ALPHA,
  PLANET_BETA,
  PLANET_GAMMA,
]

/**
 * Helper to get a gravity well by ID
 */
export function getGravityWell(wellId: string): GravityWell | undefined {
  return ALL_GRAVITY_WELLS.find(w => w.id === wellId)
}

/**
 * Helper to get ring configuration for a specific well and ring number
 */
export function getRingConfigForWell(wellId: string, ring: number): RingConfig | undefined {
  const well = getGravityWell(wellId)
  return well?.rings.find(r => r.ring === ring)
}
