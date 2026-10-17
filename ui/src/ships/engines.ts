/**
 * The drive, which prints with the hull: the shroud filled with pairs of
 * raked intakes, an F-15's intake and its mirror above it, reaching a little
 * past the shroud's mouth.
 *
 * Everything is a side profile pulled across, or a loft between sections on
 * the floor's and the ceiling's 45s, so a face that looks down is at 45
 * degrees and the mirror prints as the box does; and nothing's lowest point
 * hangs in the air: each pair stands on a block that rests on the shroud's
 * floor or on the pair below, and the shroud's roof rests on the top pair.
 *
 * Each mouth leaves a `drive_nozzle_<i>` group, +Y aft, where the board
 * lights the exhaust.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  PlaneGeometry,
  Shape,
  Vector3,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { extrudeSolid, type Put } from './parts'
import { bake, describe, solidOf, type SolidSpec } from './solid'

type Mat = MeshStandardMaterial
type Ink = Record<'dark' | 'steel' | 'cyan' | 'hull', Mat> & Partial<Record<'copper', Mat>>
type P2 = [number, number]

/** The shroud's open end, in the drive's frame: its x, and its inside's half height and half width. */
export interface Mouth {
  x: number
  h: number
  w: number
}

/** How far the intakes' tips reach past the shroud's mouth. */
const REACH = 0.1
/** How far each side wall splays in at the face. */
const SPLAY = 0.15
/** The cooling channels up each wall: as many on every hull, sized to its box. */
const CHANNELS = 3
/** How far each channel's tooth is sunk into its wall. */
const SINK = 0.01
/** The middle divider's half thickness at the face and at its edge. */
const DIVIDER = [0.06, 0.035] as const

const area = (poly: P2[]) =>
  poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length]
    return s + p[0] * q[1] - q[0] * p[1]
  }, 0) / 2

/** A half-space: the points p with n . p <= d. */
interface Half {
  n: Vector3
  d: number
}

/**
 * The convex solid the half-spaces bound, as a mesh: its corners are where
 * three of the planes meet inside all the others, and each plane's face is
 * the corners on it, in order round it, facing out.
 */
