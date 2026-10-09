/**
 * The mantis: a U open forward with a V for a stern. Two slim side hulls reach
 * forward like the arms of a fork, each carrying a flank pair on its outboard
 * face and a swept fin beneath. Aft, each arm is braced inward to a core at
 * the back, so the stern closes in a V on one cluster of engines. The bow
 * mount stands on the core's forward face, where the braces meet it, so the
 * forward module rides deep in the U between the arms. +X is the bow, +Y
 * dorsal, port is -Z; the mounts themselves are placed by `MANTIS_MOUNTS`
 * (hulls.ts).
 */
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  MeshStandardMaterial,
  Object3D,
  Shape,
  TorusGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { armoredSection, hollowSection, type Station } from './loft'
import { delavalBells, type Put } from './parts'
import type { Vec3 } from './config'

type Mat = MeshStandardMaterial
export type MantisInk = Record<
  'hull' | 'pale' | 'dark' | 'steel' | 'rubber' | 'copper' | 'cyan' | 'red',
  Mat
>

/** An arm's centreline, half width and half height, and where it starts aft. */
const ARM_Z = 1.7
const ARM_W = 0.45
const ARM_H = 0.8
const ARM_AFT = -2.1
/** The core at the V's point: its size, where it ends aft and how far it rides above the arms. */
const CORE_W = 0.75
const CORE_H = 0.85
const CORE_AFT = -3.8
export const CORE_RAISE = 0.5

