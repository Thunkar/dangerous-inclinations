/**
 * Where a drawn line goes on a board that is not flat.
 *
 * On paper a path is a polyline between sector centres; here the same path has
 * to sit on the funnel, or a route across the black hole's inner rings would
 * hang in the air above the pit. Two shapes cover everything either overlay
 * draws: an arc, which follows the ring a token rides (prograde, the way
 * `geometry.ts` interpolates), and a chord, the straight line the SVG board
 * draws for a missile's flight steps and for a jump between wells — straight
 * seen from above, but sampled so its elevation follows the surface under it.
 *
 * Nothing here decides where a path goes: the positions come from the model,
 * which asked the engine.
 */
import { Vector3 } from 'three'
import type { Position } from '@dangerous-inclinations/engine'
import { positionPoint, wellCenter } from '../../../geometry'
import { LAYER, arcSamples, elevationAt, positionWorld, surfaceElevation } from '../../world'

/** Samples per ring arc. Enough that a quarter of a ring still reads as a curve. */
const ARC_SAMPLES = 9
/** Samples per chord: enough that a leg crossing a terrace ramp still hugs it. */
const CHORD_SAMPLES = 9

/**
 * A mark that is only ink must never eat a click meant for a ship or a sector,
 * so every decorative mesh and line on these two layers raycasts to nothing.
 */
export const NO_RAYCAST = () => {}

/**
 * The straight line between two positions, seen from above, lifted onto the
 * surface it crosses. Between wells there is no surface to follow, so the
 * elevation simply runs from one end to the other.
 */
export function chordSamples(
  from: Position,
  to: Position,
  count = CHORD_SAMPLES,
  layer = LAYER.path
): Vector3[] {
  const a = positionPoint(from)
  const b = positionPoint(to)
  const sameWell = from.wellId === to.wellId
  const center = wellCenter(from.wellId)
  const startY = elevationAt(from)
  const endY = elevationAt(to)
  const steps = Math.max(2, count)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    const elevation = sameWell
      ? surfaceElevation(from.wellId, Math.hypot(x - center.x, y - center.y))
      : startY + (endY - startY) * t
    return new Vector3(x, elevation + layer, y)
  })
}

/** Joins samples of each leg end to end, dropping the repeated joint. */
function walk(
  positions: readonly Position[],
  layer: number,
  leg: (from: Position, to: Position) => Vector3[]
): Vector3[] {
  if (positions.length === 0) return []
  const points = [positionWorld(positions[0], layer)]
  for (let i = 1; i < positions.length; i++) {
    const from = positions[i - 1]
    const to = positions[i]
    if (from.wellId === to.wellId && from.ring === to.ring && from.sector === to.sector) continue
    points.push(...leg(from, to).slice(1))
  }
  return points
}

/** A run of positions as the arcs a token actually travels; straight between wells. */
export function arcPoints(positions: readonly Position[], layer = LAYER.path): Vector3[] {
  return walk(positions, layer, (from, to) =>
    from.wellId === to.wellId
      ? arcSamples(from, to, ARC_SAMPLES, layer)
      : chordSamples(from, to, 2, layer)
  )
}

/** A run of positions as the chords the SVG board draws between them. */
export function chordPoints(positions: readonly Position[], layer = LAYER.path): Vector3[] {
  return walk(positions, layer, (from, to) => chordSamples(from, to, CHORD_SAMPLES, layer))
}
