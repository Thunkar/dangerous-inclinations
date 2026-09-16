/**
 * The board, in three dimensions.
 *
 * `geometry.ts` stays the single source of every coordinate: this module only
 * lifts its flat points into world space and adds the third axis. The mapping
 * is deliberately boring — board `(x, y)` becomes world `(x, elevation, y)`
 * with Y up — so that seen from straight above the 3D board IS the 2D board:
 * sector 0 of the black hole points away from the default camera and sectors
 * increase clockwise, exactly as they are printed.
 *
 * The one liberty taken is elevation. Each ring sits on its own terrace and the
 * surface ramps down between them, so a gravity well is a flight of steps to
 * the body at the bottom: the black hole falls 125 units from its rim to its
 * floor — one body radius — and a planet only dimples by 52. Every step inward
 * is larger than the one outside it, which is the ring-velocity rule drawn as a
 * slope. The terraces are flat on purpose — a ribbon, its ticks and its 24
 * numbers all lie in one plane, so they read at the Table camera instead of
 * going edge-on — and no drop is steep enough to hide the terrace below it from
 * a camera 62° above the plane. It is a display choice and nothing else reads it
 * as a rule; `FLAT_BOARD` turns it off and every well becomes coplanar again.
 *
 * Nothing rule-shaped lives here: ring counts, radii and sector angles all
 * come from the engine through `geometry.ts`.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import type { Facing, GravityWellId, Position } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING, getGravityWell } from '@dangerous-inclinations/engine'
import {
  BOARD_BOUNDS,
  HOME_VIEW_RADIUS,
  PLATE_MARGIN,
  PRINT_SCALE,
  allWells,
  facingAngle,
  interpolatePositions,
  polar,
  positionPoint,
  ringRadius,
  ringsOf,
  sectorEdgeAngle,
  type Point,
  wellCenter,
} from '../geometry'

/** Board units are world units: the board spans about 2650 of them. */
export const BOARD_SPAN = Math.max(BOARD_BOUNDS.width, BOARD_BOUNDS.height)

/**
 * How much bigger the view the board opens in is than the one this type was
 * tuned in.
 *
 * The camera fits whatever board it is handed, so a size left alone simply
 * lands smaller on screen when the board opens out. Type, ticks and the
 * terraces that carry them are therefore written as the number the designer
 * settled on times this scale: they land on screen at the size they were tuned
 * to, and only the tokens — which keep their board-unit size on purpose — come
 * out smaller against a roomier board. `geometry.ts` says why it is measured
 * against the framing rather than against the board.
 */
export { PRINT_SCALE } from '../geometry'

/** Centre of the drawn board (the artwork is not centred on the black hole). */
export const BOARD_CENTER: Point = {
  x: BOARD_BOUNDS.x + BOARD_BOUNDS.width / 2,
  y: BOARD_BOUNDS.y + BOARD_BOUNDS.height / 2,
}

/** Near/far chosen for a board this size: close enough to hug one well, far enough for the stars. */
export const CAMERA_NEAR = 5
export const CAMERA_FAR = 24000

/** Set true to make every well coplanar again (see the header). */
export const FLAT_BOARD = false

export { PLATE_MARGIN } from '../geometry'

/** Outer edge of the dark plate a well is printed on. */
export function plateRadius(wellId: GravityWellId): number {
  return wellOuterRadius(wellId) + PLATE_MARGIN
}

/**
 * Elevation offsets, in board units, that keep coplanar marks from z-fighting.
 * They are tiny compared with the funnel: think of them as the thickness of
 * the ink, not as height.
 */
export const LAYER = {
  /** The dark plate each well is printed on. */
  plate: 0,
  /** Ring ribbons, ticks. */
  ring: 1.5,
  /** Transfer lane arcs, drawn over the rings they share. */
  lane: 3,
  /** Range, deployment and picker wedges. */
  wedge: 4.5,
  /** Planned paths, routes, missile tracks. */
  path: 6,
  /** Ships, stations, homes and the rings drawn under them. */
  token: 8,
  /** Sector numbers and every other piece of type laid on the surface. */
  label: 10,
  /** Beams, bursts and floats, which must never be swallowed by the board. */
  effect: 13,
} as const

