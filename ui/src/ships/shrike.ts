/**
 * The shrike: a tall chassis that carries the flank mounts in one column,
 * plated as the corvette is, with a raked chin intake under a sunken bow and a
 * cockpit over it, a crest above, a swept blade below, and the intakes in a
 * shroud at the stern. +X is the bow, +Y dorsal, port is -Z; the mounts
 * themselves are placed by `SHRIKE_MOUNTS` (hulls.ts).
 */
import {
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Vector3,
} from 'three'
import { armoredSection, hollowSection, sectionLoft, type Station } from './loft'
import { boxSolid, cylinderSolid, extrudeSolid, torusSolid, type Put } from './parts'
import { hullOf, intakes, type Half } from './engines'
import { bake, describe, solidOf, type SolidSpec } from './solid'
import type { Vec3 } from './config'

type Mat = MeshStandardMaterial
export type ShrikeInk = Record<'hull' | 'pale' | 'dark' | 'steel' | 'copper' | 'cyan' | 'red', Mat>

/**
 * The blade's flat bottom (y, and x aft and fore), its thickness, and how far
 * aft of its leading edge the pale band runs: what a display stand grips.
 */
/** The keel plates' undersides, the bed the hull prints on (`HULL_INFO.shrike.keel`). */
const SHRIKE_KEEL = -1.27

export const SHRIKE_BLADE = { bottom: -4.85, aft: -2.0, fore: -0.35, thick: 0.5, band: 0.34 }

/** The half-spaces of a convex polygon in [y, z], each side's plane running along X. */
function sidesOf(poly: [number, number][]): Half[] {
  const area = poly.reduce((t, [a, b], i) => {
    const [c, d] = poly[(i + 1) % poly.length]
    return t + a * d - c * b
  }, 0)
  const pts = area < 0 ? [...poly].reverse() : poly
  return pts.map(([y, z], i) => {
    const [y2, z2] = pts[(i + 1) % pts.length]
    const n = new Vector3(0, z2 - z, -(y2 - y)).normalize()
    return { n, d: n.y * y + n.z * z }
  })
}

/** A plane of a half-space as the print takes it. */
const toPlane = ({ n, d }: Half) => ({ normal: n.toArray(), at: n.clone().multiplyScalar(d).toArray() })

/** The print's description of a prism through `ring` ([y, z]) from x0 to x1: an extrusion along X. */
function prismAlongX(ring: [number, number][], x0: number, x1: number): SolidSpec {
  const area = ring.reduce((t, [a, b], i) => {
    const [c, d] = ring[(i + 1) % ring.length]
    return t + a * d - c * b
  }, 0)
  const shape = new Shape()
  ;(area < 0 ? [...ring].reverse() : ring).forEach(([y, z], i) => (i ? shape.lineTo(y, z) : shape.moveTo(y, z)))
  shape.closePath()
  const geo = extrudeSolid(shape, { depth: x1 - x0, bevelEnabled: false })
  // The shape's x and y are the ship's Y and Z and its depth the ship's X: a rotation.
  bake(
    geo,
    new Matrix4()
      .makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0))
      .setPosition(x0, 0, 0)
  )
  const spec = solidOf(geo)!
  geo.dispose()
  return spec
}

