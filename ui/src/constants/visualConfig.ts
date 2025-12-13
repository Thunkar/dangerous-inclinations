/**
 * Visual configuration for gravity wells and rings
 * This file contains ONLY visual/rendering data, no game logic
 *
 * Game logic (ring numbers, velocities, sectors) comes from @dangerous-inclinations/engine
 * Visual data (radii, colors, angles, distances) is defined here for UI rendering
 */

import type { GravityWellId } from '@dangerous-inclinations/engine'

/**
 * Visual configuration for a ring (rendering only)
 */
export interface RingVisualConfig {
  ring: number // Ring number (matches engine RingConfig.ring)
  radius: number // Visual radius in pixels for rendering
}

/**
 * Visual configuration for a gravity well (rendering only)
 */
export interface GravityWellVisualConfig {
  id: GravityWellId
  color: string // Display color for the well
  radius: number // Visual size of the planet/black hole body itself
  angle?: number // Angular position in degrees (0-360) - only for planets
  distance?: number // Distance from black hole center - only for planets
}

/**
 * Black hole ring visual configuration - defines rendering radii
 *
 * Spacing strategy:
 * - Large gap from center to Ring 1 (125 units) for visual separation
 * - 60 unit spacing between rings for comfortable ship placement
 * - 5 rings give the black hole more "breathing room" with 6 ships
 */
export const BLACKHOLE_RING_VISUALS: RingVisualConfig[] = [
  { ring: 1, radius: 125 }, // Innermost
  { ring: 2, radius: 185 },
  { ring: 3, radius: 245 },
  { ring: 4, radius: 305 },
  { ring: 5, radius: 365 }, // Outermost - where well transfers occur
]

/**
 * Planet ring visual configuration - defines rendering radii
 *
 * Spacing strategy:
 * - Large gap from center to Ring 1 (120 units) for visual separation
 * - Ring 1 is large (120 unit radius) for comfortable ship placement
 * - Rings 2-3 have tight 50 unit spacing
 */
export const PLANET_RING_VISUALS: RingVisualConfig[] = [
  { ring: 1, radius: 120 }, // Innermost
  { ring: 2, radius: 170 },
  { ring: 3, radius: 220 }, // Outermost - where well transfers occur
]

/**
 * Black Hole visual configuration
 */
export const BLACK_HOLE_VISUAL: GravityWellVisualConfig = {
  id: 'blackhole',
  color: '#18181B', // Near black
  radius: 50, // Larger for better visual appearance of ring arcs
}

/**
 * Planet visual configurations
 *
 * Distance calculation: blackhole_R5_radius + gap + planet_R3_radius = 365 + 60 + 220 = 645
 * This creates a 60 unit gap between outermost rings
 *
 * Layout (viewing from above):
 *                 Alpha (0°)
 *         Zeta (300°)    Beta (60°)
 *              [Black Hole]
 *      Epsilon (240°)    Gamma (120°)
 *                Delta (180°)
 */
export const PLANET_VISUALS: Record<GravityWellId, GravityWellVisualConfig> = {
  'planet-alpha': {
    id: 'planet-alpha',
    color: '#3B82F6', // Blue
    radius: 40,
    angle: 0, // Top
    distance: 645,
  },
  'planet-beta': {
    id: 'planet-beta',
    color: '#EF4444', // Red
    radius: 35,
    angle: 60,
    distance: 645,
  },
  'planet-gamma': {
    id: 'planet-gamma',
    color: '#10B981', // Green
    radius: 35,
    angle: 120,
    distance: 645,
  },
  'planet-delta': {
    id: 'planet-delta',
    color: '#F97316', // Orange
    radius: 35,
    angle: 180, // Bottom
    distance: 645,
  },
  'planet-epsilon': {
    id: 'planet-epsilon',
    color: '#8B5CF6', // Purple
    radius: 35,
    angle: 240,
    distance: 645,
  },
  'planet-zeta': {
    id: 'planet-zeta',
    color: '#06B6D4', // Cyan
    radius: 35,
    angle: 300,
    distance: 645,
  },
}

/**
 * Get visual configuration for a gravity well
 */
export function getGravityWellVisual(wellId: GravityWellId): GravityWellVisualConfig | undefined {
  if (wellId === 'blackhole') {
    return BLACK_HOLE_VISUAL
  }
  return PLANET_VISUALS[wellId]
}

/**
 * Get ring visual configuration for a specific well
 */
export function getRingVisuals(wellId: GravityWellId): RingVisualConfig[] {
  if (wellId === 'blackhole') {
    return BLACKHOLE_RING_VISUALS
  }
  // All planets have the same ring visual configuration
  return PLANET_RING_VISUALS
}

/**
 * Get radius for a specific ring in a gravity well
 */
export function getRingRadius(wellId: GravityWellId, ringNumber: number): number | undefined {
  const ringVisuals = getRingVisuals(wellId)
  return ringVisuals.find(r => r.ring === ringNumber)?.radius
}