export type BoardLayer = (typeof LAYER)[keyof typeof LAYER]

/**
 * How high above its terrace the tallest thing on the board stands: a hull, a
 * lane badge, a float. The camera frames this much headroom and no more.
 */
export const BOARD_RELIEF = 42

/**
 * The funnel, in numbers.
 *
 * The fall across the innermost gap is `ringDrop()` and every gap outward of it
 * is `DROP_FALLOFF` times shallower, so the steps accelerate inward the way the
 * ring velocities do. A terrace reaches `TERRACE_INNER` inside its ring — far
 * enough to carry the ticks and the numbers, so both scale with the type — and
 * `TERRACE_OUTER` outside it; what is left of the gap is the ramp.
 *
 * How deep the funnel may be is not a matter of taste but of occlusion: seen
 * from the Table camera's 62°, a ramp of length L can fall about `OCCLUSION`
 * times L before its near lip starts eating the terrace inside it, and a number
 * you cannot see is a rule you cannot play. So the drop is solved from the ramp
 * rather than tuned against it, and it sits exactly at that limit — deeper reads
 * as more of a funnel and costs the inner rings' near side.
 *
 * Occlusion is not the only limit, though, and `MAX_FALL_SHARE` is the other.
 * Opening the black hole's gaps from 56.5 units to 80 widened every ramp from
 * 28.1 units to 51.7 and so raised the occlusion ceiling from a 121-unit fall to
 * a 223-unit one — which the well is not allowed to take, because depth is not
 * free (see `MAX_FALL_SHARE`).
 */
const OCCLUSION = 1.27
const DROP_FALLOFF = 1.12
/** A planet is a dimple, not a pit. */
const PLANET_DEPTH_SCALE = 0.42

/**
 * How far a well may fall from rim to floor, as a share of its innermost ring.
 *
 * Occlusion is a ceiling, not a target, and depth costs something the board is
 * judged on. A camera above the table is further from the floor of a pit than
 * from its rim, so every unit a well sinks is a unit off the body standing at
 * the bottom of it: measured at the Table camera, 100 units of extra fall take
 * 4.6% off the black hole's on-screen diameter. That was invisible while the
 * hole was a marble in a shallow bowl, and it is not invisible now that the hole
 * is half of ring 1.
 *
 * So a well falls by the lesser of what occlusion allows and half of its own
 * ring 1 — which for the black hole is exactly one body radius, and exactly the
 * fall it already had. Wider rings buy the funnel a longer, gentler ramp rather
 * than a deeper hole. Only the black hole is anywhere near this limit; a planet
 * dimples by a third of what it would allow.
 */
const MAX_FALL_SHARE = 0.5
const TERRACE_INNER = 17 * PRINT_SCALE
const TERRACE_OUTER = 3 * PRINT_SCALE

export function wellOuterRadius(wellId: GravityWellId): number {
  return ringRadius(wellId, ringsOf(wellId).length)
}

function isBlackHole(wellId: GravityWellId): boolean {
  return getGravityWell(wellId)?.type === 'blackhole'
}

/** Radii of a well's rings, innermost first. */
function ringRadii(wellId: GravityWellId): number[] {
  return ringsOf(wellId).map(ring => ringRadius(wellId, ring.ring))
}

/** What is left of a gap between two rings once both terraces have taken their share. */
function rampLength(wellId: GravityWellId): number {
  const radii = ringRadii(wellId)
  return radii[1] - radii[0] - TERRACE_INNER - TERRACE_OUTER
}

/**
 * The fall across the innermost gap: as deep as the black hole's ramp can carry
 * without hiding the terrace inside it. Every other drop is a fraction of this
 * one, and the planets' ramps are shallower still, so this is the binding case.
 */
let ringDropCache: number | null = null
function ringDrop(): number {
  if (ringDropCache === null) ringDropCache = OCCLUSION * rampLength('blackhole')
  return ringDropCache
}

