/**
 * Where a drawn track goes when it rides the ring it is drawn on.
 *
 * A coast, an orbital drift or a route leg travels along one ring, and a line
 * sampled at that ring's own radius lands exactly on the ring's ink: on the flat
 * board the dashes vanish into the ring, and in three dimensions the two fight
 * for the same pixels. So a track bows. It leaves its ring by a share of the gap
 * to the next one, runs beside it, and comes back down onto it at both ends —
 * which keeps every mark that means a sector (the dot where a missile lands, the
 * ring where a move ends, a route's numbered pip) exactly on the sector it names,
 * and lets a leg that changes ring join a leg that does not without a kink.
 *
 * Three properties are deliberate:
 *
 * - The bow is a **share of the gap between rings**, never a count of board
 *   units. The radii belong to `geometry.ts` and are free to change; a fifth of
 *   the gap is a fifth of the gap at any scale, and at that size a track can
 *   never be mistaken for the ring next door.
 * - The bow is always **outward**. The inside of a ring carries its ticks and
 *   its twenty-four numbers; outside it there is nothing but plate. Being
 *   one-sided also means a path that climbs or drops a ring never flips sides
 *   half way along, which would read as a turn it does not make.
 * - The bow is **in proportion to how far the track rides the ring**. A drift of
 *   six sectors bows the full share; a single step out of a turn that crossed
 *   rings lifts only far enough to clear the ring's ink, because at the full
 *   share it would read as a hook rather than as a line beside the ring.
 *
 * Nothing here decides where a path goes: the positions come from the model,
 * which asked the engine. Both renderers import it — it names no renderer and
 * touches no `three` — so a track is the same polyline on either board.
 */
import type { GravityWellId, Position } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import {
  interpolatePositions,
  positionPoint,
  ringRadius,
  ringsOf,
  wellCenter,
  type Point,
} from './geometry'

/**
 * How far a track runs beside its ring at the top of the bow, as a share of the
 * gap to the nearest ring. At a fifth or so it clears everything else printed on
 * a ring — the ribbon, the widest lane, the band a range wedge shades — while
 * staying inside the plate margin at the rim and nowhere near the ring next
 * door: four fifths of the gap is still between the track and it.
 */
export const TRACK_BOW = 0.22

/**
 * Share of a ring-run spent easing off the ring and back onto it. Big enough
 * that a long drift is a smooth curve rather than a rectangle with rounded
 * corners; small enough that a short run still gets most of the bow it is due.
 */
const BOW_SHOULDER = 0.34

/**
 * How much ring a track has to ride before it bows all the way out: a sector and
 * a half. A track bows in proportion to how far it rides, because a step of a
 * single sector that leapt the full width would read as a hook rather than as a
 * line beside the ring — at this setting it still lifts about three quarters of
 * the way, which is well clear of the ring's ink.
 */
const FULL_BOW_SECTORS = 1.5

/** Samples along one arc leg. Enough that a quarter of a ring reads as a curve. */
const ARC_SAMPLES = 13
/** Samples along one straight leg: enough to hug a funnel ramp and to bow. */
const CHORD_SAMPLES = 9

/**
 * How a leg between two positions is drawn: along the ring a token actually
 * rides, or straight across the way a warhead flies.
 */
export type TrackShape = 'arc' | 'chord'

/** One sample of a track, in board coordinates, with what a 3D board needs to lift it. */
export interface TrackPoint extends Point {
  /** The leg this sample belongs to, and how far along it sits. */
  from: Position
  to: Position
  t: number
  /** The well the sample is measured against. */
  wellId: GravityWellId
  /** Distance from that well's centre after the bow. */
  radius: number
  /** False on a leg between two wells, where there is no surface to follow. */
  sameWell: boolean
}

/** The gap to the nearest other ring of the same well — the unit the bow is measured in. */
function ringGap(wellId: GravityWellId, ring: number): number {
  const here = ringRadius(wellId, ring)
  let gap = Infinity
  for (const other of ringsOf(wellId)) {
    const distance = Math.abs(ringRadius(wellId, other.ring) - here)
    if (distance > 1e-6) gap = Math.min(gap, distance)
  }
  // A well with a single ring has no gap to measure against; a quarter of its
  // radius is the same order as a gap would have been.
  return Number.isFinite(gap) ? gap : here * 0.25
}

