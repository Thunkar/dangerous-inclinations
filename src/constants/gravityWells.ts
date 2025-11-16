import type { GravityWell, RingConfig } from '../types/game'

/**
 * Standard ring configuration used by all gravity wells
 * Each well has 5 rings with velocity = 1
 */
export const STANDARD_RINGS: RingConfig[] = [
  { ring: 1, velocity: 1, radius: 60, sectors: 6 }, // Innermost
  { ring: 2, velocity: 1, radius: 110, sectors: 12 },
  { ring: 3, velocity: 1, radius: 160, sectors: 24 },
  { ring: 4, velocity: 1, radius: 210, sectors: 48 },
  { ring: 5, velocity: 1, radius: 260, sectors: 96 }, // Outermost - where well transfers occur
]

/**
 * Black Hole - Primary gravity well at the center of the system
 * All planets orbit around this
 */
export const BLACK_HOLE: GravityWell = {
  id: 'blackhole',
  name: 'Black Hole',
  type: 'blackhole',
  rings: STANDARD_RINGS,
  color: '#18181B', // Near black
  radius: 30,
}

/**
 * Planets - Secondary gravity wells at fixed positions relative to black hole
 * Each planet's outermost ring (Ring 5) is tangent to the black hole's Ring 5
 * Transfer occurs where they touch
 *
 * Planets orbit so slowly that their positions are effectively static during gameplay
 * (This simplifies tabletop implementation - transfer sectors remain constant)
 */
export const PLANET_ALPHA: GravityWell = {
  id: 'planet-alpha',
  name: 'Alpha',
  type: 'planet',
  rings: STANDARD_RINGS,
  orbitalPosition: {
    angle: 0, // Fixed at 0 degrees (top of circle)
    velocity: 0, // Static position (or orbits too slowly to matter)
    distance: 520, // Distance from black hole center
  },
  color: '#3B82F6', // Blue
  radius: 40,
}

export const PLANET_BETA: GravityWell = {
  id: 'planet-beta',
  name: 'Beta',
  type: 'planet',
  rings: STANDARD_RINGS,
  orbitalPosition: {
    angle: 120, // Fixed at 120 degrees
    velocity: 0, // Static position
    distance: 520, // Distance from black hole center
  },
  color: '#EF4444', // Red
  radius: 35,
}

export const PLANET_GAMMA: GravityWell = {
  id: 'planet-gamma',
  name: 'Gamma',
  type: 'planet',
  rings: STANDARD_RINGS,
  orbitalPosition: {
    angle: 240, // Fixed at 240 degrees
    velocity: 0, // Static position
    distance: 520, // Distance from black hole center
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