function hullOf(halves: Half[]): BufferGeometry {
  const eps = 1e-7
  const corners: Vector3[] = []
  for (let i = 0; i < halves.length; i++)
    for (let j = i + 1; j < halves.length; j++)
      for (let k = j + 1; k < halves.length; k++) {
        const [a, b, c] = [halves[i], halves[j], halves[k]]
        const bc = b.n.clone().cross(c.n)
        const det = a.n.dot(bc)
        if (Math.abs(det) < 1e-9) continue
        const p = bc
          .multiplyScalar(a.d)
          .add(c.n.clone().cross(a.n).multiplyScalar(b.d))
          .add(a.n.clone().cross(b.n).multiplyScalar(c.d))
          .divideScalar(det)
        if (
          halves.every(h => h.n.dot(p) <= h.d + eps) &&
          !corners.some(q => q.distanceTo(p) < 1e-6)
        )
          corners.push(p)
      }
  const positions: number[] = []
  for (const { n, d } of halves) {
    const on = corners.filter(p => Math.abs(n.dot(p) - d) < 1e-6)
    if (on.length < 3) continue
    const mid = on.reduce((m, p) => m.add(p), new Vector3()).divideScalar(on.length)
    const u = on[0].clone().sub(mid).normalize()
    const v = n.clone().cross(u)
    const angle = (p: Vector3) => Math.atan2(p.clone().sub(mid).dot(v), p.clone().sub(mid).dot(u))
    on.sort((p, q) => angle(p) - angle(q))
    for (let i = 1; i + 1 < on.length; i++)
      positions.push(...on[0].toArray(), ...on[i].toArray(), ...on[i + 1].toArray())
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * The intakes, on a thrust plate at `plate` (+X forward) in the shroud whose
 * mouth is `mouth`. Per box (the lower; the upper is its mirror), in [d aft,
 * v up] from the block's back face and the pair's middle: a chin up at 45 to
 * the bottom lip, a mouth raked back to the splitter's tip, and a ramp at 45
 * under the splitter. Two frames step back into the mouth, the side walls
 * splay in to the glowing face and a divider stands down the middle, all
 * three toothed with cooling channels, and a vane carries the centre
 * channel across the face.
 */
export function intakes(put: Put, ink: Ink, drive: Object3D, plate: number, mouth: Mouth) {
  // Each pair is a group of its own (`intake_<n>`), which the print fuses on its own first.
  let parent: Object3D = drive
  const roof = mouth.h
  // Pairs stack from the floor to the roof, which they hold up, side by side across.
  const half = (mouth.h + roof - 0.005) / 2
  // One column of pairs, stacked as the shroud's height allows.
  const cols = 1
  const rows = Math.max(1, Math.round(half / mouth.w))
  // The outer walls stand against the shroud's (a hair inside, so the two never share a plane).
  const gap = 0.004
  const cw = mouth.w / cols
  const hw = cw - gap / 2
  const H = half / rows
  const tw = 0.04
  const t = 0.025
  const k = tw * Math.SQRT2
  const c = 0.1 * H
  const D = 0.32 * H
  // The block runs from the plate to where the mouth starts; it stays on the
  // shroud's floor, so the tips reach REACH past the mouth.
  const base = Math.max(0, Math.min(plate - mouth.x, plate - mouth.x + REACH - D))
  const face = plate - base
  const inner = hw - tw
  const ramp = (d: number) => -(D + t) + d
  const bottom: P2 = [c, -H + c]
  const FRAMES = 2
  // How far the inner frame's raked edge stands back from the mouth's.
  const SETBACK = 0.05 * FRAMES
  // A wall stands on each of the bore's cuts inside an outer box, as thick
  // as the outer walls, and what stands in the cavity stops on it.
  const CORNER = tw
  // Trim stands this far off the face it lies on, so the two never share a plane.
  const E = 0.002
  /** A point moved out along the normal n by `by`. */
  const off = ([d, v]: P2, [nd, nv]: P2, by = E): P2 => [d + nd * by, v + nv * by]
  // The shroud's bore is the hull's clipped section (`loft.ts`), its corners
  // cut at 45. The drive's shell (block, outer walls, roof and floor) is cut
  // on those cuts, so it fills the bore; a wall stands on each cut inside an
  // outer box, and everything inside the boxes stops on that wall.
  const chamfer = Math.min(mouth.h, mouth.w) * 0.35
  const bore: Half[] = [1, -1].flatMap(sy =>
    [1, -1].map(sz => ({
      n: new Vector3(0, sy, sz).normalize(),
      d: (mouth.h + mouth.w - chamfer) / Math.SQRT2,
    }))
  )
  /** The bore's cuts (moved in by `inset`) that points cross. */
  const crossed = (pts: Vector3[], inset = 0) =>
    bore.map(b => ({ n: b.n, d: b.d - inset })).filter(b => pts.some(p => b.n.dot(p) > b.d + 1e-6))
  const toSpec = ({ n, d }: Half) => ({
    normal: n.toArray(),
    at: n.clone().multiplyScalar(d).toArray(),
  })

  /** A side profile pulled across z0..z1, upside down if `flip`, d measured aft of `from`. */
  const across = (
    mat: Mat,
    prof: P2[],
    y: number,
    z0: number,
    z1: number,
    flip = false,
    from = face,
    inset = 0
  ) => {
    let pts = prof.map(([d, v]) => [from - d, y + (flip ? -v : v)] as P2)
    if (area(pts) < 0) pts = [...pts].reverse()
    const shape = new Shape()
    pts.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)))
    shape.closePath()
    const solid = extrudeSolid(shape, { depth: z1 - z0, bevelEnabled: false })
    const cut = crossed(
      pts.flatMap(([a, b]) => [new Vector3(a, b, z0), new Vector3(a, b, z1)]),
      inset
    )
    if (!cut.length) {
      put(solid, mat, [0, 0, z0], undefined, parent)
      return
    }
    // Cut by the bore: drawn from its faces, printed as the extrusion less the cuts.
    bake(solid, new Matrix4().makeTranslation(0, 0, z0))
    const geo = hullOf([...sides(pts), ...slab(z0, z1), ...cut])
    describe(geo, { kind: 'clipped', solid: solidOf(solid)!, planes: cut.map(toSpec) })
    solid.dispose()
    put(geo, mat, undefined, undefined, parent)
  }
  /**
   * The print's description of a straight prism through `ring` (points in
   * the drive's frame) running `length` along `w`: an extrusion square to
   * its own axis, so every face is flat, starting a hair behind the ring.
   */
  const prismSpec = (ring: Vector3[], w: Vector3, length: number): SolidSpec => {
    const u = new Vector3()
      .crossVectors(w, Math.abs(w.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0))
      .normalize()
    const v = new Vector3().crossVectors(w, u)
    const s = Math.min(...ring.map(p => p.dot(w)))
    let pts: P2[] = ring.map(p => [p.dot(u), p.dot(v)])
    if (area(pts) < 0) pts = [...pts].reverse()
    const shape = new Shape()
    pts.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)))
    shape.closePath()
    const geo = extrudeSolid(shape, { depth: length + 0.01, bevelEnabled: false })
    bake(geo, new Matrix4().makeBasis(u, v, w).setPosition(w.clone().multiplyScalar(s - 0.01)))
    const spec = solidOf(geo)!
    geo.dispose()
    return spec
  }
  /** The half-spaces bounding a convex polygon in xy (anticlockwise), pulled along z. */
  const sides = (pts: P2[]): Half[] =>
    pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]
      const n = new Vector3(q[1] - p[1], p[0] - q[0], 0).normalize()
      return { n, d: n.x * p[0] + n.y * p[1] }
    })
  const slab = (z0: number, z1: number): Half[] => [
    { n: new Vector3(0, 0, 1), d: z1 },
    { n: new Vector3(0, 0, -1), d: -z0 },
  ]
  // How deep the shroud runs past the glowing face (a hair short of its
  // mouth, so nothing ends on the shroud's own end).
  const mouthD = plate - mouth.x - base - 0.01
  /**
   * Where a box's raked mouth starts, in the lower box's frame: the chin's
   * lip, or, for a box at the drive's floor or roof (`outer`), the shroud's
   * mouth, the box's floor falling to it at 45 from the face so the shroud
   * rests on the drive all the way.
   */
  const lipOf = (outer: boolean): P2 => (outer ? [mouthD, -H] : bottom)
  /**
   * The pair's outline with its raked edge set back by `back`, its foot
   * lifted by `lift`; `low` and `high` say whether its lower and upper boxes
   * are at the drive's floor and roof.
   */
  const outline = (back: number, lift = 0, low = false, high = false): P2[] => {
    const at = (outer: boolean): P2 =>
      outer ? [mouthD - back, -H + lift] : [bottom[0] - back, bottom[1] - back + lift]
    const [b, u] = [at(low), at(high)]
    const tip: P2 = [D - back, ramp(D - back)]
    return [[0, -H + lift], b, tip, [tip[0], -tip[1]], [u[0], -u[1]], [0, H - lift]]
  }
  const glow = (y: number, z: number, w: number, h: number) =>
    put(
      describe(new PlaneGeometry(w, h), { kind: 'detail' }),
      ink.cyan,
      [face - 0.004, y, z],
      [0, -Math.PI / 2, 0],
      parent
    )

  let mark = 0
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const z = -mouth.w + cw * (2 * i + 1)
      const y = -mouth.h + H * (2 * j + 1)
      parent = new Group()
      parent.name = `intake_${i * rows + j}`
      drive.add(parent)
      const outerOf = (flip: boolean) => (flip ? j === rows - 1 : j === 0) && mouthD > c + 0.01
      const [low, high] = [outerOf(false), outerOf(true)]
      const shape = (back: number, lift = 0) => outline(back, lift, low, high)
      // The block the pair stands on.
      if (base > 0)
        across(
          ink.dark,
          [
            [0, -H],
            [base, -H],
            [base, H],
            [0, H],
          ],
          y,
          z - hw,
          z + hw,
          false,
          plate
        )
      // The outer walls, each with a steel seam where the block ends and a
      // steel lip on its raked edges, both a hair proud.
      const under: P2 = [Math.SQRT1_2, -Math.SQRT1_2]
      for (const side of [-1, 1]) {
        const z0 = side < 0 ? z - hw : z + hw - tw
        across(ink.dark, shape(0), y, z0, z0 + tw)
        for (const flip of [false, true]) {
          const lip = lipOf(outerOf(flip))
          const n = Math.hypot(D - lip[0], -t - lip[1])
          const out: P2 = [(-t - lip[1]) / n, -(D - lip[0]) / n]
          across(
            ink.steel,
            [off([0, -H], under), off([0.03, -H + 0.03], under), [0.03, 0], [0, 0]],
            y,
            z0 - 0.005,
            z0 + tw + 0.005,
            flip
          )
          across(
            ink.steel,
            [
              off(lip, out),
              off([D, -t], out),
              [D - 0.05 * out[0], -t - 0.05 * out[1]],
              [lip[0] - 0.05 * out[0], lip[1] - 0.05 * out[1]],
            ],
            y,
            z0 - 0.005,
            z0 + tw + 0.005,
            flip
          )
        }
      }
      // A wall on each of the bore's cuts the pair reaches, its edge on the mouth's rake.
      {
        const pts = shape(0).map(([d, v]): P2 => [face - d, y + v])
        const ccw = area(pts) < 0 ? [...pts].reverse() : pts
        const corners = ccw.flatMap(([a, b]) => [
          new Vector3(a, b, z - hw),
          new Vector3(a, b, z + hw),
        ])
        for (const cut of crossed(corners, CORNER)) {
          const shell = { n: cut.n, d: cut.d + CORNER }
          const back = { n: cut.n.clone().negate(), d: -cut.d }
          const shape = new Shape()
          ccw.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)))
          shape.closePath()
          const solid = extrudeSolid(shape, { depth: 2 * hw, bevelEnabled: false })
          bake(solid, new Matrix4().makeTranslation(0, 0, z - hw))
          const geo = hullOf([...sides(ccw), ...slab(z - hw, z + hw), shell, back])
          describe(geo, {
            kind: 'clipped',
            solid: solidOf(solid)!,
            planes: [shell, back].map(toSpec),
          })
          solid.dispose()
          put(geo, ink.dark, undefined, undefined, parent)
        }
      }
      // The splitter the two boxes share, its tip capped in steel.
      across(
        ink.dark,
        [
          [0, ramp(0)],
          [D, -t],
          [D, t],
          [0, -ramp(0)],
        ],
        y,
        z - inner,
        z + inner
      )
      across(
        ink.steel,
        // The splitter's own section moved aft a hair, so its faces stand off the splitter's.
        (
          [
            [D - 0.03, -t - 0.03],
            [D, -t],
            [D, t],
            [D - 0.03, t + 0.03],
          ] as P2[]
        ).map(([d, v]): P2 => [d + E, v]),
        y,
        z - hw - E,
        z + hw + E
      )
      // Jambs stepping back inside each wall (each spans both boxes), their
      // feet in the chins.
      for (let b = 1; b <= FRAMES; b++)
        for (const s of [-1, 1]) {
          const zj = s < 0 ? z - inner + (b - 1) * 0.03 : z + inner - b * 0.03
          across(
            b % 2 ? ink.steel : ink.dark,
            shape(0.05 * b, k / 2),
            y,
            zj,
            zj + 0.03,
            false,
            face,
            CORNER
          )
        }
      for (const flip of [false, true]) {
        const sign = flip ? -1 : 1
        // A box at the drive's floor or roof opens out to the shroud: its
        // floor falls at 45 from the face to the shroud's mouth, solid down to
        // the shroud, which so rests on the drive all the way (no bridge);
        // it has no lip and no frame sills on that side. Any other box has a
        // chin up at 45 from the block to its bottom lip, the lip in steel.
        const outer = outerOf(flip)
        const lip = lipOf(outer)
        // On the floor the fill ends a little short on an upright face: the
        // print grows a sharp corner there past the shroud's end, where it
        // would hang (under the roof it grows upward and does no harm).
        const short = flip ? 0 : 0.04
        if (outer)
          across(
            ink.dark,
            [
              [0, -H],
              [mouthD - short, -H],
              ...(short ? [[mouthD - short, -H + short] as P2] : []),
              [0, -H + mouthD],
            ],
            y,
            z - hw,
            z + hw,
            flip
          )
        else
          across(
            ink.dark,
            [[0, -H], bottom, [c, bottom[1] + k], [0, -H + k]],
            y,
            z - inner,
            z + inner,
            flip
          )
        if (!outer)
          across(
            ink.steel,
            // The chin's own section moved out a hair along its 45, so every
            // face stands off the chin's and stays at 45.
            (
              [
                [c - 0.04, bottom[1] - 0.04],
                bottom,
                [c, bottom[1] + k],
                [c - 0.04, bottom[1] - 0.04 + k],
              ] as P2[]
            ).map(([d, v]): P2 => [d + E, v - E]),
            y,
            z - hw - E,
            z + hw + E,
            flip
          )
        // A sill on the chin and a header under the ramp for each frame (no
        // sill on the drive's floor or roof, nor where the chin is shorter
        // than the frame is set back).
        for (let b = 1; b <= FRAMES; b++) {
          const [back, e] = [0.05 * b, 0.025 * b]
          const zIn = inner - b * 0.03
          const mat = b % 2 ? ink.steel : ink.dark
          if (!outer && c - back > 0.01)
            across(
              mat,
              [
                [0, -H + k],
                [c - back, bottom[1] - back + k],
                [c - back, bottom[1] - back + k + e],
                [0, -H + k + e],
              ],
              y,
              z - zIn,
              z + zIn,
              flip,
              face,
              CORNER
            )
          across(
            mat,
            [
              [0, ramp(0)],
              [D - back, ramp(D - back)],
              [D - back, ramp(D - back) - e],
              [0, ramp(0) - e],
            ],
            y,
            z - zIn,
            z + zIn,
            flip,
            face,
            CORNER
          )
        }
        // The block's face glows between the frames' sill and header.
        const wIn = inner - FRAMES * 0.03
        const g0 = outer ? -H + mouthD + 0.01 : -H + k + 0.025 * FRAMES + 0.01
        const g1 = ramp(0) - 0.025 * FRAMES - 0.01
        // Cooling channels up each side wall, which splays in to the face so
        // it looks aft (its face upright, its top and bottom on the ceiling's
        // and the floor's 45s), and up both sides of a divider down the
        // middle: triangular teeth, as many on every hull.
        // The cavity's floor: up at 45 on a chin, down at 45 on an outer box.
        const fall = outer ? -1 : 1
        const sill = (dd: number) => g0 - 0.01 + fall * dd
        const header = (dd: number) => g1 + 0.01 + dd
        const Y = (vv: number) => y + sign * vv
        // The inner frame's raked edge: at depth d the cavity's walls hold
        // only above vMin(d), so each wall is clipped to it, from where it
        // crosses the floor (kink) to where it meets the ceiling (shut).
        const lipBack: P2 = outer
          ? [lip[0] - SETBACK, lip[1]]
          : [lip[0] - SETBACK, lip[1] - SETBACK]
        const tipBack: P2 = [D - SETBACK, ramp(D - SETBACK)]
        const slope = (tipBack[1] - lipBack[1]) / (tipBack[0] - lipBack[0])
        const vMin = (dd: number) => lipBack[1] + (dd - lipBack[0]) * slope
        const shut = (header(0) - vMin(0)) / (slope - 1) - 0.005
        const kink = (sill(0) - vMin(0)) / (slope - fall)
        const depths = kink > 0.005 && kink < shut - 0.005 ? [0, kink, shut] : [0, shut]
        const T = (dd: number) => SPLAY * Math.max(0, 1 - dd / shut)
        // The teeth spread evenly up the wall, each a quarter of it wide, with
        // equal gaps between them and at both ends.
        const span = header(0) - sill(0)
        const pitch = span / (CHANNELS + 1)
        const gapV = (span - CHANNELS * pitch) / (CHANNELS + 1)
        const footOf = (q: number) => sill(0) + gapV + q * (pitch + gapV)
        const rib = 0.6 * pitch
        const spread = ((pitch / 2) * SINK) / rib
        // The inner frame's raked edge as a plane (it holds z), its normal aft
        // into the mouth: the walls, the divider and the teeth all end on it.
        const rakeAt = new Vector3(face - lipBack[0], Y(lipBack[1]), 0)
        const along = new Vector3(
          -(tipBack[0] - lipBack[0]),
          sign * (tipBack[1] - lipBack[1]),
          0
        ).normalize()
        const rakeN = new Vector3(along.y, -along.x, 0)
        if (rakeN.x > 0) rakeN.negate()
        /**
         * The teeth up a wall whose face is at zFace(d), standing off it
         * towards `into`, each running with the floor's 45 from the glowing
         * face to the inner frame's raked edge, cut on it.
         */
        const teeth = (zFace: (dd: number) => number, into: number) => {
          for (let q = 0; q < CHANNELS; q++) {
            const v0 = footOf(q)
            const ring = (dd: number) => [
              // Its base sunk into the wall (widened to meet it base to base
              // at the wall's face), so tooth and wall cross rather than
              // share a face.
              new Vector3(face - dd, Y(v0 - spread + dd), zFace(dd) - into * SINK),
              new Vector3(face - dd, Y(v0 + pitch + spread + dd), zFace(dd) - into * SINK),
              new Vector3(face - dd, Y(v0 + pitch / 2 + dd), zFace(dd) + into * rib),
            ]
            const start = ring(0)
            // Along the wall's own slope, which holds only as far as `shut`
            // (a side wall's splay is spent there).
            const w = ring(shut)[0].sub(start[0]).normalize()
            const reach = start.map(p => rakeAt.clone().sub(p).dot(rakeN) / w.dot(rakeN))
            if (Math.min(...reach) < 0.01) continue
            const end = start.map((p, i) => p.clone().addScaledVector(w, reach[i]))
            // Bounded by its three sides (each holding the axis), the face
            // it starts on, the rake and whatever of the bore it reaches.
            const mid = start[0].clone().add(start[1]).add(start[2]).divideScalar(3)
            const flanks = [0, 1, 2].map(i => {
              const [a, b] = [start[i], start[(i + 1) % 3]]
              const n = b.clone().sub(a).cross(w).normalize()
              if (n.dot(mid.clone().sub(a)) > 0) n.negate()
              return { n, d: n.dot(a) }
            })
            const rake: Half = { n: rakeN, d: rakeN.dot(rakeAt) }
            const cut = crossed([...start, ...end], CORNER)
            const geo = hullOf([...flanks, { n: new Vector3(1, 0, 0), d: face }, rake, ...cut])
            describe(geo, {
              kind: 'clipped',
              solid: prismSpec(start, w, Math.max(...reach) + 0.02),
              planes: [rake, ...cut].map(toSpec),
            })
            put(geo, ink.steel, undefined, undefined, parent)
          }
        }
        // The wall's side view: from the face to `shut`, between the floor
        // (or the inner frame's edge) and the ceiling.
        const band: P2[] = [
          ...depths.map((dd): P2 => [face - dd, Y(Math.max(sill(dd), vMin(dd)))]),
          // The ceiling is one straight line: its two ends only (a corner
          // between parallel edges would break the print's grow).
          ...[shut, 0].map((dd): P2 => [face - dd, Y(header(dd))]),
        ]
        /**
         * A wedge in that band whose sides run from z0(d) to z1(d), both
         * linear in d: drawn as a loft, printed as the band pulled across
         * and cut by the planes its sides lie on (every face flat).
         */
        const wedge = (z0: (dd: number) => number, z1: (dd: number) => number) => {
          // A side z = zs(d) as a plane, its normal away from the wedge (`out`, +1 or -1 in z).
          const plane = (zs: (dd: number) => number, out: number): Half => {
            const dz = (zs(shut) - zs(0)) / shut
            const n = new Vector3(out * dz, 0, out).normalize()
            return { n, d: n.dot(new Vector3(face, y, zs(0))) }
          }
          const lo = Math.min(z0(0), z0(shut), z1(0), z1(shut))
          const hi = Math.max(z0(0), z0(shut), z1(0), z1(shut))
          const [low, high] = z0(0) < z1(0) ? [z0, z1] : [z1, z0]
          const outline = area(band) < 0 ? [...band].reverse() : band
          const tilted = [plane(low, -1), plane(high, 1)].filter(({ n }) => Math.abs(n.x) > 1e-9)
          const cut = crossed(
            depths.flatMap(dd =>
              [Math.max(sill(dd), vMin(dd)), header(dd)].flatMap(v =>
                [z0(dd), z1(dd)].map(zz => new Vector3(face - dd, Y(v), zz))
              )
            ),
            CORNER
          )
          const geo = hullOf([...sides(outline), ...slab(lo, hi), ...tilted, ...cut])
          describe(geo, {
            kind: 'clipped',
            solid: {
              kind: 'extrude',
              outline,
              holes: [],
              depth: hi - lo,
              bevel: null,
              bake: new Matrix4().makeTranslation(0, 0, lo).toArray(),
            },
            planes: [...tilted, ...cut].map(toSpec),
          })
          put(geo, ink.dark, undefined, undefined, parent)
        }
        for (const side of [-1, 1]) {
          const zw = side < 0 ? z - wIn : z + wIn
          const into = -side
          const zf = (dd: number) => zw + into * T(dd)
          wedge(
            () => zw,
            dd => zf(dd) + into * 0.004
          )
          teeth(zf, into)
        }
        // The divider: a wedge, thick at the face and thin at its edge, so
        // both its sides look aft.
        const thick = (dd: number) => DIVIDER[0] + ((DIVIDER[1] - DIVIDER[0]) * dd) / shut
        wedge(
          dd => z - thick(dd),
          dd => z + thick(dd)
        )
        for (const side of [-1, 1]) teeth(dd => z + side * thick(dd), side)
        // The vane: the centre channel carried across the glowing face, from
        // the points where that channel meets it, its tip on the channel's
        // own tip line (up at 45 as it leaves the face). A quarter of its
        // width proud is as far as that tip may stand: further, and its upper
        // face, which the upper box's mirror turns under, falls below 45.
        const vane = footOf(Math.floor(CHANNELS / 2))
        const proud = pitch / 4
        across(
          ink.steel,
          [
            [0, vane],
            [proud, vane + pitch / 2 + proud],
            [0, vane + pitch],
          ],
          y,
          z - wIn + 0.005,
          z + wIn - 0.005,
          flip,
          face,
          CORNER
        )
        glow(y + (sign * (g0 + g1)) / 2, z, 2 * (wIn - SPLAY), g1 - g0)
        const g = new Group()
        g.name = `drive_nozzle_${mark++}`
        g.position.set(face - D, y + (sign * (g0 + g1)) / 2, z)
        g.scale.setScalar(0.05)
        g.rotation.z = Math.PI / 2
        parent.add(g)
      }
    }
}
