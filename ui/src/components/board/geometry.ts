/**
 * Board geometry — the single source for every coordinate on the table.
 *
 * The board is drawn in one origin-centred coordinate system: the black hole
 * sits at (0, 0) and the three planets at 120° intervals around it. Sector 0
 * of the black hole points up; sector 0 of a planet points back at the black
 * hole. Sectors increase clockwise, the direction of prograde drift.
 *
 * Nothing here knows any rule: ring numbers, velocities and lanes all come
 * from the engine.
 */
import type { GravityWellId, Position, TransferArc } from '@dangerous-inclinations/engine'
import { GRAVITY_WELLS, SECTORS_PER_RING, getGravityWell } from '@dangerous-inclinations/engine'

export interface Point {
  x: number
  y: number
}

/**
 * The drawn board is not square: Alpha sits straight up and Beta and Gamma
 * sit below-right and below-left, so the artwork spans x ±804 and y −891…568.
 * The viewBox is cut to that box (plus a hair of margin) rather than to a
 * square, so the board fills every pixel of the space it is given on the table.
 */
export const BOARD_BOUNDS = { x: -828, y: -915, width: 1656, height: 1507 } as const
export const BOARD_VIEWBOX = `${BOARD_BOUNDS.x} ${BOARD_BOUNDS.y} ${BOARD_BOUNDS.width} ${BOARD_BOUNDS.height}`

/** Ring radii, innermost first. */
const BLACKHOLE_RING_RADII = [125, 185, 245, 305, 365]
const PLANET_RING_RADII = [120, 170, 220]

/** Distance from the black hole to each planet's centre. */
const PLANET_ORBIT_RADIUS = 645

export interface WellVisual {
  id: GravityWellId
  /** Radius of the body itself. */
  bodyRadius: number
  color: string
  /** Degrees clockwise from "up"; undefined for the black hole. */
  orbitAngle?: number
}

export const WELL_VISUALS: Record<GravityWellId, WellVisual> = {
  blackhole: { id: 'blackhole', bodyRadius: 52, color: '#120d0a' },
  'planet-alpha': { id: 'planet-alpha', bodyRadius: 38, color: '#3f7fc4', orbitAngle: 0 },
  'planet-beta': { id: 'planet-beta', bodyRadius: 34, color: '#c4523f', orbitAngle: 120 },
  'planet-gamma': { id: 'planet-gamma', bodyRadius: 34, color: '#3f9d6b', orbitAngle: 240 },
}

export function wellVisual(wellId: GravityWellId): WellVisual {
  return WELL_VISUALS[wellId] ?? WELL_VISUALS.blackhole
}

export function wellColor(wellId: GravityWellId): string {
  return wellVisual(wellId).color
}

const DEG = Math.PI / 180

/** Centre of a gravity well in board coordinates. */
export function wellCenter(wellId: GravityWellId): Point {
  const visual = wellVisual(wellId)
  if (visual.orbitAngle === undefined) return { x: 0, y: 0 }
  const a = visual.orbitAngle * DEG - Math.PI / 2
  return { x: PLANET_ORBIT_RADIUS * Math.cos(a), y: PLANET_ORBIT_RADIUS * Math.sin(a) }
}

/**
 * Rotation applied to a well's sector numbering. The black hole's sector 0
 * points up; a planet's sector 0 points back toward the black hole.
 */
function sectorRotation(wellId: GravityWellId): number {
  const visual = wellVisual(wellId)
  if (visual.orbitAngle === undefined) return 0
  return (visual.orbitAngle + 180) * DEG
}

export function ringRadius(wellId: GravityWellId, ring: number): number {
  const radii = wellId === 'blackhole' ? BLACKHOLE_RING_RADII : PLANET_RING_RADII
  return radii[ring - 1] ?? radii[radii.length - 1]
}

/** Angle of a sector boundary (the tick between sector-1 and sector). */
export function sectorEdgeAngle(wellId: GravityWellId, sector: number): number {
  return (sector / SECTORS_PER_RING) * 2 * Math.PI - Math.PI / 2 + sectorRotation(wellId)
}

/** Angle of the middle of a sector — where tokens sit. */
export function sectorAngle(wellId: GravityWellId, sector: number): number {
  return sectorEdgeAngle(wellId, sector + 0.5)
}

