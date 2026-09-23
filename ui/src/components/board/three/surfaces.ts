/**
 * The buffers the board is printed on.
 *
 * Every surface the scene draws (the plate under a well, a ring ribbon, a
 * lane arc, a sector tick) is a strip of triangles that hugs the funnel from
 * `world.ts`, so nothing floats and nothing sinks. Each builder returns a
 * fresh `BufferGeometry` that the caller owns and must dispose.
 *
 * Ribbons carry two extra attributes so a shader can animate them without any
 * per-frame work on the CPU: `aPhase` (the board angle of the vertex, in
 * turns, so a dash pattern can drift prograde at a ring's own velocity) and
 * `aSpan` (0 at the start of the arc, 1 at its end, for lane flow). The funnel
 * plate carries a third, `color`, which is a plain shade by depth.
 */
import { BufferAttribute, BufferGeometry } from 'three'
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { polar, ringRadius, sectorEdgeAngle, wellCenter } from '../geometry'
import { funnelSampleRadii, surfaceElevation } from './world'

const TAU = Math.PI * 2

/** Angular resolution: enough segments that a 24-sector ring reads as a circle. */
const STEPS_PER_SECTOR = 6

/**
 * How the plate is tinted from its rim down to the floor of the funnel. The
 * board is dark and the lights are gentle, so the slope alone does not carry
 * the shape; a step down is also a step darker.
 */
const PLATE_RIM_SHADE = 1.25
const PLATE_FLOOR_SHADE = 0.38

/**
 * An arc of a ring as a flat ribbon of the given width, from one sector edge
 * to another (a full circle is 0 → SECTORS_PER_RING). Positions are world space.
 */
export function arcRibbonGeometry(
  wellId: GravityWellId,
  ring: number,
  fromSectorEdge: number,
  toSectorEdge: number,
  width: number,
  layer: number
): BufferGeometry {
  const center = wellCenter(wellId)
  const radius = ringRadius(wellId, ring)
  const inner = radius - width / 2
  const outer = radius + width / 2
  const span = Math.abs(toSectorEdge - fromSectorEdge)
  const steps = Math.max(2, Math.round(span * STEPS_PER_SECTOR))
  const positions = new Float32Array((steps + 1) * 2 * 3)
  const phase = new Float32Array((steps + 1) * 2)
  const along = new Float32Array((steps + 1) * 2)
  const yInner = surfaceElevation(wellId, inner) + layer
  const yOuter = surfaceElevation(wellId, outer) + layer
  let p = 0
  let a = 0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const edge = fromSectorEdge + (toSectorEdge - fromSectorEdge) * t
    const angle = sectorEdgeAngle(wellId, edge)
    const turns = edge / SECTORS_PER_RING
    const pi = polar(center, inner, angle)
    const po = polar(center, outer, angle)
    positions[p++] = pi.x
    positions[p++] = yInner
    positions[p++] = pi.y
    positions[p++] = po.x
    positions[p++] = yOuter
    positions[p++] = po.y
    phase[a] = turns
    along[a++] = t
    phase[a] = turns
    along[a++] = t
  }
  const indices: number[] = []
  for (let i = 0; i < steps; i++) {
    const v = i * 2
    indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1))
  geometry.setAttribute('aSpan', new BufferAttribute(along, 1))
  geometry.setIndex(indices)
  return geometry
}

/**
 * The dark plate a well is printed on: a disc displaced by the funnel, so the
 * well is visibly a well rather than a circle with numbers around it.
 *
 * The rings are sampled where the shape needs it rather than evenly (every
 * terrace edge and ten steps down every ramp, from `funnelSampleRadii`) so a
 * flat terrace comes out flat and the step below it keeps its shoulder.
 */
export function funnelPlateGeometry(
  wellId: GravityWellId,
  outerRadius: number,
  angularSteps = 120
): BufferGeometry {
  const center = wellCenter(wellId)
  const radii = funnelSampleRadii(wellId, outerRadius)
  const rings = radii.length
  const positions = new Float32Array(rings * (angularSteps + 1) * 3)
  const shades = new Float32Array(rings * (angularSteps + 1) * 3)
  const floor = surfaceElevation(wellId, 0)
  let p = 0
  let c = 0
  for (const radius of radii) {
    const y = surfaceElevation(wellId, radius)
    // Vertex tint by depth: each terrace takes one step darker, so the steps
    // read as steps whatever the lights are doing. A terrace is flat, so its
    // whole band gets one value and the change happens on the ramp.
    const shade = PLATE_RIM_SHADE + (PLATE_FLOOR_SHADE - PLATE_RIM_SHADE) * (floor ? y / floor : 0)
    for (let j = 0; j <= angularSteps; j++) {
      const angle = (j / angularSteps) * TAU
      const point = polar(center, radius, angle)
      positions[p++] = point.x
      positions[p++] = y
      positions[p++] = point.y
      shades[c++] = shade
      shades[c++] = shade
      shades[c++] = shade
    }
  }
  const indices: number[] = []
  const stride = angularSteps + 1
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < angularSteps; j++) {
      const v = i * stride + j
      // Wound so the surface faces up: a plate lit from below is a black disc.
      indices.push(v, v + 1, v + stride, v + 1, v + stride + 1, v + stride)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(shades, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The sector ticks of one well's ring, as thin quads on the surface. Sector 0
 * is drawn separately (longer, red) so it can carry its own material.
 */
export function sectorTicksGeometry(
  wellId: GravityWellId,
  ring: number,
  sectors: number[],
  length: number,
  width: number,
  layer: number
): BufferGeometry {
  const center = wellCenter(wellId)
  const radius = ringRadius(wellId, ring)
  const inner = radius - length
  const positions = new Float32Array(sectors.length * 4 * 3)
  const indices: number[] = []
  let p = 0
  sectors.forEach((sector, index) => {
    const angle = sectorEdgeAngle(wellId, sector)
    // Half the tick's width expressed as an angle, so it stays a constant size.
    const half = width / 2 / radius
    for (const [r, da] of [
      [inner, -half],
      [inner, half],
      [radius, -half],
      [radius, half],
    ] as const) {
      const point = polar(center, r, angle + da)
      positions[p++] = point.x
      positions[p++] = surfaceElevation(wellId, r) + layer
      positions[p++] = point.y
    }
    const v = index * 4
    indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/**
 * The printed board never changes, so its buffers are built once and shared by
 * every component that draws them. `disposeBoardSurfaces()` gives the GPU
 * memory back when the 3D board is unmounted (switching to the 2D board, or
 * leaving the table).
 */
const cache = new Map<string, BufferGeometry>()

export function cachedSurface(key: string, build: () => BufferGeometry): BufferGeometry {
  const existing = cache.get(key)
  if (existing) return existing
  const geometry = build()
  cache.set(key, geometry)
  return geometry
}

export function disposeBoardSurfaces() {
  for (const geometry of cache.values()) geometry.dispose()
  cache.clear()
}
