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

/*
 * Nothing here can make the board bigger, and this is the whole arithmetic of
 * the file.
 *
 * Both renderers fit whatever board they are handed — the camera solves its
 * framing from the artwork, the SVG viewBox is cut to it — so multiplying every
 * number below by the same factor is the identity on screen. A previous pass
 * proved it the hard way: the board was grown 1.42x and the picture came back
 * pixel for pixel, because the only things that did not grow were the tokens,
 * which therefore shrank. Only two things can change what you actually see:
 * *proportion* between the board and what stands on it, and *framing* — how much
 * of the board you are shown (`HOME_VIEW_RADIUS`).
 *
 * That is why spacing is bought and paid for rather than simply asked for. Ring
 * 1 cannot come inward: 24 numbers have to fit round it, so its circumference
 * caps the type on the entire board, and everything inside it is the room the
 * black hole has. So a wider gap between rings has to be taken outward, which
 * grows the well — and since the board opens on that well, growing it shrinks
 * everything in it, the black hole included. The bill is settled by tightening
 * the framing by exactly as much as the well grew, which is free: the margin
 * the view used to leave outside the plate was empty board.
 *
 *   black hole rings  250…476, gaps 56.5  ->  250…570, gaps 80
 *   planet rings      192…300, gaps 54    ->  192…332, gaps 70
 *   framed radius     plate x 1.38        ->  plate x 1.16  (691 units, as before)
 *   black hole body   125 units, 0.5 of ring 1, both unchanged
 *
 * Ring 1, the bodies and the ships keep every unit they had, the framed radius
 * is the same 691 units it was, and so the whole board lands on screen at the
 * scale it did — with the gap between two rings 1.42x wider, because that is the
 * one number that moved.
 */

/**
 * Ring radii, innermost first.
 *
 * Ring 1 is fixed: it is the cap on the type and the roof over the body, and it
 * has already been brought out once to meet ring 5. The rings outside it are
 * what opened, so the gap is bought from the outside in.
 */
const BLACKHOLE_RING_RADII = [250, 330, 410, 490, 570]
/**
 * Four rings now, and the new one is the innermost: adding it inside keeps the
 * outermost ring at 332, so the plates keep their size and the planets keep
 * their spacing. The body gives up the room instead.
 */
const PLANET_RING_RADII = [122, 192, 262, 332]

/** How far past the outermost ring the plate a well is printed on reaches. */
export const PLATE_MARGIN = 26

/**
 * Distance from the black hole to each planet's centre: the black hole's plate
 * (596), a planet's (358) and 136 units of clear space between them. It follows
 * the wells outward — they must not end up touching — and costs nothing on
 * screen, because neither renderer opens on the whole board any more.
 */
const PLANET_ORBIT_RADIUS = 1090

/**
 * The drawn board is not square: Alpha sits straight up and Beta and Gamma sit
 * below-right and below-left, so the artwork spans x ±1302 and y −1448…903.
 * The viewBox is cut to that box (plus a hair of margin) rather than to a
 * square, so the board fills every pixel of the space it is given on the table.
 *
 * Re-cut each time the wells move; it is only ever seen whole by a hand that
 * has zoomed all the way out.
 */
export const BOARD_BOUNDS = { x: -1326, y: -1472, width: 2652, height: 2399 } as const
export const BOARD_VIEWBOX = `${BOARD_BOUNDS.x} ${BOARD_BOUNDS.y} ${BOARD_BOUNDS.width} ${BOARD_BOUNDS.height}`

/**
 * The radius the board opens on, around the black hole.
 *
 * A board that has to fit the pane at rest can only ever be as big as the pane,
 * and four wells spread over a triangle 2652 units across leave each of them a
 * fifth of the height of the screen. But the whole board is not where the game
 * is: everyone deploys on black hole ring 4, every Home is in that sector, and a
 * ship is only ever elsewhere between missions. So both renderers open on the
 * black hole's plate and a margin — near enough to read a sector number, far
 * enough to show the lane arcs leaving for all three planets — and the planets
 * sit off the edges until you go and look at them.
 *
 * The margin is what paid for the wider rings. It was 38% of the plate, which on
 * a plate of 502 units was 190 units of nothing at all between the rim and the
 * edge of the view; the rings then opened out and the plate grew to 596, and the
 * margin came down to 16% to keep this radius where it was. That is the whole
 * trade: the same 691 units are framed, so the same pixels per board unit reach
 * the screen, so the black hole is the size it was and the gap between two rings
 * is wider by exactly the factor the rings moved. What is spent is empty margin,
 * and what is left — 96 units past the rim — is still more than the black hole's
 * own name needs below the plate.
 */
export const HOME_VIEW_RADIUS =
  (BLACKHOLE_RING_RADII[BLACKHOLE_RING_RADII.length - 1] + PLATE_MARGIN) * 1.16

