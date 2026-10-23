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
import { Group, Matrix4, MeshStandardMaterial, Object3D, Shape, Vector3 } from 'three'
import { armoredSection, hollowSection, sectionLoft, type Station } from './loft'
import { boxSolid, cylinderSolid, extrudeSolid, torusSolid, type Put } from './parts'
import { intakes } from './engines'
import { bake } from './solid'
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
/** The core at the V's point: its size and where it ends aft. */
const CORE_W = 0.75
const CORE_H = 0.85
const CORE_AFT = -3.8
/** The arms' undersides, where the ship stands on its keel. */
const KEEL = -ARM_H
/**
 * Every part of the core stands on the plane the arms stand on, so the three
 * bodies print on the bed together and nothing of the core hangs over it: its
 * underside goes a hair below the arms' (the print's bed cuts it flat).
 */
const FLOOR = KEEL - 0.03
/** The lift that stands a section of half height h on the floor. */
const onFloor = (h: number) => h + FLOOR
const R = onFloor(CORE_H)
/** The stern block the core climbs to aft, as the shrike's: the drive's shroud carries its section on. */
const STERN_H = 1.25
const STERN_W = 0.95
/** Where the climb starts (behind the bow face, under the citadel) and where the block stands full height. */
const CLIMB = -1.95
const STERN_FORE = -3.4

/**
 * The keel fin under the core, swept aft and cut square: its root on the
 * core's belly, its bottom, the x of its root's ends and of its bottom's,
 * and its thickness and the pale band's down its leading edge. It prints as
 * the top of the display stand, slid into a slit in the core.
 */
export const MANTIS_FIN = {
  root: FLOOR + 0.02,
  bottom: R - 1.42,
  fore: -1.85,
  lead: -3.15,
  trail: -3.6,
  aft: -4.15,
  thick: 0.4,
  band: 0.44,
}

/**
 * The fin under each arm, swept aft and cut square: its outline in (x, y)
 * (root fore, leading edge's foot, trailing edge's foot, root aft), how
 * thick it is, and how far it is canted outboard (radians, about x through
 * the arm's centre line at y = 0). It prints apart, slid into a slit in
 * the arm and glued.
 */
export const MANTIS_ARM_FIN = {
  points: [
    [2.7, -0.72],
    [0.25, -1.75],
    [-0.45, -1.75],
    [-1.7, -0.72],
  ] as [number, number][],
  thick: 0.09,
  cant: 0.22,
  z: ARM_Z,
}

