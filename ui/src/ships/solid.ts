/**
 * What each mesh of a ship is, as a solid: the description the printed model
 * (`cad/`) rebuilds the ship from, so the print and the game are one ship.
 * Every geometry the yard makes carries one in `geometry.userData.solid`;
 * the renderer ignores it. Pure data and two helpers, no rendering.
 *
 * Each kind is given in the geometry's own frame, as three.js builds it,
 * before any `bake` (a transform applied to the geometry itself, column-major
 * like `Matrix4.elements`) and before the mesh's own transform.
 */
import type { BufferGeometry, Material, Matrix4, Mesh, Object3D } from 'three'

type V2 = [number, number]
type V3 = [number, number, number]

export type SolidSpec =
  /** A box centred on the origin (`BoxGeometry`, `RoundedBoxGeometry`). */
  (
    | { kind: 'box'; size: V3 }
    /**
     * `CylinderGeometry`: along y, centred, `top` radius at +y. With few sides
     * it is a faceted prism (vertices at x = r sin a, z = r cos a, from
     * a = `thetaStart`); with many it reads round.
     */
    | {
        kind: 'cylinder'
        top: number
        bottom: number
        height: number
        sides: number
        thetaStart: number
      }
    /** `TorusGeometry`: a ring of `radius` in the xy plane round z, a tube of `tube`. */
    | { kind: 'torus'; radius: number; tube: number }
    /**
     * `ExtrudeGeometry`: `outline` (anticlockwise, with `holes`) in xy, pulled
     * along +z from 0 to `depth`. With a bevel the outline grows by `bevel.size`
     * and the solid runs from -`bevel.thickness` to `depth` + `bevel.thickness`.
     */
    | {
        kind: 'extrude'
        outline: V2[]
        holes: V2[][]
        depth: number
        bevel: { thickness: number; size: number } | null
      }
    /** `armoredSection` (`loft.ts`): [x, half height, half width, lift?] stations, aft to fore. */
    | { kind: 'loft'; stations: number[][] }
    /**
     * `hollowSection` (`loft.ts`), its arguments as given; `rake` shears its
     * end rings at or ahead of `fromX` (x moves forward by k for every unit
     * below y0), as the shrike rakes its chin intake.
     */
    | {
        kind: 'hollow'
        x0: number
        x1: number
        outer0: V3
        outer1: V3
        inner0: V3
        inner1: V3
        rake?: { k: number; y0: number; fromX: number }
      }
    /** `LatheGeometry`: the [radius, y] profile turned round y. */
    | { kind: 'lathe'; profile: V2[] }
    /** Finer than any print: drawn by the game, left off the print (cooling tubes, glow discs). */
    | { kind: 'detail' }
  ) & { bake?: number[] }

/** Tag a geometry with the solid it is. Returns the geometry. */
export function describe<T extends BufferGeometry>(geometry: T, spec: SolidSpec): T {
  geometry.userData.solid = spec
  return geometry
}

/**
 * Transform a described geometry in place (instead of `rotateX`, `translate`
 * and the like, which do the same `applyMatrix4`) and record the transform,
 * so the solid follows the mesh.
 */
export function bake<T extends BufferGeometry>(geometry: T, matrix: Matrix4): T {
  geometry.applyMatrix4(matrix)
  const spec = geometry.userData.solid as SolidSpec | undefined
  if (spec) {
    const m = matrix.clone()
    if (spec.bake) m.multiply(new (matrix.constructor as typeof Matrix4)().fromArray(spec.bake))
    // A clone shares its original's userData (three copies it by reference),
    // so replace the description rather than change it.
    geometry.userData = { ...geometry.userData, solid: { ...spec, bake: m.toArray() } }
  }
  return geometry
}

/** The solid a geometry was tagged with, if any. */
export function solidOf(geometry: BufferGeometry): SolidSpec | undefined {
  return geometry.userData.solid as SolidSpec | undefined
}

/** One mesh of a ship as a solid: what it is, where it is, what it is made of. */
export interface PlacedSolid {
  spec: SolidSpec
  /** The mesh's world matrix (column-major), the ship's root at the origin. */
  matrix: number[]
  /** The material's name (`hull`, `pale`, `dark`, `steel`, ...). */
  material: string
  /** The names of the groups it sits in, root first, and its own last. */
  path: string[]
  /** Its bounding box in the root's frame: the corners [min, max]. */
  bounds: [V3, V3]
}

/**
 * Every mesh under `root` as a placed solid, the root's own transform left
 * out. A mesh whose geometry carries no description is an error: the print
 * would silently miss it.
 */
export function placedSolids(root: Object3D): PlacedSolid[] {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const out: PlacedSolid[] = []
  root.traverse(object => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const spec = solidOf(mesh.geometry)
    const path: string[] = []
    for (let o: Object3D | null = mesh; o && o !== root; o = o.parent) path.unshift(o.name)
    if (!spec) throw new Error(`No solid description on ${path.join('/') || 'a mesh'}`)
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material
    const matrix = inverse.clone().multiply(mesh.matrixWorld)
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix)
    out.push({
      spec,
      matrix: matrix.toArray(),
      material: material.name,
      path,
      bounds: [box.min.toArray(), box.max.toArray()],
    })
  })
  return out
}
