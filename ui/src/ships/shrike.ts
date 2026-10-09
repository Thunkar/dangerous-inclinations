/**
 * The shrike: a tall chassis that carries the flank mounts in one column,
 * plated as the corvette is, with a raked chin intake under a sunken bow and a
 * cockpit over it, a crest above, a swept blade below, and five de Laval bells
 * in a shroud at the stern. +X is the bow, +Y dorsal, port is -Z; the mounts
 * themselves are placed by `SHRIKE_MOUNTS` (hulls.ts).
 */
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
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
export type ShrikeInk = Record<'hull' | 'pale' | 'dark' | 'steel' | 'copper' | 'cyan' | 'red', Mat>

export function buildShrike(body: Group, put: Put, m: ShrikeInk) {
  const section = (s: Station[], mat: Mat, pos?: Vec3) => put(armoredSection(s), mat, pos)
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
    return mesh
  }
  /** A flat fin cut to a profile in (x, y), `thickness` deep, centred on `z`. */
  const fin = (points: [number, number][], thickness: number, z: number, mat: Mat, lift = 0) => {
    const shape = new Shape()
    shape.moveTo(...points[0])
    for (const point of points.slice(1)) shape.lineTo(...point)
    shape.closePath()
    const geo = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
    geo.translate(0, lift, z - thickness / 2)
    return put(geo, mat)
  }
  const hollow = (
    x0: number,
    x1: number,
    outer0: [number, number, number],
    outer1: [number, number, number],
    inner0: [number, number, number],
    inner1: [number, number, number],
    mat: Mat,
    parent: Object3D = body
  ) => put(hollowSection(x0, x1, outer0, outer1, inner0, inner1), mat, undefined, undefined, parent)
  /**
   * Shear a mesh so its faces rake: x moves forward by k for every unit below
   * y0, for the vertices at or ahead of `fromX` only (the rest stay put).
   */
  const rake = (mesh: Mesh, k: number, y0: number, fromX = -Infinity) => {
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++)
      if (position.getX(i) >= fromX)
        position.setX(i, position.getX(i) + k * (y0 - position.getY(i)))
    position.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  }

  // The chassis: one tall armoured block holding both flank mounts.
  section(
    [
      [-0.8, 1.62, 0.74],
      [-0.55, 1.75, 0.8],
      [1.1, 1.75, 0.8],
      [1.35, 1.62, 0.76],
    ],
    m.hull,
    [0, 0.6, 0]
  )
  // Plating as the corvette lays it: deck and keel tiles with seams, and
  // chine plates canted over the clipped edges above and below the mounts.
  for (const s of [-1, 1]) {
    slab([1.9, 0.14, 0.7], [0.3, 2.4, s * 0.37], m.hull)
    slab([1.9, 0.14, 0.7], [0.3, -1.2, s * 0.37], m.hull)
    slab([1.95, 0.17, 0.5], [0.3, 2.15, s * 0.72], m.pale, [s * 0.68, 0, 0])
    slab([1.95, 0.15, 0.42], [0.3, -0.95, s * 0.72], m.pale, [-s * 0.65, 0, 0])
  }
  // The nose, tapering to the bow mount as the corvette's does, and its shoulders.
  section(
    [
      [1.2, 0.9, 0.8],
      [1.65, 0.86, 0.76],
      [1.98, 0.76, 0.66],
    ],
    m.hull,
    [0, 1.45, 0]
  )
  for (const s of [-1, 1]) slab([0.75, 0.24, 0.32], [1.6, 2.2, s * 0.62], m.pale)

  // The chin intake: level on top, its underside climbing off the chassis
  // gently and then more steeply, and the mouth raked the other way, the lower
  // lip leading. The second slope is the mouth's own wall, so the grille
  // starts where the slope ends: a letterbox, lined dark, with horizontal
  // vanes running into it and a splitter down the middle.
  {
    const k = 0.55
    const top = 0.44
    const under: [number, number][] = [
      [1.2, -1.05],
      [2.3, -0.92],
      [2.8, -0.6],
    ]
    const bottom = under[2][1]
    const lift = (top + bottom) / 2
    const half = (top - bottom) / 2
    const lean = (y: number) => k * (top - y)
    const mouth: [number, number] = [0.3, 0.56]
    const front = under[2][0]
    const back = under[1][0]
    const section0: [number, number, number] = [
      (top - under[1][1]) / 2,
      0.74,
      (top + under[1][1]) / 2,
    ]
    const section1: [number, number, number] = [half, 0.7, lift]
    section(
      [
        [1.2, (top - under[0][1]) / 2, 0.8, (top + under[0][1]) / 2],
        [back, ...section0],
      ],
      m.hull
    )
    // The bore stands clear of the lining by a hair: faces laid on each other flicker.
    const bore = (grow: number): [number, number, number] => [
      mouth[0] + grow,
      mouth[1] + grow,
      lift,
    ]
    const lip: [number, number, number] = [half + 0.03, 0.73, lift]
    for (const part of [
      hollow(back, front, section0, section1, bore(0.02), bore(0.02), m.hull),
      hollow(front, front + 0.06, lip, lip, bore(0.02), bore(0.02), m.pale),
      hollow(back + 0.02, front + 0.065, bore(0), bore(0), bore(-0.03), bore(-0.03), m.dark),
    ])
      rake(part, k, top, back + 0.1)
    section(
      [
        [back + 0.01, mouth[0], mouth[1], lift],
        [back + 0.04, mouth[0], mouth[1], lift],
      ],
      m.dark
    )
    const mouthAt = (y: number) => front + lean(y)
    for (let i = -2; i <= 2; i++) {
      const y = lift + i * 0.1
      const length = mouthAt(y) - 0.02 - (back + 0.04)
      box([length, 0.02, 1.08], [back + 0.04 + length / 2, y, 0], m.steel)
    }
    const [yt, yb] = [lift + mouth[0] - 0.02, lift - mouth[0] + 0.02]
    fin(
      [
        [back + 0.04, yt],
        [mouthAt(yt) - 0.02, yt],
        [mouthAt(yb) - 0.02, yb],
        [back + 0.04, yb],
      ],
      0.035,
      0,
      m.steel
    )
    // Panel lines down the flanks, level with the mouth.
    for (const s of [-1, 1])
      for (const y of [-0.36, 0.02]) box([1.4, 0.035, 0.03], [1.85, y, s * 0.78], m.pale)
  }

  // The cockpit pod, high and set back: it ends over the bow module.
  section(
    [
      [-0.55, 0.2, 0.48],
      [-0.1, 0.4, 0.64],
      [1.35, 0.36, 0.6],
      [2.05, 0.1, 0.32, -0.12],
    ],
    m.hull,
    [0, 2.72, 0]
  )
  section(
    [
      [0.5, 0.05, 0.46],
      [0.8, 0.22, 0.5],
      [1.55, 0.16, 0.4],
      [1.95, 0.04, 0.22],
    ],
    m.dark,
    [0, 2.98, 0]
  )
  for (const z of [-0.2, 0, 0.2]) box([0.36, 0.05, 0.11], [1.3, 3.15, z], m.cyan, [0, 0, -0.3])

  // The fins: rooted along the hull no further aft than the side modules,
  // both edges swept aft from there and cut square at the end, each with a
  // pale band down its leading edge. The band stands a hair proud of the
  // edge, so its face is not laid on the fin's own.
  const sweptFin = (
    root: [number, number],
    lead: [number, number],
    end: [number, number],
    trail: [number, number],
    thickness: number,
    foot: [number, number][] = [],
    crank: [number, number][] = []
  ) => {
    fin([root, lead, end, ...crank, trail, ...foot], thickness, 0, m.hull)
    const [ex, ey] = [lead[0] - root[0], lead[1] - root[1]]
    const l = Math.hypot(ex, ey)
    let [px, py] = [-ey / l, ex / l]
    if (px * (trail[0] - root[0]) + py * (trail[1] - root[1]) > 0) [px, py] = [-px, -py]
    const proud = (p: [number, number]): [number, number] => [p[0] + px * 0.02, p[1] + py * 0.02]
    const band = 0.34
    fin(
      [proud(root), proud(lead), [lead[0] - band, lead[1]], [root[0] - band * 1.5, root[1]]],
      thickness + 0.05,
      0,
      m.pale
    )
  }
  // The crest, off the cockpit's back, flat on top; its foot runs down the
  // cockpit's tail onto the chassis deck.
  sweptFin([1.4, 3.05], [-0.25, 4.35], [-1.45, 4.35], [-0.7, 2.42], 0.2, [[0.3, 2.42]])
  box([0.1, 0.08, 0.1], [-1.3, 4.39, 0], m.red)
  pipe([-1.43, 4.35, 0], [-2.2, 4.75, 0], 0.018, m.steel)
  // The blade, the bigger: from under the chin to a flat bottom below the
  // column, its trailing edge cranked.
  const root: [number, number] = [2.05, -0.76]
  const lead: [number, number] = [-0.35, -4.85]
  sweptFin(root, lead, [-2.0, -4.85], [-0.7, -1.0], 0.5, [], [[-0.95, -2.9]])
  // The ladder down its leading edge.
  const [dx, dy] = [lead[0] - root[0], lead[1] - root[1]]
  const len = Math.hypot(dx, dy)
  const [nx, ny] = [-dy / len, dx / len]
  const off = (u: number, d: number): [number, number] => [
    root[0] + dx * u + nx * d,
    root[1] + dy * u + ny * d,
  ]
  for (const z of [-0.18, 0.18])
    pipe([...off(0.03, 0.26), z], [...off(0.97, 0.26), z], 0.045, m.steel)
  for (let u = 0.08; u < 0.97; u += 0.11) {
    pipe([...off(u, 0.26), -0.22], [...off(u, 0.26), 0.22], 0.03, m.steel)
    pipe([...off(u, 0.26), 0], [...off(u, 0), 0], 0.03, m.copper)
  }
  for (const z of [-0.1, 0.1]) pipe([-1.98, -4.85, z], [-3.05, -5.3, z], 0.02, m.steel)

  stern(body, put, m, { slab, box, pipe, fin, hollow })
}

