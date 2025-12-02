/**
 * Calculate gravity well positions for rendering
 */

import { getGravityWell } from '../constants/gravityWells'

export interface WellPosition {
  x: number
  y: number
}

/**
 * Planet distance from black hole center
 */
const PLANET_DISTANCE_FROM_BLACKHOLE = 490

/**
 * Get the position of a gravity well relative to the board center
 * Returns position in unscaled coordinates (before scaleFactor is applied)
 */
export function getGravityWellPosition(wellId: string): WellPosition {
  const well = getGravityWell(wellId)

  if (!well) {
    return { x: 0, y: 0 }
  }

  if (well.type === 'blackhole') {
    return { x: 0, y: 0 }
  }

  if (well.orbitalPosition) {
    const angleRad = (well.orbitalPosition.angle * Math.PI) / 180
    const distance = PLANET_DISTANCE_FROM_BLACKHOLE

    return {
      x: distance * Math.cos(angleRad),
      y: distance * Math.sin(angleRad),
    }
  }

  return { x: 0, y: 0 }
}