function smoothstep(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

function samePlace(a: Position, b: Position): boolean {
  return a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector
}

/** A leg rides a ring when it stays in one well and never leaves one ring. */
function ridesRing(from: Position, to: Position): boolean {
  return from.wellId === to.wellId && from.ring === to.ring
}

/**
 * The polyline for a run of positions: one leg per pair, of the given shape,
 * bowed off any ring it rides. Repeated positions are dropped, as they always
 * were — a step that goes nowhere draws nothing.
 */
export function trackPoints(
  positions: readonly Position[],
  shape: TrackShape = 'arc',
  bow: number = TRACK_BOW
): TrackPoint[] {
  if (positions.length === 0) return []

  const legs: Array<{ from: Position; to: Position }> = []
  for (let i = 1; i < positions.length; i++) {
    if (samePlace(positions[i - 1], positions[i])) continue
    legs.push({ from: positions[i - 1], to: positions[i] })
  }
  if (legs.length === 0) {
    const only = positions[0]
    const point = positionPoint(only)
    const center = wellCenter(only.wellId)
    return [
      {
        ...point,
        from: only,
        to: only,
        t: 0,
        wellId: only.wellId,
        radius: Math.hypot(point.x - center.x, point.y - center.y),
        sameWell: true,
      },
    ]
  }

  const samples: TrackPoint[] = []
  /** Whether each sample rides a ring, so the bow can be tapered over whole runs. */
  const riding: boolean[] = []

  legs.forEach((leg, index) => {
    const sameWell = leg.from.wellId === leg.to.wellId
    const curved = shape === 'arc' && sameWell
    const steps = sameWell ? (curved ? ARC_SAMPLES : CHORD_SAMPLES) : 2
    const a = positionPoint(leg.from)
    const b = positionPoint(leg.to)
    const center = wellCenter(leg.from.wellId)
    // The joint with the previous leg is already in the list.
    for (let i = index === 0 ? 0 : 1; i < steps; i++) {
      const t = i / (steps - 1)
      const point = curved
        ? interpolatePositions(leg.from, leg.to, t)
        : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      samples.push({
        ...point,
        from: leg.from,
        to: leg.to,
        t,
        wellId: leg.from.wellId,
        radius: Math.hypot(point.x - center.x, point.y - center.y),
        sameWell,
      })
      riding.push(sameWell && ridesRing(leg.from, leg.to))
    }
  })

  if (bow > 0) bowRuns(samples, riding, bow)
  return samples
}

/** How much of the ring a run covers, counted in sectors. */
function sectorsSwept(samples: readonly TrackPoint[], start: number, end: number): number {
  const center = wellCenter(samples[start].wellId)
  const angleAt = (i: number) => Math.atan2(samples[i].y - center.y, samples[i].x - center.x)
  let swept = 0
  let previous = angleAt(start)
  for (let i = start + 1; i <= end; i++) {
    const angle = angleAt(i)
    let step = angle - previous
    while (step > Math.PI) step -= 2 * Math.PI
    while (step < -Math.PI) step += 2 * Math.PI
    swept += Math.abs(step)
    previous = angle
  }
  return (swept * SECTORS_PER_RING) / (2 * Math.PI)
}

/**
 * Push every run of ring-riding samples outward, easing off the ring at the
 * start of the run and back onto it at the end. A run cannot straddle two rings:
 * consecutive ring-riding legs share the joint that names their ring.
 */
function bowRuns(samples: TrackPoint[], riding: readonly boolean[], bow: number): void {
  let start = 0
  while (start < samples.length) {
    if (!riding[start]) {
      start++
      continue
    }
    let end = start
    while (end + 1 < samples.length && riding[end + 1]) end++
    const span = end - start
    const lift =
      bow *
      ringGap(samples[start].wellId, samples[start].from.ring) *
      smoothstep(sectorsSwept(samples, start, end) / FULL_BOW_SECTORS)
    for (let i = start; i <= end; i++) {
      const along = span === 0 ? 0 : (i - start) / span
      const taper = smoothstep(Math.min(along, 1 - along) / BOW_SHOULDER)
      const offset = taper * lift
      if (offset <= 0) continue
      const sample = samples[i]
      const center = wellCenter(sample.wellId)
      if (sample.radius <= 1e-6) continue
      const scale = (sample.radius + offset) / sample.radius
      sample.x = center.x + (sample.x - center.x) * scale
      sample.y = center.y + (sample.y - center.y) * scale
      sample.radius += offset
    }
    start = end + 1
  }
}

/** The same polyline as an SVG `points` attribute. */
export function trackAttr(points: readonly Point[]): string {
  return points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}