export function buildMantis(body: Group, put: Put, m: MantisInk) {
  const section = (s: Station[], mat: Mat, pos?: Vec3, rot?: Vec3) =>
    put(armoredSection(s), mat, pos, rot)
  const slab = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(boxSolid(size, Math.min(0.018, ...size.map(n => n / 3))), mat, pos, rot, parent)
  const box = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(boxSolid(size), mat, pos, rot, parent)
  const cylinder = (
    r: number,
    h: number,
    pos: Vec3,
    mat: Mat,
    rot?: Vec3,
    parent: Object3D = body
  ) => put(cylinderSolid(r, r, h, 16), mat, pos, rot, parent)
  const pipe = (from: Vec3, to: Vec3, r: number, mat: Mat, parent: Object3D = body) => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const mesh = put(
      cylinderSolid(r, r, a.distanceTo(b), 10),
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
    const geo = extrudeSolid(shape, { depth: thickness, bevelEnabled: false })
    bake(geo, new Matrix4().makeTranslation(0, 0, -thickness / 2))
    return put(geo, mat, [0, 0, z], rot)
  }

  // The core at the point of the V, on the bed with the arms, climbing aft
  // behind the citadel to the stern block the drive hangs on, as the
  // shrike's does. The bow mount stands on its forward face, where the
  // braces meet it, so the forward module rides deep in the U.
  section(
    [
      [CORE_AFT, STERN_H - 0.05, STERN_W - 0.05, onFloor(STERN_H - 0.05)],
      [CORE_AFT + 0.2, STERN_H, STERN_W, onFloor(STERN_H)],
      [STERN_FORE, STERN_H, STERN_W, onFloor(STERN_H)],
      [CLIMB, CORE_H, CORE_W, R],
      [-1.75, CORE_H, CORE_W, R],
      [-1.45, 0.72, 0.7, onFloor(0.72)],
    ],
    m.hull
  )
  // The climb, read off the core's stations: its half height and width, its
  // top and its corner cut at x.
  const along = (x: number) => Math.min(1, Math.max(0, (CLIMB - x) / (CLIMB - STERN_FORE)))
  const hAt = (x: number) => CORE_H + (STERN_H - CORE_H) * along(x)
  const wAt = (x: number) => CORE_W + (STERN_W - CORE_W) * along(x)
  const topAt = (x: number) => onFloor(hAt(x)) + hAt(x)
  const cutAt = (x: number) => Math.min(hAt(x), wAt(x)) * 0.35
  /** A strip laid along the core through `xs`, its [y, z] ring at each. */
  const strip = (xs: number[], ring: (x: number) => [number, number][], mat: Mat) =>
    put(sectionLoft(xs.map(x => ({ x, ring: ring(x) }))), mat)
  const lengthwise = [-1.75, CLIMB, STERN_FORE, CORE_AFT + 0.2]
  const pitch = Math.atan((topAt(STERN_FORE) - topAt(CLIMB)) / (CLIMB - STERN_FORE))
  for (const s of [-1, 1]) {
    // Cheek plates either side of the bow mount, as the corvette's, carried
    // down to the bed so they do not hang off the flank.
    slab([0.7, R + 0.2 - FLOOR, 0.12], [-1.75, (R + 0.2 + FLOOR) / 2, s * 0.79], m.pale)
    // Under the bow collar's upper plate, where it reaches back over the
    // core's corner cut, a gusset from the core's flank out to the collar's
    // cheek at 45 degrees, so the plate has something under it.
    strip(
      [-2.1, -1.45],
      () => [
        [0.7, s * 0.6],
        [0.7, s * 0.93],
        [0.37, s * 0.6],
      ],
      m.hull
    )
    // And under the collar's cheek, where the lower plate narrows aft, a foot
    // down to the bed.
    box([0.47, 0.19, 0.16], [-1.82, FLOOR + 0.095, s * 0.97], m.hull)
    // Chines laid on the core's upper corner cuts, from the bow up the
    // climb to the drive, standing a hair off them.
    strip(
      lengthwise,
      x => {
        const [top, w, c] = [topAt(x), wAt(x), cutAt(x)]
        const on = (t: number, out: number): [number, number] => [
          top - t * c + out,
          s * (w - c + t * c + out),
        ]
        return [on(0.15, 0.01), on(0.85, 0.01), on(0.85, 0.06), on(0.15, 0.06)]
      },
      m.pale
    )
    // An armour plate down each flank along the climb, its foot cut at 45
    // degrees so nothing of it hangs, and a darker plate stepped on it.
    for (const [lo, hi, out, mat] of [
      [FLOOR + 0.18, 0.12, 0.05, m.pale],
      [FLOOR + 0.36, 0.3, 0.1, m.hull],
    ] as const)
      strip(
        [CLIMB - 0.1, STERN_FORE],
        x => {
          const w = wAt(x) + 0.005
          const up = topAt(x) - cutAt(x) - hi
          return [
            [lo, s * w],
            [up, s * w],
            [up, s * (w + out)],
            [lo + out, s * (w + out)],
          ]
        },
        mat
      )
  }
  // A spine up the climb from the citadel to the drive, and either side of
  // it heat-sink louvres laid on the slope.
  section(
    lengthwise.slice(1).map(x => [x, 0.07, 0.13, topAt(x) - 0.03] as Station),
    m.steel
  )
  for (const z of [-0.3, 0.3]) {
    for (let i = 0; i < 5; i++) {
      const x = -2.85 - i * 0.11
      box([0.05, 0.05, 0.3], [x, topAt(x) + 0.01, z], m.dark, [0, 0, -pitch])
    }
  }
  // The fixed scoop at the foot of the core's forward face, under the bow module.
  slab([0.3, 0.2, 0.6], [-1.35, FLOOR + 0.1, 0], m.steel)
  box([0.06, 0.15, 0.46], [-1.19, FLOOR + 0.1, 0], m.rubber)
  for (const z of [-0.16, -0.05, 0.05, 0.16]) box([0.06, 0.13, 0.03], [-1.17, FLOOR + 0.1, z], m.pale)
  // The command citadel on the core, ahead of the climb: a raised pale
  // block with an armoured slit and its windows looking forward over the
  // bow module.
  section(
    (
      [
        [-2.75, 0.08, 0.5],
        [-2.55, 0.3, 0.56],
        [-2.0, 0.3, 0.48],
        [-1.6, 0.08, 0.4],
      ] as const
    ).map(([x, h, w]) => [x, h, w, topAt(x) + 0.06] as Station),
    m.pale
  )
  box([0.045, 0.14, 0.56], [-1.77, R + CORE_H + 0.27, 0], m.rubber, [0, 0, 0.42])
  for (const z of [-0.2, 0, 0.2])
    box([0.05, 0.052, 0.13], [-1.74, R + CORE_H + 0.28, z], m.cyan, [0, 0, 0.42])
  // A keel fin beneath the core, swept aft and cut square, with the pale band
  // down its leading edge.
  const banded = (points: [number, number][], thickness: number, proud: number) => {
    fin(points, thickness, 0, m.hull)
    const [root, lead] = points
    fin(
      [
        [root[0] + 0.015, root[1]],
        [lead[0] + 0.015, lead[1]],
        [lead[0] - 0.18, lead[1]],
        [root[0] - 0.28, root[1]],
      ],
      thickness + proud,
      0,
      m.pale
    )
  }
  {
    const { root, bottom, fore, lead, trail, aft, thick, band } = MANTIS_FIN
    banded(
      [
        [fore, root],
        [lead, bottom],
        [trail, bottom],
        [aft, root],
      ],
      thick,
      band - thick
    )
  }

  for (const s of [-1, 1] as const) arm(s)
  function arm(s: -1 | 1) {
    const z = s * ARM_Z
    section(
      [
        [ARM_AFT, 0.7, 0.4, 0.7 - ARM_H],
        [ARM_AFT + 0.25, ARM_H, ARM_W],
        [3.3, ARM_H, ARM_W],
      ],
      m.hull,
      [0, 0, z]
    )
    // The brace that closes the V: from the arm's aft end in to the core,
    // its back where it always was and its underside carried down to the
    // bed, so nothing of it hangs between the arm and the core.
    const from = new Vector3(ARM_AFT + 0.35, 0, z)
    const to = new Vector3(CORE_AFT + 0.6, 0, s * 0.35)
    const run = to.clone().sub(from)
    const length = run.length()
    const mid = from.clone().add(to).multiplyScalar(0.5).toArray() as Vec3
    const deep = (0.66 - KEEL + 0.02) / 2
    const lift = 0.66 - deep
    const brace = section(
      [
        [-length / 2, deep, 0.38, lift],
        [length / 2, deep, 0.38, lift],
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
      slab([4.9, 0.13, 0.28], [0.5, 0.66, edge], m.pale, [t * (Math.PI / 4), 0, 0])
      slab([4.9, 0.12, 0.24], [0.5, -0.66, edge], m.pale, [-t * (Math.PI / 4), 0, 0])
    }
    // A rib standing proud between the flank mounts, where the loads come in.
    const face = z + s * (ARM_W + 0.04)
    box([0.2, 0.9, 0.1], [0.3, 0, face], m.steel)
    for (const y of [-0.3, 0, 0.3]) box([0.24, 0.06, 0.06], [0.3, y, face + s * 0.06], m.dark)
    // The arm's tip: a nacelle front, tapering to the intake on top and at
    // the sides. The taper is the intake's own wall, so the mouth starts where
    // it ends: a pale lip, a dark lining, a recessed back face and vanes
    // running into it. Thrusters outboard and a nav light, red to port, the
    // fuel teal to starboard.
    {
      const tip = (x: number, h: number, w: number, lift: number) => [x, h, w, lift] as const
      const back = tip(3.3, ARM_H, ARM_W, 0)
      // Flat underneath, so it stands on the bed with the arm.
      const front = tip(3.8, 0.64, 0.38, 0.64 - ARM_H)
      const mouth = { h: 0.3, w: 0.24, y: (0.64 - ARM_H) / 2 }
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
    const cant: Vec3 = [-s * MANTIS_ARM_FIN.cant, 0, 0]
    const [root, lead] = MANTIS_ARM_FIN.points
    fin(MANTIS_ARM_FIN.points, MANTIS_ARM_FIN.thick, z, m.hull, cant)
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
   * the core: a short shroud with a pale lip and steel frames, the intakes
   * filling it (`engines.ts`), and turbopumps on its roof feeding forward
   * into the core.
   */
  function drive() {
    const g = new Group()
    g.name = 'stern_drive'
    g.position.y = onFloor(STERN_H)
    body.add(g)
    const H = STERN_H
    const W = STERN_W
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
        [CORE_AFT + 0.1, H + 0.025, W + 0.025],
        [CORE_AFT + 0.14, H + 0.025, W + 0.025],
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
    // The intakes, which hide the plate.
    intakes(put, m, g, plate, { x: aft, h: H - skin, w: W - skin })
    // Turbopumps on the shroud's roof, each feeding forward into the core.
    const roof = H + 0.02
    for (const z of [-0.42, 0.42]) {
      put(
        cylinderSolid(0.12, 0.12, 0.36, 20),
        m.dark,
        [aft + 0.28, roof + 0.13, z],
        [0, 0, Math.PI / 2],
        g
      )
      for (const dx of [-0.12, 0.12])
        put(
          torusSolid(0.125, 0.022, 6, 24),
          m.steel,
          [aft + 0.28 + dx, roof + 0.13, z],
          [0, Math.PI / 2, 0],
          g
        )
      // The pad it sits on, as long as the pump and as wide, so nothing of it hangs.
      box([0.44, roof + 0.05 - (H - 0.01), 0.26], [aft + 0.28, (roof + 0.05 + H - 0.01) / 2, z], m.steel, undefined, g)
      // Its feed laid on the roof, half sunk in it, so it does not hang.
      pipe([aft + 0.46, H + 0.01, z], [CORE_AFT + 0.45, H + 0.01, z], 0.035, m.copper, g)
    }
  }
}
