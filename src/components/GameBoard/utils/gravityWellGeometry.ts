import type { GravityWell } from '../../../types/game'

/**
 * Calculate the center position of a gravity well
 */
export function getGravityWellPosition(
  wellId: string,
  gravityWells: GravityWell[],
  centerX: number,
  centerY: number,
  scaleFactor: number
): { x: number; y: number } {
  const well = gravityWells.find(w => w.id === wellId)
  if (!well) return { x: centerX, y: centerY }

  // Black hole is always at center
  if (well.type === 'blackhole') {
    return { x: centerX, y: centerY }
  }

  // Planets are positioned at their orbital position relative to black hole
  if (well.orbitalPosition) {
    const angleRad = (well.orbitalPosition.angle * Math.PI) / 180
    // Apply scale factor to distance
    const scaledDistance = well.orbitalPosition.distance * scaleFactor
    const x = centerX + scaledDistance * Math.cos(angleRad - Math.PI / 2)
    const y = centerY + scaledDistance * Math.sin(angleRad - Math.PI / 2)
    return { x, y }
  }

  return { x: centerX, y: centerY }
}

/**
 * Get rotation offset for a gravity well's sectors
 * To create Venn diagram-style overlap with IDENTICAL ARCS:
 * - Align sector CENTERS (not boundaries) between overlapping wells
 * - Rotate black hole COUNTERCLOCKWISE by half a sector
 * - Rotate planets CLOCKWISE by half a sector
 */
export function getSectorRotationOffset(
  wellId: string,
  gravityWells: GravityWell[]
): number {
  const well = gravityWells.find(w => w.id === wellId)
  if (!well) return 0

  if (well.type === 'blackhole') {
    // Rotate black hole COUNTERCLOCKWISE by half a sector
    // Get outermost ring (Ring 4 for black hole)
    const outermostRing = well.rings[well.rings.length - 1]
    const sectors = outermostRing?.sectors || 24
    return -(Math.PI / sectors) // Negative = counterclockwise
  }

  // For planets: sector 0 points toward black hole (inward) + rotate CLOCKWISE by half sector
  if (well.orbitalPosition) {
    // Get outermost ring (Ring 3 for planets)
    const outermostRing = well.rings[well.rings.length - 1]
    const sectors = outermostRing?.sectors || 24
    const pointInward = ((well.orbitalPosition.angle + 180) * Math.PI) / 180
    const halfSector = Math.PI / sectors // Positive = clockwise
    return pointInward + halfSector
  }

  return 0
}

/**
 * Get sector angle direction multiplier for rendering
 * Planets rotate counterclockwise (opposite to black hole) to preserve prograde meaning
 * Sector numbers remain the same (0-23), but angle calculation direction reverses
 */
export function getSectorAngleDirection(
  wellId: string,
  gravityWells: GravityWell[]
): number {
  const well = gravityWells.find(w => w.id === wellId)
  if (!well) return 1

  // Planets rotate counterclockwise (-1), black hole rotates clockwise (+1)
  return well.type === 'planet' ? -1 : 1
}

/**
 * Legacy function for compatibility - now just returns sector unchanged
 * Direction is handled by getSectorAngleDirection multiplier
 */
export function getVisualSector(
  _wellId: string,
  logicalSector: number,
  _sectorCount: number
): number {
  return logicalSector
}