export function polar(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
}

/** Board coordinates of a game position. */
export function positionPoint(position: Position): Point {
  return polar(
    wellCenter(position.wellId),
    ringRadius(position.wellId, position.ring),
    sectorAngle(position.wellId, position.sector)
  )
}

/** Heading (radians) a token points in when facing prograde/retrograde. */
export function facingAngle(position: Position, facing: 'prograde' | 'retrograde'): number {
  const tangent = sectorAngle(position.wellId, position.sector) + Math.PI / 2
  return facing === 'prograde' ? tangent : tangent + Math.PI
}

/** Heading at any point of a well's rings (for a token sliding between sectors). */
export function headingAtPoint(
  wellId: GravityWellId,
  point: Point,
  facing: 'prograde' | 'retrograde'
): number {
  const center = wellCenter(wellId)
  const tangent = Math.atan2(point.y - center.y, point.x - center.x) + Math.PI / 2
  return facing === 'prograde' ? tangent : tangent + Math.PI
}

/**
 * Arc along a ring from `fromSector` to `toSector` (exclusive end edge),
 * at `radius`. Sweeps clockwise, the direction sectors increase.
 */
function arcPath(
  wellId: GravityWellId,
  radius: number,
  fromSectorEdge: number,
  toSectorEdge: number
): string {
  const center = wellCenter(wellId)
  const a0 = sectorEdgeAngle(wellId, fromSectorEdge)
  const a1 = sectorEdgeAngle(wellId, toSectorEdge)
  const span = Math.abs(toSectorEdge - fromSectorEdge)
  const largeArc = span > SECTORS_PER_RING / 2 ? 1 : 0
  const p0 = polar(center, radius, a0)
  const p1 = polar(center, radius, a1)
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}

/** Wedge covering exactly one sector, between two radii — for clickable cells. */
export function sectorWedgePath(
  wellId: GravityWellId,
  sector: number,
  innerRadius: number,
  outerRadius: number
): string {
  const center = wellCenter(wellId)
  const a0 = sectorEdgeAngle(wellId, sector)
  const a1 = sectorEdgeAngle(wellId, sector + 1)
  const i0 = polar(center, innerRadius, a0)
  const i1 = polar(center, innerRadius, a1)
  const o0 = polar(center, outerRadius, a0)
  const o1 = polar(center, outerRadius, a1)
  return [
    `M ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 0 1 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `L ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 0 0 ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Mid-point of a transfer arc, used to anchor the lane connector. */
export function arcMidPoint(arc: TransferArc, radiusOffset = 0): Point {
  const radius = ringRadius(arc.wellId, arc.ring) + radiusOffset
  return polar(
    wellCenter(arc.wellId),
    radius,
    sectorAngle(arc.wellId, arc.startSector + arc.length / 2 - 0.5)
  )
}

export function arcPathFor(arc: TransferArc, radiusOffset = 0): string {
  return arcPath(
    arc.wellId,
    ringRadius(arc.wellId, arc.ring) + radiusOffset,
    arc.startSector,
    arc.startSector + arc.length
  )
}

/** Every ring of every well, for drawing. */
export function allWells() {
  return GRAVITY_WELLS
}

export function ringsOf(wellId: GravityWellId) {
  return getGravityWell(wellId)?.rings ?? []
}

/** Interpolate along the ring arc between two positions in the same well. */
export function interpolatePositions(from: Position, to: Position, t: number): Point {
  const a = positionPoint(from)
  const b = positionPoint(to)
  if (from.wellId !== to.wellId) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  const center = wellCenter(from.wellId)
  const angleA = Math.atan2(a.y - center.y, a.x - center.x)
  let angleB = Math.atan2(b.y - center.y, b.x - center.x)
  // Ships always move prograde (clockwise, increasing angle) around the ring.
  while (angleB < angleA) angleB += 2 * Math.PI
  const radiusA = ringRadius(from.wellId, from.ring)
  const radiusB = ringRadius(to.wellId, to.ring)
  const angle = angleA + (angleB - angleA) * t
  return polar(center, radiusA + (radiusB - radiusA) * t, angle)
}
