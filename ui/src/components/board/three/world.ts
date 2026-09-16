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
 * the body at the bottom: the black hole falls about 170 units from its rim to
 * its floor, a planet only dimples by 40. Every step inward is larger than the
 * one outside it, which is the ring-velocity rule drawn as a slope. The
 * terraces are flat on purpose — a ribbon, its ticks and its 24 numbers all lie
 * in one plane, so they read at the Table camera instead of going edge-on — and
 * no drop is steep enough to hide the terrace below it from a camera 55° above
 * the plane. It is a display choice and nothing else reads it as a rule;
 * `FLAT_BOARD` turns it off and every well becomes coplanar again.
 *
 * Nothing rule-shaped lives here: ring counts, radii and sector angles all
 * come from the engine through `geometry.ts`.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import type { Facing, GravityWellId, Position } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING, getGravityWell } from '@dangerous-inclinations/engine'
import {
  BOARD_BOUNDS,
  allWells,
  facingAngle,
  interpolatePositions,
  polar,
  positionPoint,
  ringRadius,
  ringsOf,
  sectorEdgeAngle,
  wellCenter,
  type Point,
} from '../geometry'

/** Board units are world units: the board spans about 1650 of them. */
export const BOARD_SPAN = Math.max(BOARD_BOUNDS.width, BOARD_BOUNDS.height)

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

/** How far past the outermost ring the plate reaches, as on the SVG board. */
export const PLATE_MARGIN = 26

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
 * `RING_DROP` is the fall across the innermost gap and every gap outward of it
 * is `DROP_FALLOFF` times shallower, so the steps accelerate inward the way the
 * ring velocities do. A terrace reaches `TERRACE_INNER` inside its ring — far
 * enough to carry the ticks and the numbers — and `TERRACE_OUTER` outside it;
 * what is left of the gap is the ramp. Keep `RING_DROP` under about 1.27 times
 * the ramp length — 40 units between the black hole's rings, 30 between a
 * planet's — or the near lip of a step starts hiding the terrace below it from
 * the Table camera. Deeper reads as more of a funnel and costs the inner rings'
 * near side; this is as far as it goes with every number still visible.
 */
const RING_DROP = 50
const DROP_FALLOFF = 1.12
/** A planet is a dimple, not a pit. */
const PLANET_DEPTH_SCALE = 0.42
const TERRACE_INNER = 17
const TERRACE_OUTER = 3

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
    elevations[i] = elevations[i + 1] - (RING_DROP * scale) / DROP_FALLOFF ** i
  }
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
 * Share of a sector's arc the ink of its number may take. This is what caps the
 * innermost ring of each well — 24 numbers on a ring 125 units across for the
 * black hole — and it still shows daylight between one number and the next.
 * Every other ring hits `LABEL_MAX` first and has air to spare, so that cap is
 * what sets the weight of the board: ten of the fourteen rings sit on it.
 *
 * Both came down a notch once the art landed. At 0.82 and 26 the numbers read
 * as the subject of the picture rather than as labels on it — the board is a
 * map, and a map's type should sit under its geography.
 */
const LABEL_FILL = 0.78
const LABEL_MIN = 11
const LABEL_MAX = 23

/** Sector ticks, as on paper: short and faint, sector 0 twice as long. */
export const SECTOR_TICK_LENGTH = 6
export const ZERO_TICK_LENGTH = 14
/** Gap between the end of a tick and the top of the number under it. */
const LABEL_GAP = 2

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
