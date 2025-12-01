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
 * Black hole: sector 0 points upward (0°)
 * Planets: sector 0 points toward black hole (inward)
 */
export function getSectorRotationOffset(
  wellId: string,
  gravityWells: GravityWell[]
): number {
  const well = gravityWells.find(w => w.id === wellId)
  if (!well) return 0

  // Black hole sectors start at 0° (pointing up)
  if (well.type === 'blackhole') {
    return 0
  }

  // Planet sectors: sector 0 points toward black hole (opposite of orbital position)
  if (well.orbitalPosition) {
    // Point inward (toward black hole)
    const pointInward = ((well.orbitalPosition.angle + 180) * Math.PI) / 180
    return pointInward
  }

  return 0
}

