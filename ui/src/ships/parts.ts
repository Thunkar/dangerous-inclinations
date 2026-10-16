/**
 * Parts more than one hull is built from, in the yard's materials. A part is
 * placed with the hull's own `put`, so it lands in the hull's geometry and
 * takes its paint and livery like everything else on it.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  type ExtrudeGeometryOptions,
  type Shape,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Vec3 } from './config'
import { describe } from './solid'

type Mat = MeshStandardMaterial
export type Put = (
  geometry: BufferGeometry,
  mat: Mat,
  pos?: Vec3,
  rot?: Vec3,
  parent?: Object3D
) => Mesh

/** A box, described; with a `radius`, its edges rounded (`RoundedBoxGeometry`). */
export function boxSolid(size: Vec3, radius?: number): BufferGeometry {
  const geometry =
    radius === undefined ? new BoxGeometry(...size) : new RoundedBoxGeometry(...size, 1, radius)
  return describe(geometry, { kind: 'box', size: [...size] })
}

/** A `CylinderGeometry` of `sides` faces, described. */
export function cylinderSolid(
  top: number,
  bottom: number,
  height: number,
  sides: number
): CylinderGeometry {
  return describe(new CylinderGeometry(top, bottom, height, sides), {
    kind: 'cylinder',
    top,
    bottom,
    height,
    sides,
    thetaStart: 0,
  })
}

/** A `TorusGeometry`, described. */
export function torusSolid(
  radius: number,
  tube: number,
  radialSegments: number,
  tubularSegments: number
): TorusGeometry {
  return describe(new TorusGeometry(radius, tube, radialSegments, tubularSegments), {
    kind: 'torus',
    radius,
    tube,
  })
}

/** An `ExtrudeGeometry`, described by the outline it extrudes (three's defaults filled in). */
export function extrudeSolid(shape: Shape, options: ExtrudeGeometryOptions): ExtrudeGeometry {
  const { shape: outline, holes } = shape.extractPoints(options.curveSegments ?? 12)
  const thickness = options.bevelThickness ?? 0.2
  return describe(new ExtrudeGeometry(shape, options), {
    kind: 'extrude',
    outline: outline.map(p => [p.x, p.y]),
    holes: holes.map(hole => hole.map(p => [p.x, p.y])),
    depth: options.depth ?? 1,
    bevel:
      (options.bevelEnabled ?? true)
        ? { thickness, size: options.bevelSize ?? thickness - 0.1 }
        : null,
  })
}
