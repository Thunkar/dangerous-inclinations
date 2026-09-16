/**
 * Where a drawn line goes on a board that is not flat.
 *
 * The shape of a track — which way it curves, and how far it bows off the ring
 * it rides so it is not drawn on top of it — belongs to `trajectory.ts`, which
 * both boards share. This module only lifts that flat polyline into the world:
 * a sample inside one well sits on the surface beneath it, so a route across the
 * black hole's inner rings hugs the funnel instead of hanging over the pit, and
 * a leg between two wells simply runs from the height of one end to the other.
 *
 * Nothing here decides where a path goes: the positions come from the model,
 * which asked the engine.
 */
import { Vector3 } from 'three'
import type { Position } from '@dangerous-inclinations/engine'
import { positionPoint, wellCenter } from '../../../geometry'
import { LAYER, elevationAt, surfaceElevation } from '../../world'
import { trackPoints, type TrackPoint } from '../../../trajectory'

/** Samples per chord: enough that a leg crossing a terrace ramp still hugs it. */
const CHORD_SAMPLES = 9

/**
 * A mark that is only ink must never eat a click meant for a ship or a sector,
 * so every decorative mesh and line on these two layers raycasts to nothing.
 */
export const NO_RAYCAST = () => {}

/** Height of one flat sample: on the surface inside a well, end to end between two. */
function heightOf(sample: TrackPoint, layer: number): number {
  const surface = sample.sameWell
    ? surfaceElevation(sample.wellId, sample.radius)
    : elevationAt(sample.from) + (elevationAt(sample.to) - elevationAt(sample.from)) * sample.t
  return surface + layer
}

function lift(samples: readonly TrackPoint[], layer: number): Vector3[] {
  return samples.map(sample => new Vector3(sample.x, heightOf(sample, layer), sample.y))
}

/**
 * The straight line between two positions, seen from above, lifted onto the
 * surface it crosses. Between wells there is no surface to follow, so the
 * elevation simply runs from one end to the other. Used on its own for a jump,
 * which is neither an arc nor a track along any ring.
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

/** A run of positions as the arcs a token actually travels; straight between wells. */
export function arcPoints(positions: readonly Position[], layer = LAYER.path): Vector3[] {
  return lift(trackPoints(positions, 'arc'), layer)
}

/** A run of positions as the chords the SVG board draws between them. */
export function chordPoints(positions: readonly Position[], layer = LAYER.path): Vector3[] {
  return lift(trackPoints(positions, 'chord'), layer)
}
