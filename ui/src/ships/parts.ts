/**
 * Parts more than one hull is built from, in the yard's materials. A part is
 * placed with the hull's own `put`, so it lands in the hull's geometry and
 * takes its paint and livery like everything else on it.
 */
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { Vec3 } from './config'

type Mat = MeshStandardMaterial
export type Put = (
  geometry: BufferGeometry,
  mat: Mat,
  pos?: Vec3,
  rot?: Vec3,
  parent?: Object3D
) => Mesh

/** The de Laval bell's outside, throat to lip, as [radius, distance aft]. */
const BELL: [number, number][] = [
  [0.175, 0.33],
  [0.275, 0.5],
  [0.355, 0.7],
  [0.415, 0.9],
  [0.455, 1.1],
  [0.465, 1.22],
]
/** Its wall: the chamber, converging to the throat, then the bell and back in. */
const WALL = [
  [0.3, -0.12],
  [0.3, 0.08],
  [0.17, 0.28],
  [0.17, 0.33],
  [0.27, 0.5],
  [0.35, 0.7],
  [0.41, 0.9],
  [0.45, 1.1],
  [0.46, 1.25],
  [0.44, 1.25],
  [0.43, 1.1],
  [0.39, 0.9],
  [0.33, 0.7],
  [0.25, 0.5],
  [0.15, 0.33],
  [0.15, 0.28],
]
/** A full-size bell reaches this far aft of where it is hung. */
export const BELL_LENGTH = 1.25

function radiusAt(v: number) {
  for (let i = 1; i < BELL.length; i++)
    if (v <= BELL[i][1]) {
      const [r0, v0] = BELL[i - 1]
      const [r1, v1] = BELL[i]
      return r0 + ((r1 - r0) * (v - v0)) / (v1 - v0)
    }
  return BELL.at(-1)![0]
}

/**
 * De Laval bells hung aft of a thrust plate whose face is at `plate` (in the
 * parent's frame, +X forward): each a jacket of cooling tubes held by hat
 * bands, a manifold at the lip, a mount ring and a socket in the plate, a
 * gimbal pair, and a faint glow in the throat. Named `drive_bell_*` as the
 * corvette's are, so the board finds the nozzles.
 */
export function delavalBells(
  put: Put,
  ink: Record<'dark' | 'steel' | 'cyan', Mat>,
  parent: Object3D,
  plate: number,
  bells: [y: number, z: number, scale: number][],
  name = 'drive_bell'
) {
  const hang = plate + 0.09
  const jacket = coolingJacket(BELL, 28, 0.014)
  const ring = (r: number, tube: number, v: number, mat: Mat, bell: Object3D) =>
    put(new TorusGeometry(r, tube, 6, 40), mat, [0, v, 0], [Math.PI / 2, 0, 0], bell)
  const pipe = (from: Vec3, to: Vec3, r: number) => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const mesh = put(
      new CylinderGeometry(r, r, a.distanceTo(b), 10),
      ink.steel,
      a.clone().add(b).multiplyScalar(0.5).toArray() as Vec3,
      undefined,
      parent
    )
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize())
  }
  bells.forEach(([y, z, scale], i) => {
    const bell = new Group()
    bell.name = `${name}_${i}`
    bell.position.set(hang, y, z)
    bell.scale.setScalar(scale)
    bell.rotation.z = Math.PI / 2 // the bell's +Y points aft
    parent.add(bell)
    put(
      new LatheGeometry(
        WALL.map(([u, v]) => new Vector2(u, v)),
        40
      ),
      ink.dark,
      undefined,
      undefined,
      bell
    )
    put(jacket.clone(), ink.steel, undefined, undefined, bell)
    for (const v of [0.45, 0.72, 0.98]) ring(radiusAt(v) + 0.018, 0.016, v, ink.dark, bell)
    ring(0.48, 0.028, 1.22, ink.dark, bell)
    ring(0.32, 0.04, -0.08, ink.steel, bell)
    ring(0.2, 0.025, 0.31, ink.steel, bell)
    put(new CylinderGeometry(0.14, 0.14, 0.01, 24), ink.cyan, [0, 0.3, 0], undefined, bell)
    put(
      new TorusGeometry(0.3 * scale + 0.07, 0.03, 6, 32),
      ink.dark,
      [plate, y, z],
      [0, Math.PI / 2, 0],
      parent
    )
    for (const s of [-1, 1])
      pipe(
        [plate + 0.01, y + s * (0.3 * scale + 0.1), z],
        [hang - 0.2 * scale, y + s * 0.22 * scale, z],
        0.022
      )
  })
  jacket.dispose()
}

/** A bell's outside as a ring of cooling tubes: the profile, fluted round. */
function coolingJacket(profile: [number, number][], tubes: number, depth: number): BufferGeometry {
  const samples: [number, number][] = []
  for (let i = 0; i < profile.length - 1; i++)
    for (let t = 0; t < 4; t++) {
      const [r0, v0] = profile[i]
      const [r1, v1] = profile[i + 1]
      samples.push([r0 + ((r1 - r0) * t) / 4, v0 + ((v1 - v0) * t) / 4])
    }
  samples.push(profile.at(-1)!)
  const segments = tubes * 6
  const positions: number[] = []
  for (let i = 0; i <= segments; i++) {
    const phi = (i / segments) * Math.PI * 2
    const flute = depth * (0.5 + 0.5 * Math.cos(phi * tubes))
    for (const [r, v] of samples)
      positions.push((r + flute) * Math.sin(phi), v, (r + flute) * Math.cos(phi))
  }
  const index: number[] = []
  const n = samples.length
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = j + i * n
      index.push(a, a + n, a + 1, a + n + 1, a + 1, a + n)
    }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}