/**
 * Elevation of each ring's terrace, innermost first. The outermost ring is the
 * rim and sits at zero, so every well's plate meets the table at the same height.
 */
const terraceCache = new Map<GravityWellId, number[]>()

function terraceElevations(wellId: GravityWellId): number[] {
  const cached = terraceCache.get(wellId)
  if (cached) return cached
  const count = ringRadii(wellId).length
  const scale = isBlackHole(wellId) ? 1 : PLANET_DEPTH_SCALE
  const elevations = new Array<number>(count).fill(0)
  for (let i = count - 2; i >= 0; i--) {
    elevations[i] = elevations[i + 1] - (ringDrop() * scale) / DROP_FALLOFF ** i
  }
  // The occlusion limit is one ceiling; the body at the bottom is the other.
  // Where the fall exceeds it, every terrace comes up by the same factor, so the
  // steps keep the ratio that draws the ring-velocity rule.
  const fall = -elevations[0]
  const cap = ringRadius(wellId, 1) * MAX_FALL_SHARE
  if (fall > cap) for (let i = 0; i < count; i++) elevations[i] *= cap / fall
  terraceCache.set(wellId, elevations)
  return elevations
}

function smoothstep(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/** Radius inside which a well's surface is the flat floor its body rests on. */
export function funnelFloorRadius(wellId: GravityWellId): number {
  return Math.max(0, ringRadius(wellId, 1) - TERRACE_INNER)
}

/**
 * Elevation of a well's surface at a distance from its centre: flat on each
 * ring's terrace, a smoothstep down the ramp between them, flat again inside
 * the innermost ring where the body sits.
 */
export function surfaceElevation(wellId: GravityWellId, radius: number): number {
  if (FLAT_BOARD) return 0
  const radii = ringRadii(wellId)
  const elevations = terraceElevations(wellId)
  for (let i = radii.length - 1; i > 0; i--) {
    const terraceInner = radii[i] - TERRACE_INNER
    if (radius >= terraceInner) return elevations[i]
    const rampInner = radii[i - 1] + TERRACE_OUTER
    if (rampInner >= terraceInner) {
      // The rings are closer together than the terraces are wide: step at the
      // midpoint rather than inverting the ramp.
      if (radius >= (rampInner + terraceInner) / 2) return elevations[i]
      continue
    }
    if (radius >= rampInner) {
      const t = (radius - rampInner) / (terraceInner - rampInner)
      return elevations[i - 1] + (elevations[i] - elevations[i - 1]) * smoothstep(t)
    }
  }
  return elevations[0]
}

/** Elevation of a ring's ribbon: the outermost ring of a well sits at 0. */
export function ringElevation(wellId: GravityWellId, ring: number): number {
  if (FLAT_BOARD) return 0
  const elevations = terraceElevations(wellId)
  return elevations[Math.min(Math.max(ring, 1), elevations.length) - 1]
}

/** Elevation of the surface under a game position. */
export function elevationAt(position: Position): number {
  return ringElevation(position.wellId, position.ring)
}

/**
 * Radii at which a well's surface has to be sampled for its terraces to come
 * out flat and its ramps smooth: the edges of every terrace, ten steps across
 * every ramp, and the floor.
 */
export function funnelSampleRadii(wellId: GravityWellId, outerRadius: number): number[] {
  const radii = ringRadii(wellId)
  const marks = new Set<number>([0, funnelFloorRadius(wellId), outerRadius])
  for (let i = 0; i < radii.length; i++) {
    const inner = radii[i] - TERRACE_INNER
    const outer = radii[i] + TERRACE_OUTER
    marks.add(inner)
    marks.add(radii[i])
    marks.add(outer)
    if (i === 0) continue
    const rampInner = radii[i - 1] + TERRACE_OUTER
    const rampOuter = inner
    for (let s = 1; s < 10; s++) marks.add(rampInner + ((rampOuter - rampInner) * s) / 10)
  }
  return [...marks].filter(r => r >= 0 && r <= outerRadius).sort((a, b) => a - b)
}

/**
 * The board's monospace face, measured. A digit stands 0.688 em tall, and the
 * ink of the widest sector number — two digits — spans 1.1 em across, rather
 * less than the 1.2 em their advances take, because a digit carries side
 * bearings. It is the ink that has to fit between one sector and the next.
 */
export const GLYPH_HEIGHT = 0.688
const WIDEST_INK = 1.1

/**
 * Share of a sector's arc the ink of its number may take, and the height a
 * number may reach whatever room its arc leaves.
 *
 * `LABEL_FILL` used to bind on the innermost ring of each well, which is what
 * kept the type honest; `LABEL_MAX` binds everywhere else. It has come down
 * twice — 26, then 23, now 19 — and at 19 every ring on the board is on the cap
 * and none is short of arc, so all fourteen print at one size and the fill is a
 * backstop rather than a rule. A number is now a third of the ink it was two
 * passes ago: the board is a map, and a map's type sits under its geography.
 *
 * `LABEL_FILL` is a share of an arc and so says nothing about scale; the two
 * heights are printed sizes and carry `PRINT_SCALE` like everything else on the
 * board, so they land on screen at the size they were judged at.
 */
const LABEL_FILL = 0.78
const LABEL_MIN = 11 * PRINT_SCALE
const LABEL_MAX = 19 * PRINT_SCALE

/** Sector ticks, as on paper: short and faint, sector 0 twice as long. */
export const SECTOR_TICK_LENGTH = 6 * PRINT_SCALE
export const ZERO_TICK_LENGTH = 14 * PRINT_SCALE
/** Gap between the end of a tick and the top of the number under it. */
const LABEL_GAP = 2 * PRINT_SCALE

export interface SectorLabelBand {
  /** Height of a digit, in board units. */
  size: number
  /** Radius the numbers are centred on. */
  radius: number
  /** Radius of the inner edge of the numbers: nothing else may cross it. */
  inner: number
}

/**
 * Where a ring's numbers sit and how big they are — the SVG board's rule, in
 * world units: a number is never wider than its share of the arc it names, so
 * an inner ring simply prints smaller rather than dropping any of its 24.
 * `Wells` reads it too, so a well's name can be printed inside the innermost
 * ring without ever touching a number.
 */
export function sectorLabelBand(wellId: GravityWellId, ring: number): SectorLabelBand {
  const radius = ringRadius(wellId, ring)
  // The arc a number has to fit into is the one where it is printed, under the
  // ticks, and where that is depends on how tall it ends up: settle it.
  let size = LABEL_MAX
  let at = radius
  for (let pass = 0; pass < 4; pass++) {
    at = radius - SECTOR_TICK_LENGTH - LABEL_GAP - (size * GLYPH_HEIGHT) / 2
    const arc = (2 * Math.PI * Math.max(1, at)) / SECTORS_PER_RING
    size = Math.min(LABEL_MAX, Math.max(LABEL_MIN, (arc * LABEL_FILL) / WIDEST_INK))
  }
  at = radius - SECTOR_TICK_LENGTH - LABEL_GAP - (size * GLYPH_HEIGHT) / 2
  return { size, radius: at, inner: at - (size * GLYPH_HEIGHT) / 2 }
}

/** Board point → world point. Y is up; the board's y axis becomes world z. */
export function toWorld(point: Point, elevation = 0): Vector3 {
  return new Vector3(point.x, elevation, point.y)
}

/** World point of a game position, lifted off the surface by a layer offset. */
export function positionWorld(position: Position, layer: number = LAYER.token): Vector3 {
  return toWorld(positionPoint(position), elevationAt(position) + layer)
}

/** World point of a well's centre, at the bottom of its funnel. */
export function wellCenterWorld(wellId: GravityWellId, layer = 0): Vector3 {
  return toWorld(wellCenter(wellId), surfaceElevation(wellId, 0) + layer)
}

/**
 * The silhouette the board opens on: the black hole's well, with
 * `HOME_VIEW_RADIUS` of room around it. `geometry.ts` says why the default view
 * is not the whole board.
 */
export function homeHullPoints(): Vector3[] {
  return wellHullPoints('blackhole', HOME_VIEW_RADIUS - plateRadius('blackhole'))
}

/**
 * The points a camera has to keep in frame to show one well whole: its plate
 * rim at the table's height and again at the top of the tallest token, and the
 * floor of its funnel. It is the silhouette of what is actually drawn, not a
 * box around it, which is why the board can fill the frame.
 */
export function wellHullPoints(wellId: GravityWellId, margin = 0): Vector3[] {
  const center = wellCenter(wellId)
  const radius = plateRadius(wellId) + margin
  const points: Vector3[] = [toWorld(center, surfaceElevation(wellId, 0))]
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const at = polar(center, radius, (i / steps) * Math.PI * 2)
    points.push(toWorld(at, 0), toWorld(at, BOARD_RELIEF))
  }
  return points
}