/**
 * The stern: a block standing proud of the chassis as the corvette's drive
 * stands proud of its hull, a busy thrust plate, five bells (a big one in the
 * middle, one in each corner) and a shroud that covers the corner bells,
 * its flanks carried on aft on the same line beside the centre bell.
 */
function stern(
  body: Group,
  put: Put,
  m: ShrikeInk,
  {
    slab,
    box,
    pipe,
    fin,
    hollow,
  }: {
    slab: (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent?: Object3D) => Mesh
    box: (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent?: Object3D) => Mesh
    pipe: (from: Vec3, to: Vec3, r: number, mat: Mat, parent?: Object3D) => Mesh
    fin: (points: [number, number][], thickness: number, z: number, mat: Mat, lift?: number) => Mesh
    hollow: (
      x0: number,
      x1: number,
      outer0: [number, number, number],
      outer1: [number, number, number],
      inner0: [number, number, number],
      inner1: [number, number, number],
      mat: Mat,
      parent?: Object3D
    ) => Mesh
  }
) {
  const g = new Group()
  g.name = 'stern_drive'
  g.position.set(0, 0.6, 0)
  body.add(g)
  const at = (geo: BufferGeometry, mat: Mat, pos?: Vec3, rot?: Vec3, parent: Object3D = g) =>
    put(geo, mat, pos, rot, parent)
  const H = 1.76
  const W = 0.96
  const skin = 0.12
  const fore = -1.1
  const aft = -1.75
  const tube = (x0: number, x1: number, h: number, w: number, bore: number, mat: Mat) =>
    hollow(x0, x1, [h, w, 0], [h, w, 0], [H - bore, W - bore, 0], [H - bore, W - bore, 0], mat, g)

  at(
    armoredSection([
      [-1.12, H, W],
      [-0.9, H, W],
      [-0.7, 1.72, 0.8],
    ]),
    m.hull
  )
  for (const s of [-1, 1]) {
    slab([0.2, 0.1, 0.5], [-1.01, s * (H + 0.04), 0], m.pale, undefined, g)
    for (const x of [-0.98, -1.05])
      box([0.05, 0.9, 0.03], [x, 0, s * (W + 0.012)], m.dark, undefined, g)
  }
  at(
    armoredSection([
      [-0.94, H + 0.025, W + 0.025],
      [-0.9, H + 0.025, W + 0.025],
    ]),
    m.dark
  )
  // The thrust plate, set into the end of the block: bare metal, so the
  // bells read against it rather than against a black hole.
  at(
    armoredSection([
      [-1.18, H - skin - 0.01, W - skin - 0.01],
      [-1.08, H - skin - 0.01, W - skin - 0.01],
    ]),
    m.steel
  )
  // The shroud. Its bands' bores stand clear of the wall's by a hair, and the
  // cheeks start where the band ends, so no two faces share a plane.
  tube(aft, fore, H, W, skin, m.hull)
  tube(aft - 0.02, aft + 0.14, H + 0.02, W + 0.02, skin - 0.015, m.pale)
  tube(fore - 0.1, fore + 0.02, H + 0.04, W + 0.04, skin - 0.015, m.steel)
  const end = -2.34
  const flat = H - Math.min(H, W) * 0.35
  for (const s of [-1, 1]) {
    const z = s * (W - skin / 2)
    fin(
      [
        [aft - 0.02, flat],
        [end, 0.62],
        [end, -0.62],
        [aft - 0.02, -flat],
      ],
      skin,
      z,
      m.hull,
      0.6
    )
    fin(
      [
        [end + 0.12, 0.66],
        [end - 0.012, 0.632],
        [end - 0.012, -0.632],
        [end + 0.12, -0.66],
      ],
      skin + 0.02,
      z,
      m.pale,
      0.6
    )
  }
  // The plate's furniture: panel seams between the bells, bolts round its edge.
  for (const y of [-0.54, 0.54])
    box([0.02, 0.03, (W - skin) * 2 - 0.1], [-1.19, y, 0], m.dark, undefined, g)
  for (const z of [-0.6, 0.6]) box([0.02, 0.9, 0.03], [-1.19, 0, z], m.dark, undefined, g)
  const bolt = (y: number, z: number) =>
    at(new CylinderGeometry(0.035, 0.035, 0.03, 6), m.dark, [-1.195, y, z], [0, 0, Math.PI / 2])
  for (let i = -4; i <= 4; i++)
    for (const s of [-1, 1]) bolt(s * (H - skin - 0.09), (i * (W - skin - 0.1)) / 4.4)
  for (let i = -7; i <= 7; i++)
    for (const s of [-1, 1]) bolt((i * (H - skin - 0.1)) / 7.6, s * (W - skin - 0.09))
  // One turbopump on each flank, feeding forward into the block, and one
  // conduit carried aft along the shroud below it.
  for (const s of [-1, 1]) {
    const zc = s * (W + 0.2)
    at(new CylinderGeometry(0.16, 0.16, 0.5, 20), m.dark, [-1.32, 0.95, zc], [0, 0, Math.PI / 2])
    for (const dx of [-0.17, 0.17])
      at(
        new TorusGeometry(0.165, 0.028, 6, 24),
        m.steel,
        [-1.32 + dx, 0.95, zc],
        [0, Math.PI / 2, 0]
      )
    box([0.3, 0.28, 0.08], [-1.32, 0.95, s * (W + 0.04)], m.steel, undefined, g)
    pipe([-1.07, 0.95, zc], [-0.98, 0.95, zc], 0.05, m.copper, g)
    pipe([-0.98, 0.95, zc], [-0.98, 0.95, s * (W + 0.01)], 0.05, m.copper, g)
    pipe([-0.92, -0.6, s * (W + 0.07)], [aft + 0.2, -0.6, s * (W + 0.07)], 0.05, m.copper, g)
    box([0.14, 0.16, 0.14], [aft + 0.2, -0.6, s * (W + 0.06)], m.steel, undefined, g)
  }
  // Five bells: a big one in the middle, a smaller one in each corner.
  delavalBells(put, m, g, -1.19, [
    [0, 0, 0.95],
    [1.08, -0.5, 0.5],
    [1.08, 0.5, 0.5],
    [-1.08, -0.5, 0.5],
    [-1.08, 0.5, 0.5],
  ])
}
