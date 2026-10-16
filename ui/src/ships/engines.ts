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
import { sectionLoft } from './loft'
import { cylinderSolid, extrudeSolid, type Put } from './parts'
import { bake, describe, solidOf, type SolidSpec } from './solid'

type Mat = MeshStandardMaterial
type Ink = Record<'dark' | 'steel' | 'cyan', Mat> & Partial<Record<'copper', Mat>>
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

/**
 * The intakes, on a thrust plate at `plate` (+X forward) in the shroud whose
 * mouth is `mouth`. Per box (the lower; the upper is its mirror), in [d aft,
 * v up] from the block's back face and the pair's middle: a chin up at 45 to
 * the bottom lip, a mouth raked back to the splitter's tip, and a ramp at 45
 * under the splitter. Two frames step back into the mouth, a vane on its
 * corners stands across it, the side walls splay in to the glowing face and
 * a divider stands down the middle, all three toothed with cooling channels.
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
  const gap = 0.1
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
  // Trim stands this far off the face it lies on, so the two never share a plane.
  const E = 0.002
  /** A point moved out along the normal n by `by`. */
  const off = ([d, v]: P2, [nd, nv]: P2, by = E): P2 => [d + nd * by, v + nv * by]

  /** A side profile pulled across z0..z1, upside down if `flip`, d measured aft of `from`. */
  const across = (
    mat: Mat,
    prof: P2[],
    y: number,
    z0: number,
    z1: number,
    flip = false,
    from = face
  ) => {
    let pts = prof.map(([d, v]) => [from - d, y + (flip ? -v : v)] as P2)
    if (area(pts) < 0) pts = [...pts].reverse()
    const shape = new Shape()
    pts.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)))
    shape.closePath()
    put(
      extrudeSolid(shape, { depth: z1 - z0, bevelEnabled: false }),
      mat,
      [0, 0, z0],
      undefined,
      parent
    )
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
  /** A convex polyhedron from its faces (each a convex polygon), every face turned outward. */
  const polyhedron = (faces: Vector3[][]): BufferGeometry => {
    const tris = faces.flatMap(f => f.slice(1, -1).map((_, i) => [f[0], f[i + 1], f[i + 2]]))
    const volume = tris.reduce((v, [a, b, c]) => v + a.dot(new Vector3().crossVectors(b, c)) / 6, 0)
    const positions = tris.flatMap(([a, b, c]) =>
      (volume < 0 ? [a, c, b] : [a, b, c]).flatMap(p => p.toArray())
    )
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
  }
  /** The pair's outline with its raked edge set back by `back`, its foot lifted by `lift`. */
  const outline = (back: number, lift = 0): P2[] => {
    const b: P2 = [bottom[0] - back, bottom[1] - back + lift]
    const tip: P2 = [D - back, ramp(D - back)]
    return [[0, -H + lift], b, tip, [tip[0], -tip[1]], [b[0], -b[1]], [0, H - lift]]
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
      const n = Math.hypot(D - c, -t - bottom[1])
      const out: P2 = [(-t - bottom[1]) / n, -(D - c) / n]
      const under: P2 = [Math.SQRT1_2, -Math.SQRT1_2]
      for (const side of [-1, 1]) {
        const z0 = side < 0 ? z - hw : z + hw - tw
        across(ink.dark, outline(0), y, z0, z0 + tw)
        for (const flip of [false, true]) {
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
              off(bottom, out),
              off([D, -t], out),
              [D - 0.05 * out[0], -t - 0.05 * out[1]],
              [c - 0.05 * out[0], bottom[1] - 0.05 * out[1]],
            ],
            y,
            z0 - 0.005,
            z0 + tw + 0.005,
            flip
          )
        }
      }
      // Over the top pair, the shroud's roof rests on a wedge whose underside
      // carries the upper box's 45 on to the shroud's mouth (a hair short, so
      // its end does not lie on the shroud's), so no stretch of roof hangs in
      // the air.
      const mouthD = plate - mouth.x - base - 0.01
      if (j === rows - 1 && mouthD > 0)
        across(
          ink.dark,
          [
            [0, H],
            [mouthD, H],
            [mouthD, H - mouthD],
          ],
          y,
          z - hw,
          z + hw
        )
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
          across(b % 2 ? ink.steel : ink.dark, outline(0.05 * b, k / 2), y, zj, zj + 0.03)
        }
      for (const flip of [false, true]) {
        const sign = flip ? -1 : 1
        // The chin, up at 45 from the block to the bottom lip, its lip in steel.
        across(
          ink.dark,
          [[0, -H], bottom, [c, bottom[1] + k], [0, -H + k]],
          y,
          z - inner,
          z + inner,
          flip
        )
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
        // sill where the chin is shorter than the frame is set back).
        for (let b = 1; b <= FRAMES; b++) {
          const [back, e] = [0.05 * b, 0.025 * b]
          const zIn = inner - b * 0.03
          const mat = b % 2 ? ink.steel : ink.dark
          if (c - back > 0.01)
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
              flip
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
            flip
          )
        }
        // The block's face glows between the frames' sill and header.
        const wIn = inner - FRAMES * 0.03
        const g0 = -H + k + 0.025 * FRAMES + 0.01
        const g1 = ramp(0) - 0.025 * FRAMES - 0.01
        // Cooling channels up each side wall, which splays in to the face so
        // it looks aft (its face upright, its top and bottom on the ceiling's
        // and the floor's 45s), and up both sides of a divider down the
        // middle: triangular teeth, as many on every hull.
        const sill = (dd: number) => g0 - 0.01 + dd
        const header = (dd: number) => g1 + 0.01 + dd
        const Y = (vv: number) => y + sign * vv
        // The inner jamb's raked edge: at depth d the cavity's walls hold
        // only above vMin(d), so each wall is clipped to it, from where it
        // crosses the floor (kink) to where it meets the ceiling (shut).
        const slope = (-t - bottom[1]) / (D - c)
        const vMin = (dd: number) => bottom[1] + (dd + 0.1 - c) * slope - 0.1
        const shut = (header(0) - vMin(0)) / (slope - 1) - 0.005
        const kink = (sill(0) - vMin(0)) / (slope - 1)
        const depths = kink > 0 && kink < shut ? [0, kink, shut] : [0, shut]
        const T = (dd: number) => SPLAY * Math.max(0, 1 - dd / shut)
        // The teeth spread evenly up the wall, each a quarter of it wide, with
        // equal gaps between them and at both ends.
        const span = header(0) - sill(0)
        const pitch = span / (CHANNELS + 1)
        const gapV = (span - CHANNELS * pitch) / (CHANNELS + 1)
        const footOf = (q: number) => sill(0) + gapV + q * (pitch + gapV)
        const rib = 0.6 * pitch
        const spread = ((pitch / 2) * SINK) / rib
        /** A loft through stations [d, v0, v1, z0, z1], aft first. */
        const loft = (st: [number, number, number, number, number][]) =>
          sectionLoft(
            [...st]
              .sort((p, q) => q[0] - p[0])
              .map(([dd, v0, v1, z0, z1]) => {
                const ring: P2[] = [
                  [Y(v0), z0],
                  [Y(v1), z0],
                  [Y(v1), z1],
                  [Y(v0), z1],
                ]
                return { x: face - dd, ring: area(ring) < 0 ? ring.reverse() : ring }
              })
          )
        // The inner jamb's raked edge as a plane (it holds z), its normal aft
        // into the mouth: the walls, the divider and the teeth all end on it.
        const rakeAt = new Vector3(face - (c - 0.1), Y(bottom[1] - 0.1), 0)
        const along = new Vector3(-(D - c), sign * (-t - bottom[1]), 0).normalize()
        const rakeN = new Vector3(along.y, -along.x, 0)
        if (rakeN.x > 0) rakeN.negate()
        /**
         * The teeth up a wall whose face is at zFace(d), standing off it
         * towards `into`, each running with the floor's 45 from the glowing
         * face to the inner jamb's raked edge, cut on it.
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
            const w = ring(1)[0].sub(start[0]).normalize()
            const reach = start.map(p => rakeAt.clone().sub(p).dot(rakeN) / w.dot(rakeN))
            if (Math.min(...reach) < 0.01) continue
            const end = start.map((p, i) => p.clone().addScaledVector(w, reach[i]))
            const geo = polyhedron([
              start,
              [...end].reverse(),
              ...[0, 1, 2].map(i => {
                const j = (i + 1) % 3
                return [start[i], end[i], end[j], start[j]]
              }),
            ])
            describe(geo, {
              kind: 'clipped',
              solid: prismSpec(start, w, Math.max(...reach) + 0.02),
              planes: [{ normal: rakeN.toArray(), at: rakeAt.toArray() }],
            })
            put(geo, ink.steel, undefined, undefined, parent)
          }
        }
        // The wall's side view: from the face to `shut`, between the floor
        // (or the jamb's edge) and the ceiling.
        const band: P2[] = [
          ...depths.map((dd): P2 => [face - dd, Y(Math.max(sill(dd), vMin(dd)))]),
          ...[...depths].reverse().map((dd): P2 => [face - dd, Y(header(dd))]),
        ]
        /**
         * A wedge in that band whose sides run from z0(d) to z1(d), both
         * linear in d: drawn as a loft, printed as the band pulled across
         * and cut by the planes its sides lie on (every face flat).
         */
        const wedge = (z0: (dd: number) => number, z1: (dd: number) => number) => {
          const geo = loft(
            depths.map((dd): [number, number, number, number, number] => [
              dd,
              Math.max(sill(dd), vMin(dd)),
              header(dd),
              z0(dd),
              z1(dd),
            ])
          )
          // A side z = zs(d) as a plane, its normal away from the wedge (`out`, +1 or -1 in z).
          const plane = (zs: (dd: number) => number, out: number) => {
            const dz = (zs(shut) - zs(0)) / shut
            return {
              normal: [out * dz, 0, out] as [number, number, number],
              at: [face, y, zs(0)] as [number, number, number],
            }
          }
          const lo = Math.min(z0(0), z0(shut), z1(0), z1(shut))
          const hi = Math.max(z0(0), z0(shut), z1(0), z1(shut))
          const [low, high] = z0(0) < z1(0) ? [z0, z1] : [z1, z0]
          describe(geo, {
            kind: 'clipped',
            solid: {
              kind: 'extrude',
              outline: area(band) < 0 ? [...band].reverse() : band,
              holes: [],
              depth: hi - lo,
              bevel: null,
              bake: new Matrix4().makeTranslation(0, 0, lo).toArray(),
            },
            planes: [plane(low, -1), plane(high, 1)].filter(
              ({ normal }) => Math.abs(normal[0]) > 1e-9
            ),
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
        // the points where that channel meets it, standing off it half its
        // width so both its faces are at 45, its ends in the side walls.
        const vane = footOf(Math.floor(CHANNELS / 2))
        across(
          ink.steel,
          [
            [0, vane],
            [pitch / 2, vane + pitch / 2],
            [0, vane + pitch],
          ],
          y,
          z - wIn + 0.005,
          z + wIn - 0.005,
          flip
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
  parent = drive
  // Copper conduits up the plate between the columns and outside them, floor
  // to roof, each with junction boxes whose undersides are at 45.
  const yMid = (roof - mouth.h) / 2
  for (let i = 0; i <= cols; i++) {
    const z = -mouth.w + 2 * cw * i + (i === 0 ? 0.03 : i === cols ? -0.03 : 0)
    put(
      cylinderSolid(0.03, 0.03, mouth.h + roof, 10),
      ink.copper ?? ink.steel,
      [plate - 0.03, yMid, z],
      undefined,
      parent
    )
    for (const yb of [yMid + half * 0.45, yMid - half * 0.3])
      across(
        ink.steel,
        [
          [0, yb - 0.07],
          [0.07, yb],
          [0.07, yb + 0.09],
          [0, yb + 0.09],
        ],
        0,
        z - 0.05,
        z + 0.05,
        false,
        plate
      )
  }
}
