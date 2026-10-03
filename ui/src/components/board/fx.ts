/**
 * The shapes, in time and in space, of the two guns both boards draw the same
 * way: a plasma cannon's burst of bolts and a disruptor's pulse. Nothing here
 * is a rule (the box a pulse floods is the engine's, carried on the effect):
 * this is choreography, kept in one place so a bolt lands at the same moment
 * on the flat board and the 3D one, and the rays of a pulse leave and arrive
 * together on both.
 */
import type { Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import { positionPoint, type Point } from './geometry'

/** A plasma burst: how many bolts, how far apart they leave, and how long each flies. */
export const PLASMA_BURST = {
  bolts: 3,
  /** Share of the effect's life between one bolt leaving and the next. */
  gap: 0.1,
  /** Share of the effect's life a bolt takes to arrive. */
  flight: 0.45,
  /** Share of the effect's life a bolt's little splash on arrival lasts. */
  splash: 0.16,
  /** The bolt's head and the trail behind it, in board units. */
  radius: 8,
  trail: 34,
} as const

/**
 * What a bolt sheds: `perBolt` embers dropped evenly along its flight, each
 * cooling over `life` (in flights: 0.5 is half the time a bolt takes to
 * cross) while it drifts off the line; and `sparks` thrown forward from the
 * muzzle as it leaves, gone in `spark`.
 */
export const PLASMA_EMBERS = {
  perBolt: 16,
  life: 0.5,
  sparks: 8,
  spark: 0.3,
} as const

/** Where along its bolt's flight ember `k` was shed, 0 to 1. */
export function emberSpawn(k: number): number {
  return ((k + 0.5) / PLASMA_EMBERS.perBolt) * 0.96
}

/** Where bolt `index` is along its flight: below 0 it has not left, above 1 it has landed. */
export function boltFlight(progress: number, index: number): number {
  return (progress - index * PLASMA_BURST.gap) / PLASMA_BURST.flight
}

/**
 * A disruptor's pulse. The flood runs out from the attacker over the box in
 * the first `flood` of the effect; each cell's ray leaves as the flood reaches
 * it (up to `lag` later for the furthest) and takes `close` to reach the
 * target's shield; the whole thing fades out from `fade`.
 */
export const RAY_PULSE = {
  flood: 0.3,
  start: 0.08,
  lag: 0.06,
  close: 0.4,
  fade: 0.62,
  /** How many pieces a ray is broken into, and how far a joint may jump sideways. */
  segments: 7,
  amplitude: 7,
  /** How many times over the effect's life the crackle is thrown again. */
  flickers: 26,
} as const

/** How far a ray has closed on the target, 0 to 1, for a cell `share` of the way across the box. */
export function rayReach(progress: number, share: number): number {
  const t = (progress - RAY_PULSE.start - RAY_PULSE.lag * share) / RAY_PULSE.close
  return Math.min(1, Math.max(0, t))
}

/** The pulse's overall strength: in fast, held, then out. */
export function rayFade(progress: number): number {
  if (progress < 0.05) return progress / 0.05
  if (progress < RAY_PULSE.fade) return 1
  return Math.max(0, 1 - (progress - RAY_PULSE.fade) / (1 - RAY_PULSE.fade))
}

/** A repeatable number in [0, 1) for three integers: the crackle's dice. */
export function hash01(a: number, b: number, c: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return h - Math.floor(h)
}

/**
 * A jagged line from `a` to `b`: `segments` pieces whose joints are knocked
 * sideways by up to `amplitude`, most in the middle and none at the ends, and
 * thrown again whenever `step` changes. The same `seed` and `step` give the
 * same line, so a frame can be taken twice.
 */
export function crackle(
  a: Point,
  b: Point,
  seed: number,
  step: number,
  segments: number = RAY_PULSE.segments,
  amplitude: number = RAY_PULSE.amplitude
): Point[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const nx = -dy / length
  const ny = dx / length
  // A short ray crackles less: never more than a sixth of its own length.
  const swing = Math.min(amplitude, length / 6)
  const points: Point[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const knock =
      i === 0 || i === segments
        ? 0
        : (hash01(seed, step, i) * 2 - 1) * swing * Math.sin(Math.PI * t)
    points.push({ x: a.x + dx * t + nx * knock, y: a.y + dy * t + ny * knock })
  }
  return points
}

/** Where a ray from `start` stops: `stopAt` short of `target`, or at `start` if it is already inside. */
export function rayEnd(start: Point, target: Point, stopAt: number): Point | null {
  const dx = target.x - start.x
  const dy = target.y - start.y
  const length = Math.hypot(dx, dy)
  if (length <= stopAt + 4) return null
  const k = (length - stopAt) / length
  return { x: start.x + dx * k, y: start.y + dy * k }
}

/** One cell of a pulse's box: where its ray starts and how far across the box it lies. */
export interface RaySource {
  cell: Position
  /** The cell's middle, or the attacker's hull on its own sector. */
  start: Point
  /** Distance from the attacker, as a share of the furthest cell's: 0 to 1. */
  share: number
  /** Distance from the attacker, in board units. */
  distance: number
  /** The crackle's seed: its sector, so the same pulse crackles the same way twice. */
  seed: number
}

/** The box's cells as the rays leave them, nearest the attacker first. */
export function raySources(cells: readonly Position[], from: Position, origin: Point): RaySource[] {
  const sources = cells.map(cell => {
    const start = samePosition(cell, from) ? origin : positionPoint(cell)
    const distance = Math.hypot(start.x - origin.x, start.y - origin.y)
    return { cell, start, share: 0, distance, seed: cell.ring * 31 + cell.sector + 1 }
  })
  const furthest = Math.max(1, ...sources.map(s => s.distance))
  for (const source of sources) source.share = source.distance / furthest
  return sources.sort((a, b) => a.distance - b.distance)
}