/**
 * How much bigger the view is than the one every printed size was tuned in.
 *
 * Printed sizes — sector numbers, ticks, ring lines, lane ribbons, well names —
 * are written as the number that was settled on times this scale, so that they
 * land on screen at the size they were judged at however the board is redrawn.
 * Only the tokens keep their board-unit size on purpose, so they come out
 * smaller against a roomier board.
 *
 * It used to be measured against the board's overall height, which was wrong in
 * a way that only showed when the wells moved: the board is never seen whole, so
 * its height is not what any of this type is seen against. Pushing the planets
 * apart would have swollen every letter on the board. What the type is actually
 * read at is the view the board opens in, so that is what it is pinned to — and
 * `TUNED_HOME_VIEW_RADIUS` is that radius on the board the printing was tuned
 * on, before either rescale.
 */
const TUNED_HOME_VIEW_RADIUS = 488
export const PRINT_SCALE = HOME_VIEW_RADIUS / TUNED_HOME_VIEW_RADIUS

export interface WellVisual {
  id: GravityWellId
  /** Radius of the body itself. */
  bodyRadius: number
  color: string
  /** Degrees clockwise from "up"; undefined for the black hole. */
  orbitAngle?: number
}

/**
 * How big a body is drawn, as a share of its own well's ring 1.
 *
 * A body is a feature of the map, not a token. Tokens keep their board-unit
 * size on purpose, so that opening the board out gives a ship more room; a body
 * has no such reason, and when the board grew 1.42x with these radii written as
 * absolutes every body came out a third smaller against its own rings than it
 * had been drawn to be — the black hole a marble at the bottom of a wide pit,
 * the planets peas. Written as a share of ring 1 they follow the board on their
 * own, and everything that is placed at a multiple of a body — the atmosphere
 * shell, the well's name, the accretion disc's inner edge — follows with them.
 *
 * The black hole's share is not free: `three/bodies.ts` proves that at the Table
 * camera's pitch the top of the horizon stays below the far side of ring 1's
 * numbers, and half of ring 1 is the most that ceiling allows. It is written
 * here rather than solved because the flat board prints the same circle and the
 * two boards have to agree about the one body they both draw. The planets are
 * unconstrained — nothing else is in their pits — and keep the share they were
 * drawn at, so they grew with ring 1 and no further.
 */
const BODY_SHARE = {
  blackhole: 0.5,
  'planet-alpha': 38 / 120,
  'planet-beta': 34 / 120,
  'planet-gamma': 34 / 120,
} as const

export const WELL_VISUALS: Record<GravityWellId, WellVisual> = {
  blackhole: {
    id: 'blackhole',
    bodyRadius: BLACKHOLE_RING_RADII[0] * BODY_SHARE.blackhole,
    color: '#120d0a',
  },
  'planet-alpha': {
    id: 'planet-alpha',
    bodyRadius: PLANET_RING_RADII[0] * BODY_SHARE['planet-alpha'],
    color: '#3f7fc4',
    orbitAngle: 0,
  },
  'planet-beta': {
    id: 'planet-beta',
    bodyRadius: PLANET_RING_RADII[0] * BODY_SHARE['planet-beta'],
    color: '#c4523f',
    orbitAngle: 120,
  },
  'planet-gamma': {
    id: 'planet-gamma',
    bodyRadius: PLANET_RING_RADII[0] * BODY_SHARE['planet-gamma'],
    color: '#3f9d6b',
    orbitAngle: 240,
  },
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

/**
 * How far apart two ships standing in the same sector are drawn, in board units.
 *
 * A sector is one cell and holds as many ships as want to sit in it, so the
 * board has to say "two here" without saying anything the rules do not: the
 * hulls part along the radius, which is the one direction a sector has spare —
 * they sit broadside to it, and the sector's own arc is already spoken for by
 * its neighbours.
 *
 * The step is bounded on both sides. A hull is `WIDTH` = 26 board units across
 * the beam (`three/scene/Ships.tsx`), so anything under that still overlaps;
 * and a station's deck is `DECK_RADIUS` = 17 (`three/scene/Station.tsx`), so a
 * pair moored at one berth, parted by half a step each, must keep that half
 * under 17 or one of them ends up alongside the station instead of under it.
 * 30 is the room between: 4 units of air between two hulls, and ±15 at a berth.
 */
const CROWD_STEP = 30

/**
 * The radial nudge one ship takes among those sharing its sector; positive is
 * outward, and a crowd is always centred on the sector, so a ship alone sits
 * exactly where it did. Both boards apply it, so neither can draw the spread
 * its own way.
 */
export function crowdOffset(crowd: { index: number; count: number }): number {
  return (crowd.index - (crowd.count - 1) / 2) * CROWD_STEP
}

/** Board coordinates of a game position, moved `offset` units out along the radius. */
export function radialPoint(position: Position, offset: number): Point {
  return polar(
    wellCenter(position.wellId),
    ringRadius(position.wellId, position.ring) + offset,
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
