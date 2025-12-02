/**
 * Position interpolation utilities for animations
 */

export interface Position {
  x: number
  y: number
}

/**
 * Interpolate position along an arc (for orbital movement)
 */
export function interpolateArcPosition(from: Position, to: Position, center: Position, progress: number): Position {
  const fromAngle = Math.atan2(from.y - center.y, from.x - center.x)
  const toAngle = Math.atan2(to.y - center.y, to.x - center.x)
  const fromRadius = Math.sqrt((from.x - center.x) ** 2 + (from.y - center.y) ** 2)
  const toRadius = Math.sqrt((to.x - center.x) ** 2 + (to.y - center.y) ** 2)

  let angleDiff = toAngle - fromAngle
  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

  const currentAngle = fromAngle + angleDiff * progress
  const currentRadius = fromRadius + (toRadius - fromRadius) * progress

  return {
    x: center.x + currentRadius * Math.cos(currentAngle),
    y: center.y + currentRadius * Math.sin(currentAngle),
  }
}

/**
 * Interpolate angle (handling wraparound)
 */
export function interpolateAngle(from: number, to: number, progress: number): number {
  let diff = to - from
  if (diff > Math.PI) diff -= 2 * Math.PI
  if (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * progress
}