/** The same silhouette for the whole board: every well's, together. */
export function boardHullPoints(margin = 0): Vector3[] {
  return allWells().flatMap(well => wellHullPoints(well.id, margin))
}

/**
 * A point along the arc a token travels between two positions: `geometry`'s
 * `interpolatePositions` for x/z, a straight lerp for the elevation.
 */
export function interpolateWorld(
  from: Position,
  to: Position,
  t: number,
  layer = 0,
  out = new Vector3()
): Vector3 {
  const point = interpolatePositions(from, to, t)
  const elevation = elevationAt(from) + (elevationAt(to) - elevationAt(from)) * t
  return out.set(point.x, elevation + layer, point.y)
}

/** `count` points along that arc, ends included — for ribbons and dashed paths. */
export function arcSamples(from: Position, to: Position, count: number, layer = 0): Vector3[] {
  const n = Math.max(2, Math.floor(count))
  return Array.from({ length: n }, (_, i) => interpolateWorld(from, to, i / (n - 1), layer))
}

/**
 * Rotation about Y for a hull modelled nose-along-+X.
 *
 * A board heading θ points at (cos θ, sin θ) in board space, which is
 * (cos θ, 0, sin θ) in world space; a yaw φ sends +X to (cos φ, 0, −sin φ).
 * Hence the sign: yaw = −heading.
 */
