/**
 * Sector wedges, merged into one buffer.
 *
 * A weapon's range can be a hundred and twenty sectors and the destination
 * picker is every sector of every ring of every well: three hundred and
 * thirty-six of them. One mesh each would be three hundred and thirty-six draw
 * calls and as many materials, so the whole field is built once as a single
 * geometry and the cell under the pointer is recovered from the triangle the
 * raycast hit: every wedge contributes the same number of triangles, in order.
 *
 * The wedges themselves come from `world.ts`, which hugs the funnel; the band
 * they cover is the one the SVG board draws, so the two boards shade exactly
 * the same sectors.
 */
import { BufferAttribute, BufferGeometry } from 'three'
import type { Position } from '@dangerous-inclinations/engine'
import { polar, ringRadius, sectorEdgeAngle, wellCenter } from '../../../geometry'
import { LAYER, sectorWedgeGeometry, surfaceElevation } from '../../world'

/** Half-width of a range or picker wedge, in board units: the SVG board's 13. */
export const WEDGE_BAND = 13
/** A deployment sector is the wider mark, as it is on the SVG board. */
export const DEPLOY_BAND = 16

/** Angular resolution of a wedge outline; the fill uses the same. */
const OUTLINE_STEPS = 6

/** One sector's patch of surface, at the radii the SVG board draws it between. */
export function wedgeGeometry(
  cell: Position,
  band: number,
  elevation: number = LAYER.wedge
): BufferGeometry {
  const radius = ringRadius(cell.wellId, cell.ring)
  return sectorWedgeGeometry(cell.wellId, cell.sector, radius - band, radius + band, elevation)
}

export interface WedgeField {
  geometry: BufferGeometry
  /** Triangles each cell contributes, so a hit triangle names its cell. */
  trianglesPerCell: number
}

/** Every cell in one buffer, in the order they were given. */
export function wedgeFieldGeometry(
  cells: readonly Position[],
  band: number,
  elevation: number = LAYER.wedge
): WedgeField {
  const parts = cells.map(cell => wedgeGeometry(cell, band, elevation))
  let vertices = 0
  let indices = 0
  for (const part of parts) {
    vertices += part.getAttribute('position').count
    indices += part.getIndex()?.count ?? 0
  }
  const positions = new Float32Array(vertices * 3)
  const index = new Uint32Array(indices)
  let vertex = 0
  let slot = 0
  for (const part of parts) {
    const attribute = part.getAttribute('position') as BufferAttribute
    positions.set(attribute.array as Float32Array, vertex * 3)
    const partIndex = part.getIndex()
    if (partIndex) {
      for (let i = 0; i < partIndex.count; i++) index[slot++] = partIndex.getX(i) + vertex
    }
    vertex += attribute.count
    part.dispose()
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  return {
    geometry,
    trianglesPerCell: cells.length > 0 ? indices / 3 / cells.length : 0,
  }
}

/**
 * The faint edge around each wedge, as line segments in one buffer. It is what
 * makes a shaded range read as a count of sectors rather than as a stain.
 */
export function wedgeOutlineGeometry(
  cells: readonly Position[],
  band: number,
  elevation: number = LAYER.wedge
): BufferGeometry {
  const points: number[] = []
  const push = (wellId: Position['wellId'], radius: number, angle: number) => {
    const center = wellCenter(wellId)
    const point = polar(center, radius, angle)
    points.push(point.x, surfaceElevation(wellId, radius) + elevation, point.y)
  }
  for (const cell of cells) {
    const radius = ringRadius(cell.wellId, cell.ring)
    const inner = radius - band
    const outer = radius + band
    const a0 = sectorEdgeAngle(cell.wellId, cell.sector)
    const a1 = sectorEdgeAngle(cell.wellId, cell.sector + 1)
    for (const edge of [inner, outer]) {
      for (let i = 0; i < OUTLINE_STEPS; i++) {
        push(cell.wellId, edge, a0 + ((a1 - a0) * i) / OUTLINE_STEPS)
        push(cell.wellId, edge, a0 + ((a1 - a0) * (i + 1)) / OUTLINE_STEPS)
      }
    }
    for (const angle of [a0, a1]) {
      push(cell.wellId, inner, angle)
      push(cell.wellId, outer, angle)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3))
  return geometry
}