export function buildShrike(body: Group, put: Put, m: ShrikeInk) {
  const section = (s: Station[], mat: Mat, pos?: Vec3) => put(armoredSection(s), mat, pos)
  const slab = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(boxSolid(size, Math.min(0.018, ...size.map(n => n / 3))), mat, pos, rot, parent)
  const box = (size: Vec3, pos: Vec3, mat: Mat, rot?: Vec3, parent: Object3D = body) =>
    put(boxSolid(size), mat, pos, rot, parent)
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
    return mesh
  }
  /** A flat fin cut to a profile in (x, y), `thickness` deep, centred on `z`. */
  const fin = (points: [number, number][], thickness: number, z: number, mat: Mat, lift = 0) => {
    const shape = new Shape()
    shape.moveTo(...points[0])
    for (const point of points.slice(1)) shape.lineTo(...point)
    shape.closePath()
    const geo = extrudeSolid(shape, { depth: thickness, bevelEnabled: false })
    bake(geo, new Matrix4().makeTranslation(0, lift, z - thickness / 2))
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
  // The chines lie at the chamfers' own 45 degrees: the ship prints belly
  // down, and so nothing over them faces down.
  for (const s of [-1, 1]) {
    slab([1.9, 0.14, 0.7], [0.3, 2.4, s * 0.37], m.hull)
    slab([1.9, 0.14, 0.7], [0.3, -1.2, s * 0.37], m.hull)
    slab([1.95, 0.17, 0.5], [0.3, 2.15, s * 0.72], m.pale, [s * (Math.PI / 4), 0, 0])
    slab([1.95, 0.15, 0.42], [0.3, -0.95, s * 0.72], m.pale, [-s * (Math.PI / 4), 0, 0])
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
  // Under the bow collar's upper plate, where it reaches back over the nose
  // wider than the nose is, a flare from the nose's flank out to the plate's
  // edge at 45 degrees, as the chin's under the lower plate (the collar's web
  // takes over from x 1.8, the bow mount's at 2.0 less 0.2).
  for (const side of [-1, 1]) {
    const under = 1.45 + 0.67 - 0.01
    put(
      sectionLoft(
        (
          [
            [1.36, 0.8],
            [1.85, 1.04],
          ] as const
        ).map(([x, w]) => ({
          x,
          ring: [
            [under, side * 0.6],
            [under, side * (w - 0.01)],
            [under - (w - 0.01 - 0.75), side * 0.75],
          ],
        }))
      ),
      m.hull
    )
  }

  // The chin intake: a keel standing on the bed the hull prints on, its
  // flanks flaring out at 45 degrees to the bow collar's lower plate above
  // it, and its face raked, the keel leading. The whole face is the grille:
  // a pale lip round a recess with louvres at 45 degrees across it, and the
  // recess's roof at 45 degrees too, so nothing in it hangs.
  {
    const top = 0.52
    const floor = SHRIKE_KEEL - 0.02
    // The keel's half width, and the flare's at the top: the collar plate's.
    const keel = 0.3
    const flare = 1.04
    const knee = top - (flare - keel)
    const [aft, front, k] = [1.2, 2.8, 0.34]
    const lip = 0.05
    const depth = 0.2
    // The louvres' teeth: how far each stands off the grille's back (half its base).
    const tooth = 0.08
    const half = (x: number, y: number, z: number, d: number): Half => {
      const n = new Vector3(x, y, z)
      const l = n.length()
      return { n: n.divideScalar(l), d: d / l }
    }
    // The face (x = front + k (top - y)) and the grille's back, `back` behind it.
    const face = (back: number) => half(1, k, 0, front + k * top - back)
    const behind = (back: number) => half(-1, -k, 0, -(front + k * top - back))
    const span = half(-1, 0, 0, -aft)
    // The section is not convex (a keel under a flare), so it is drawn as
    // two convex parts, the keel's and the flare's, and so is the recess
    // inside the lip (it stands `lip` off the bed and in from every side).
    const kneeIn = knee + lip * Math.SQRT2 - lip
    const flareIn = flare - lip - lip * Math.SQRT2
    const outer: [number, number][] = [
      [floor, -keel],
      [knee, -keel],
      [top, -flare],
      [top, flare],
      [knee, keel],
      [floor, keel],
    ]
    const inner: [number, number][] = [
      [SHRIKE_KEEL + lip, -(keel - lip)],
      [kneeIn, -(keel - lip)],
      [top - lip, -flareIn],
      [top - lip, flareIn],
      [kneeIn, keel - lip],
      [SHRIKE_KEEL + lip, keel - lip],
    ]
    // Each ring's keel (corners 0, 1, 4, 5) and flare (1, 2, 3, 4).
    const parts = (r: [number, number][]) => [
      sidesOf([r[0], r[1], r[4], r[5]]),
      sidesOf([r[1], r[2], r[3], r[4]]),
    ]
    // The prisms the print cuts each piece from: the keel's (to the top) and the flare's.
    const reach = front + k * (top - floor) + 0.02
    const prismRings: [number, number][][] = [
      [outer[0], [top, -keel], [top, keel], outer[5]],
      outer.slice(1, 5),
    ]
    const [prism, flarePrism] = prismRings.map(r => ({
      spec: prismAlongX(r, aft - 0.01, reach),
      sides: sidesOf(r),
    }))
    type Prism = typeof prism
    /**
     * One convex piece: the half-spaces bound it, and the print cuts the
     * prism it lies in by those that are not the prism's own sides (a cut on
     * a face it already has would be a coplanar boolean).
     */
    // The flare's upper front corners, chamfered square to the bed along the
    // bow collar's lower plate as it narrows to the nose (1.04 at the bow
    // mount, x 2.0, to 0.78 at its tip 0.615 ahead), so the chin's flanks
    // run on flush with the plate's edges; `t` moves the plane in.
    const narrows = (1.04 - 0.78) / 0.615
    const chamfer = (s: number, t: number) =>
      half(narrows, 0, s, 1.04 + narrows * 2.0 - t * Math.hypot(narrows, 1))
    const chamfers = (t: number) => [chamfer(-1, t), chamfer(1, t)]
    // And the back corners, along the plate as it narrows aft (1.04 at 0.2
    // behind the bow mount to 0.8 at 0.64 behind it).
    const widens = (1.04 - 0.8) / (0.64 - 0.2)
    const backs = [-1, 1].map(s => half(-widens, 0, s, 1.04 - widens * 1.8))
    const cut = (own: Half[], halves: Half[], from: Prism, mat: Mat) => {
      if (from === flarePrism) halves = [...halves, ...chamfers(0), ...backs]
      const geo = hullOf([...own, span, ...halves])
      if (geo.getAttribute('position').count < 9) return
      const planes = [...own, ...halves].filter(
        h => !from.sides.some(f => f.n.distanceTo(h.n) < 1e-6 && Math.abs(f.d - h.d) < 1e-6)
      )
      describe(geo, { kind: 'clipped', solid: from.spec, planes: planes.map(toPlane) })
      put(geo, mat)
    }
    const [keelOut, flareOut] = parts(outer)
    const insides = parts(inner)
    const pieces = (halves: Half[], mat: Mat) =>
      insides.forEach((inside, i) =>
        cut(inside, i ? [...halves, ...chamfers(lip)] : halves, i ? flarePrism : prism, mat)
      )
    // The body, to the grille's back.
    cut(keelOut, [face(depth)], prism, m.hull)
    cut(flareOut, [face(depth)], flarePrism, m.hull)
    // The lip: a strip along each outer edge, between it and the recess's
    // edge, from the grille's back to the face.
    outer.forEach((o, i) => {
      const j = (i + 1) % outer.length
      const strip = sidesOf([o, outer[j], inner[j], inner[i]])
      cut(strip, [face(0), behind(depth + 0.01)], i >= 1 && i <= 3 ? flarePrism : prism, m.pale)
    })
    // And along each chamfer.
    for (const c of chamfers(lip))
      cut(flareOut, [face(0), behind(depth + 0.01), { n: c.n.clone().negate(), d: -c.d }], flarePrism, m.pale)
    // The recess's roof: above a 45-degree line from the lip's top edge on
    // the face down to the grille's back.
    const roofAt = top - lip - (front + k * lip)
    pieces([face(0.002), behind(depth + 0.01), half(1, -1, 0, -roofAt)], m.pale)
    // The louvres: triangular teeth standing on the grille's back, base to
    // base up the whole recess, both faces at 45 degrees, so each prints as
    // a solid ridge rather than a slat too thin to keep.
    for (let yc = SHRIKE_KEEL + lip + tooth; yc < top - lip; yc += 2 * tooth) {
      const tip = front + k * (top - yc) - depth + tooth
      pieces(
        // Behind the tip: above its lower face (rising to it) and below its upper one.
        [behind(depth + 0.01), half(1, -1, 0, tip - yc), half(1, 1, 0, yc + tip)],
        m.steel
      )
    }
    // The flare under the bow collar's upper plate is the nose's (below);
    // panel lines along the keel and the flare, set on edge so they have no
    // underside.
    for (const s of [-1, 1]) {
      box([1.2, 0.035, 0.035], [1.8, -0.7, s * keel], m.pale, [Math.PI / 4, 0, 0])
      box([1.2, 0.035, 0.035], [1.8, 0.1, s * (keel + 0.1 - knee)], m.pale, [Math.PI / 4, 0, 0])
    }
  }

  // The cockpit pod, high and set back, sitting on the chassis and the nose:
  // it ends over the bow module.
  section(
    [
      [-0.55, 0.2, 0.48],
      [-0.1, 0.4, 0.64],
      [1.35, 0.36, 0.6],
      // Its nose rests on the bow collar's upper plate.
      [2.05, 0.1, 0.32, -0.18],
    ],
    m.hull,
    [0, 2.67, 0]
  )
  section(
    [
      [0.5, 0.05, 0.46],
      [0.8, 0.22, 0.5],
      [1.55, 0.16, 0.4],
      // Sunk into the pod as it narrows, so the canopy has nothing under it in the air.
      [1.95, 0.04, 0.22, -0.25],
    ],
    m.dark,
    [0, 2.93, 0]
  )
  for (const z of [-0.2, 0, 0.2]) box([0.36, 0.05, 0.11], [1.3, 3.1, z], m.cyan, [0, 0, -0.3])

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
    const band = SHRIKE_BLADE.band
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
  // The blade, the bigger: from under the chin to a flat bottom below the
  // column, its trailing edge cranked.
  const { bottom, aft, fore, thick } = SHRIKE_BLADE
  const root: [number, number] = [2.05, -0.76]
  const lead: [number, number] = [fore, bottom]
  sweptFin(root, lead, [aft, bottom], [-0.7, -1.0], thick, [], [[-0.95, -2.9]])

  stern(body, put, m, { slab, box, pipe, fin, hollow })
}

/**
 * The stern: a block standing proud of the chassis as the corvette's drive
 * stands proud of its hull, a shroud carrying its section on aft, and the
 * intakes filling it (`engines.ts`).
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
  // Its floor lies on the keel plane the hull prints on (the keel plates'
  // undersides), its top where it was.
  g.position.set(0, 0.6 - 0.055, 0)
  body.add(g)
  const at = (geo: BufferGeometry, mat: Mat, pos?: Vec3, rot?: Vec3, parent: Object3D = g) =>
    put(geo, mat, pos, rot, parent)
  const H = 1.815
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
      // Flat underneath as it narrows into the chassis: it stands on the bed.
      [-0.7, 1.72, 0.8, 1.72 - H],
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
  // The thrust plate, set into the end of the block, the intakes standing on it.
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
      // Its edges run on along the cheek's, so its foot has no underside.
      [
        [end + 0.12, 0.632 + (0.132 * (flat - 0.62)) / (end - aft + 0.02) * -1],
        [end - 0.012, 0.632],
        [end - 0.012, -0.632],
        [end + 0.12, -0.632 - (0.132 * (flat - 0.62)) / (end - aft + 0.02) * -1],
      ],
      skin + 0.02,
      z,
      m.pale,
      0.6
    )
  }
  // One turbopump on each flank, feeding forward into the block, and one
  // conduit carried aft along the shroud below it.
  for (const s of [-1, 1]) {
    const zc = s * (W + 0.2)
    at(cylinderSolid(0.16, 0.16, 0.5, 20), m.dark, [-1.32, 0.95, zc], [0, 0, Math.PI / 2])
    for (const dx of [-0.17, 0.17])
      at(torusSolid(0.165, 0.028, 6, 24), m.steel, [-1.32 + dx, 0.95, zc], [0, Math.PI / 2, 0])
    box([0.3, 0.28, 0.08], [-1.32, 0.95, s * (W + 0.04)], m.steel, undefined, g)
    // A bracket under it from the flank, its underside at 45 degrees, so the
    // pump is not hung in the air.
    at(
      sectionLoft(
        [-1.47, -1.17].map(x => ({
          x,
          ring: [
            [0.95 + 0.1, s * (W - 0.01)],
            [0.95 + 0.1, s * (W + 0.5)],
            [0.95 - 0.4, s * (W - 0.01)],
          ] as [number, number][],
        }))
      ),
      m.steel
    )
    pipe([-1.07, 0.95, zc], [-0.98, 0.95, zc], 0.05, m.copper, g)
    pipe([-0.98, 0.95, zc], [-0.98, 0.95, s * (W + 0.01)], 0.05, m.copper, g)
    pipe([-0.92, -0.6, s * (W + 0.07)], [aft + 0.2, -0.6, s * (W + 0.07)], 0.05, m.copper, g)
    box([0.14, 0.16, 0.14], [aft + 0.2, -0.6, s * (W + 0.06)], m.steel, undefined, g)
  }
  // The intakes, which hide the plate.
  intakes(put, m, g, -1.19, { x: aft, h: H - skin, w: W - skin })
}