export function yawFromHeading(heading: number): number {
  return -heading
}

/** Yaw of a token sitting in a sector and facing prograde or retrograde. */
export function facingYaw(position: Position, facing: Facing): number {
  return yawFromHeading(facingAngle(position, facing))
}

/**
 * One sector as a surface patch between two radii, hugging the funnel so it
 * never floats or sinks through the plate. Reused by range, deployment and
 * picker overlays; the caller owns the geometry and must dispose it.
 */
export function sectorWedgeGeometry(
  wellId: GravityWellId,
  sector: number,
  innerRadius: number,
  outerRadius: number,
  elevation: number = LAYER.wedge
): BufferGeometry {
  const center = wellCenter(wellId)
  const a0 = sectorEdgeAngle(wellId, sector)
  const a1 = sectorEdgeAngle(wellId, sector + 1)
  const arcSteps = 6
  const radialSteps = 4
  const positions = new Float32Array((arcSteps + 1) * (radialSteps + 1) * 3)
  let v = 0
  for (let i = 0; i <= radialSteps; i++) {
    const radius = innerRadius + ((outerRadius - innerRadius) * i) / radialSteps
    const y = surfaceElevation(wellId, radius) + elevation
    for (let j = 0; j <= arcSteps; j++) {
      const p = polar(center, radius, a0 + ((a1 - a0) * j) / arcSteps)
      positions[v++] = p.x
      positions[v++] = y
      positions[v++] = p.y
    }
  }
  const indices: number[] = []
  const stride = arcSteps + 1
  for (let i = 0; i < radialSteps; i++) {
    for (let j = 0; j < arcSteps; j++) {
      const a = i * stride + j
      // Wound to face up, like every other surface on the board.
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