export function buildMantis(body: Group, put: Put, m: MantisInk) {
  const section = (s: Station[], mat: Mat, pos?: Vec3, rot?: Vec3) =>
    put(armoredSection(s), mat, pos, rot)
  const slab = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(
      new RoundedBoxGeometry(...size, 1, Math.min(0.018, ...size.map(n => n / 3))),
      mat,
      pos,
      rot,
      parent
    )
  const box = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(new BoxGeometry(...size), mat, pos, rot, parent)
  const cylinder = (
    r: number,
    h: number,
    pos: Vec3,
    mat: Mat,
    rot?: Vec3,
    parent: Object3D = body
  ) => put(new CylinderGeometry(r, r, h, 16), mat, pos, rot, parent)
  const pipe = (from: Vec3, to: Vec3, r: number, mat: Mat, parent: Object3D = body) => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const mesh = put(
      new CylinderGeometry(r, r, a.distanceTo(b), 10),
      mat,
      a.clone().add(b).multiplyScalar(0.5).toArray() as Vec3,
      undefined,
      parent
    )
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize())
  }
  /** A flat fin cut to a profile in (x, y), `thickness` deep, centred on `z`. */
  const fin = (points: [number, number][], thickness: number, z: number, mat: Mat, rot?: Vec3) => {
    const shape = new Shape()
    shape.moveTo(...points[0])
    for (const point of points.slice(1)) shape.lineTo(...point)
    shape.closePath()
    const geo = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
    geo.translate(0, 0, -thickness / 2)
    return put(geo, mat, [0, 0, z], rot)
  }

  // The core at the point of the V, riding above the arms. The bow mount
  // stands on its forward face, where the braces meet it, so the forward
  // module rides deep in the U and high between the arms.
  const R = CORE_RAISE
  section(
    [
      [CORE_AFT, 0.8, 0.7, R],
      [CORE_AFT + 0.25, CORE_H, CORE_W, R],
      [-1.75, CORE_H, CORE_W, R],
      [-1.45, 0.72, 0.7, R],
    ],
    m.hull
  )
  for (const s of [-1, 1]) {
    // Cheek plates either side of the bow mount, as the corvette's.
    slab([0.7, 0.3, 0.12], [-1.75, R + 0.05, s * 0.79], m.pale)
    // Chines canted over the core's edges above and below.
    slab([1.9, 0.13, 0.3], [-2.75, R + 0.72, s * 0.62], m.pale, [s * 0.68, 0, 0])
    slab([1.9, 0.12, 0.28], [-2.75, R - 0.72, s * 0.62], m.pale, [-s * 0.65, 0, 0])
    // Armour laid in steps down the flanks, and vents behind it.
    slab([1.5, 0.62, 0.08], [-2.85, R, s * 0.78], m.pale)
    slab([0.9, 0.36, 0.08], [-2.7, R + 0.04, s * 0.84], m.hull)
    for (let i = 0; i < 4; i++) box([0.05, 0.42, 0.03], [-3.75 + i * 0.1, R, s * 0.77], m.dark)
  }
  // The fixed scoop under the core's forward face.
  slab([0.8, 0.2, 0.6], [-2.0, R - 0.9, 0], m.steel)
  box([0.1, 0.15, 0.46], [-1.6, R - 0.9, 0], m.rubber)
  for (const z of [-0.16, -0.05, 0.05, 0.16]) box([0.12, 0.13, 0.03], [-1.55, R - 0.9, z], m.pale)
  // The command citadel on the core: a raised pale block with an armoured
  // slit and its windows looking forward over the bow module.
  section(
    [
      [-3.1, 0.08, 0.5],
      [-2.85, 0.3, 0.56],
      [-2.0, 0.3, 0.48],
      [-1.6, 0.08, 0.4],
    ],
    m.pale,
    [0, R + CORE_H + 0.06, 0]
  )
  box([0.045, 0.14, 0.56], [-1.77, R + CORE_H + 0.27, 0], m.rubber, [0, 0, 0.42])
  for (const z of [-0.2, 0, 0.2])
    box([0.05, 0.052, 0.13], [-1.74, R + CORE_H + 0.28, z], m.cyan, [0, 0, 0.42])
  // A keel fin beneath the core, swept aft and cut square, with the pale band
  // down its leading edge.
  const banded = (points: [number, number][], thickness: number) => {
    fin(points, thickness, 0, m.hull)
    const [root, lead] = points
    fin(
      [
        [root[0] + 0.015, root[1]],
        [lead[0] + 0.015, lead[1]],
        [lead[0] - 0.18, lead[1]],
        [root[0] - 0.28, root[1]],
      ],
      thickness + 0.04,
      0,
      m.pale
    )
  }
  banded(
    [
      [-1.85, R - CORE_H + 0.02],
      [-3.15, R - 1.42],
      [-3.6, R - 1.42],
      [-4.15, R - CORE_H + 0.02],
    ],
    0.09
  )

  for (const s of [-1, 1] as const) arm(s)
  function arm(s: -1 | 1) {
    const z = s * ARM_Z
    section(
      [
        [ARM_AFT, 0.7, 0.4],
        [ARM_AFT + 0.25, ARM_H, ARM_W],
        [3.3, ARM_H, ARM_W],
      ],
      m.hull,
      [0, 0, z]
    )
    // The brace that closes the V: from the arm's aft end in to the core.
    // It climbs as it goes, so the core rides above the arms.
    const from = new Vector3(ARM_AFT + 0.35, 0, z)
    const to = new Vector3(CORE_AFT + 0.6, CORE_RAISE, s * 0.35)
    const run = to.clone().sub(from)
    const length = run.length()
    const mid = from.clone().add(to).multiplyScalar(0.5).toArray() as Vec3
    const brace = section(
      [
        [-length / 2, 0.66, 0.38],
        [length / 2, 0.66, 0.38],
      ],
      m.hull,
      mid
    )
    brace.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), run.clone().normalize())
    // A pale strake along its back, standing a hair proud of it.
    const up = new Vector3(0, 1, 0).applyQuaternion(brace.quaternion)
    const strake = slab(
      [length * 0.7, 0.06, 0.42],
      new Vector3(...mid).addScaledVector(up, 0.67).toArray() as Vec3,
      m.pale
    )
    strake.quaternion.copy(brace.quaternion)
    // Chines canted over the clipped edges above and below the flank mounts
    // and along the inboard side.
    for (const t of [-1, 1]) {
      const edge = z + t * 0.37
      slab([4.9, 0.13, 0.28], [0.5, 0.66, edge], m.pale, [t * 0.68, 0, 0])
      slab([4.9, 0.12, 0.24], [0.5, -0.66, edge], m.pale, [-t * 0.65, 0, 0])
    }
    // A rib standing proud between the flank mounts, where the loads come in.
    const face = z + s * (ARM_W + 0.04)
    box([0.2, 0.9, 0.1], [0.3, 0, face], m.steel)
    for (const y of [-0.3, 0, 0.3]) box([0.24, 0.06, 0.06], [0.3, y, face + s * 0.06], m.dark)
    // The arm's tip: a nacelle front, tapering evenly all round to the
    // intake. The taper is the intake's own wall, so the mouth starts where
    // it ends: a pale lip, a dark lining, a recessed back face and vanes
    // running into it. Thrusters outboard and a nav light, red to port, the
    // fuel teal to starboard.
    {
      const tip = (x: number, h: number, w: number, lift: number) => [x, h, w, lift] as const
      const back = tip(3.3, ARM_H, ARM_W, 0)
      const front = tip(3.8, 0.64, 0.38, 0)
      const mouth = { h: 0.3, w: 0.24, y: 0 }
      const bore = (grow: number): [number, number, number] => [
        mouth.h + grow,
        mouth.w + grow,
        mouth.y,
      ]
      // The bore stands clear of the lining by a hair: faces laid on each other flicker.
      const hollowAt = (
        x0: number,
        x1: number,
        o0: [number, number, number],
        o1: [number, number, number],
        i: [number, number, number],
        mat: Mat
      ) => put(hollowSection(x0, x1, o0, o1, i, i), mat, [0, 0, z])
      hollowAt(
        back[0],
        front[0],
        [back[1], back[2], back[3]],
        [front[1], front[2], front[3]],
        bore(0.02),
        m.hull
      )
      const lip: [number, number, number] = [front[1] + 0.02, front[2] + 0.02, front[3]]
      hollowAt(front[0], front[0] + 0.06, lip, lip, bore(0.02), m.pale)
      put(
        hollowSection(
          back[0] + 0.02,
          front[0] + 0.065,
          bore(0),
          bore(0),
          bore(-0.025),
          bore(-0.025)
        ),
        m.dark,
        [0, 0, z]
      )
      section(
        [
          [back[0] + 0.01, mouth.h, mouth.w, mouth.y],
          [back[0] + 0.04, mouth.h, mouth.w, mouth.y],
        ],
        m.dark,
        [0, 0, z]
      )
      for (const dy of [-0.16, -0.08, 0, 0.08, 0.16])
        box(
          [front[0] - back[0] - 0.06, 0.018, mouth.w * 2 - 0.06],
          [(back[0] + front[0]) / 2 + 0.02, mouth.y + dy, z],
          m.steel
        )
    }
    box([0.42, 0.2, 0.1], [2.9, -0.3, z + s * 0.42], m.dark)
    for (const dx of [-0.1, 0.1])
      cylinder(0.06, 0.1, [2.9 + dx, -0.3, z + s * 0.5], m.rubber, [(s * Math.PI) / 2, 0, 0])
    box([0.17, 0.08, 0.14], [2.7, 0.84, z], s < 0 ? m.red : m.cyan)
    // Service runs along the inboard flank, either side of the bow module.
    const inboard = z - s * (ARM_W + 0.05)
    for (const y of [-0.3, 0.3]) pipe([-1.4, y, inboard], [2.95, y, inboard], 0.05, m.copper)
    for (const x of [-0.8, 0.7, 2.0, 2.8]) box([0.14, 0.8, 0.1], [x, 0, inboard], m.steel)
    // A fin beneath, swept aft and cut square, canted a little outboard, with
    // a pale band down its leading edge standing a hair proud of it.
    const cant: Vec3 = [-s * 0.22, 0, 0]
    const root: [number, number] = [2.7, -0.72]
    const lead: [number, number] = [0.25, -1.75]
    fin([root, lead, [-0.45, -1.75], [-1.7, -0.72]], 0.09, z, m.hull, cant)
    fin(
      [
        [root[0] + 0.015, root[1] + 0.005],
        [lead[0] + 0.012, lead[1] - 0.012],
        [lead[0] - 0.18, lead[1]],
        [root[0] - 0.3, root[1]],
      ],
      0.12,
      z,
      m.pale,
      cant
    )
  }

  drive()
  /**
   * One cluster at the V's point, built as the shrike's is but kept close to
   * the core: a busy steel thrust plate, five bells (a big one in the middle, a
   * smaller one in each corner), a short shroud with a pale lip and steel
   * frames, and turbopumps on its roof feeding forward into the core.
   */
  function drive() {
    const g = new Group()
    g.name = 'stern_drive'
    g.position.y = CORE_RAISE
    body.add(g)
    const H = 0.82
    const W = 0.88
    const skin = 0.12
    const plate = CORE_AFT - 0.04
    const fore = CORE_AFT + 0.05
    const aft = CORE_AFT - 0.55
    const tube = (x0: number, x1: number, h: number, w: number, bore: number, mat: Mat) =>
      put(
        hollowSection(
          x0,
          x1,
          [h, w, 0],
          [h, w, 0],
          [H - bore, W - bore, 0],
          [H - bore, W - bore, 0]
        ),
        mat,
        undefined,
        undefined,
        g
      )
    put(
      armoredSection([
        [CORE_AFT + 0.1, CORE_H + 0.025, CORE_W + 0.025],
        [CORE_AFT + 0.14, CORE_H + 0.025, CORE_W + 0.025],
      ]),
      m.dark,
      undefined,
      undefined,
      g
    )
    put(
      armoredSection([
        [plate, H - skin - 0.01, W - skin - 0.01],
        [plate + 0.1, H - skin - 0.01, W - skin - 0.01],
      ]),
      m.steel,
      undefined,
      undefined,
      g
    )
    // The shroud. Bands' bores stand clear of the wall's by a hair, so no two
    // faces share a plane.
    tube(aft, fore, H, W, skin, m.hull)
    tube(aft - 0.02, aft + 0.12, H + 0.02, W + 0.02, skin - 0.015, m.pale)
    tube(fore - 0.12, fore - 0.02, H + 0.04, W + 0.04, skin - 0.015, m.steel)
    // The plate's furniture: seams between the bells, bolts round its edge.
    for (const z of [-0.29, 0.29])
      box([0.02, (H - skin) * 2 - 0.1, 0.025], [plate - 0.005, 0, z], m.dark, undefined, g)
    for (let i = -4; i <= 4; i++)
      for (const t of [-1, 1]) {
        cylinder(
          0.028,
          0.03,
          [plate - 0.005, t * (H - skin - 0.07), (i * (W - skin - 0.1)) / 4.4],
          m.dark,
          [0, 0, Math.PI / 2],
          g
        )
        if (Math.abs(i) <= 2)
          cylinder(
            0.028,
            0.03,
            [plate - 0.005, (i * (H - skin - 0.1)) / 2.4, t * (W - skin - 0.07)],
            m.dark,
            [0, 0, Math.PI / 2],
            g
          )
      }
    delavalBells(put, m, g, plate, [
      [0, 0, 0.62],
      [0.42, -0.5, 0.36],
      [0.42, 0.5, 0.36],
      [-0.42, -0.5, 0.36],
      [-0.42, 0.5, 0.36],
    ])
    // Turbopumps on the shroud's roof, each feeding forward into the core.
    const roof = H + 0.02
    for (const z of [-0.42, 0.42]) {
      put(
        new CylinderGeometry(0.12, 0.12, 0.36, 20),
        m.dark,
        [aft + 0.28, roof + 0.13, z],
        [0, 0, Math.PI / 2],
        g
      )
      for (const dx of [-0.12, 0.12])
        put(
          new TorusGeometry(0.125, 0.022, 6, 24),
          m.steel,
          [aft + 0.28 + dx, roof + 0.13, z],
          [0, Math.PI / 2, 0],
          g
        )
      box([0.22, 0.05, 0.2], [aft + 0.28, roof + 0.025, z], m.steel, undefined, g)
      pipe([aft + 0.46, roof + 0.13, z], [CORE_AFT + 0.3, roof + 0.13, z], 0.035, m.copper, g)
      pipe([CORE_AFT + 0.3, roof + 0.13, z], [CORE_AFT + 0.3, CORE_H, z], 0.035, m.copper, g)
    }
  }
}
