/**
 * A fold's wormhole, in time and in space, the same on both boards: a mouth
 * opens just ahead of the ship, the ship flies forward into it and is gone, a
 * mouth opens just behind the sector it lands on, the ship flies out of it
 * facing the way it did, and both mouths close. Nothing here is a rule (where
 * the ship lands is the event's): this is choreography, kept in one place so
 * the hull leaves and arrives at the same moment on the flat board and the 3D
 * one, and both mouths open and close together.
 *
 * Every time is a share of the fold's beat, which the ship's motion and the
 * wormhole effect both last.
 */
import type { Facing, Position } from '@dangerous-inclinations/engine'
import { facingAngle, positionPoint, type Point } from './geometry'

/** The shares of the beat each part of the fold takes. */
export const WORMHOLE = {
  /** The entry mouth opens over this, from the start. */
  entryOpen: [0, 0.16],
  /** The ship flies into the entry mouth. */
  enter: [0.1, 0.4],
  /** The entry mouth closes behind it. */
  entryClose: [0.4, 0.54],
  /** The exit mouth opens. */
  exitOpen: [0.44, 0.6],
  /** The ship flies out of it to the sector it lands on. */
  emerge: [0.56, 0.86],
  /** The exit mouth closes. */
  exitClose: [0.86, 1],
  /** How far ahead of the ship a mouth stands, in board units. */
  lead: 26,
  /** A mouth's radius when fully open, in board units. */
  radius: 22,
} as const

const span = (raw: number, [a, b]: readonly [number, number]) =>
  Math.min(1, Math.max(0, (raw - a) / (b - a)))

/** Ease with no corner at either end. */
export function smoother(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** How open each mouth is at `raw` through the beat, 0 to 1. */
export function mouthsOpen(raw: number): { entry: number; exit: number } {
  return {
    entry: smoother(span(raw, WORMHOLE.entryOpen)) * (1 - smoother(span(raw, WORMHOLE.entryClose))),
    exit: smoother(span(raw, WORMHOLE.exitOpen)) * (1 - smoother(span(raw, WORMHOLE.exitClose))),
  }
}

/**
 * Where the ship is in its fold at `raw`: at the entry mouth or the exit one,
 * how far along its short flight there (0 at the start, 1 at the end), and
 * the size it is drawn at. Between the two flights it is in neither, and
 * drawn at nothing.
 */
export function foldFlight(raw: number): { end: 'entry' | 'exit'; travel: number; scale: number } {
  if (raw < WORMHOLE.enter[1]) {
    const travel = smoother(span(raw, WORMHOLE.enter))
    return { end: 'entry', travel, scale: 1 - travel }
  }
  if (raw < WORMHOLE.emerge[0]) return { end: 'exit', travel: 0, scale: 0 }
  const travel = smoother(span(raw, WORMHOLE.emerge))
  return { end: 'exit', travel, scale: travel }
}

/** A board point `distance` along the heading a ship facing `facing` points in at `at`. */
function along(at: Point, position: Position, facing: Facing, distance: number): Point {
  const heading = facingAngle(position, facing)
  return { x: at.x + Math.cos(heading) * distance, y: at.y + Math.sin(heading) * distance }
}

/**
 * Where the two mouths stand: the entry one ahead of where the ship was, the
 * exit one behind where it lands, both on the way it faces. `landing` is the
 * hull's resting point there, which is beside the sector's centre when
 * somebody else is standing in it.
 */
export function mouthPoints(
  from: Position,
  to: Position,
  facing: Facing,
  landing: Point = positionPoint(to)
): { entry: Point; exit: Point } {
  return {
    entry: along(positionPoint(from), from, facing, WORMHOLE.lead),
    exit: along(landing, to, facing, -WORMHOLE.lead),
  }
}
