// The hull and fuel die: a pentagonal trapezohedron, a counter turned by
// hand and never rolled. Poles on z, the upper ring's corners at 72i and
// z0, the lower ring's at 72i + 36 and -z0, z0 solved so each kite is flat;
// opposite faces are parallel, so the die stands as tall as twice its
// inradius on any face. It is hollow, a smaller die inside it, and a steel
// ball loose in the hollow rolls onto whichever face is down, where the
// stand's magnet holds it through that face's wall alone.
//
// It prints as two halves split at z = 0 (a regular decagon), each on its
// cut face, so every outer face looks up: the odd pole's half as it stands,
// the even pole's turned over. The hollow's walls are the numbers' pockets
// and the plastic under them (DICE.wall.numbers), its ceilings lean as the
// faces do (42 degrees off vertical in the print), and its apex is cut flat
// under each pole's flat, leaving the plastic a vice presses on. A key ring
// printed apart sits in a groove round the seam in both halves and lines them
// up all the way round (DICE.seam).
//
// Numbers 1 to 10 are inlays, the board's own (lib/numbers.ts: a "0" 7.5
// tall, 0.6 thick, in pockets grown 0.1), printed in a contrasting colour
// and glued in once the halves are joined. No pocket crosses the seam, so
// each is cut whole in one half. Odds go round one pole and evens round the other,
// opposite faces summing to 11; going round, every number but 5 has the next
// one down on a face sharing an edge, so a counter is turned over an edge
// almost every time. Each is upright toward its face's pole, all at one
// height on their kites, and 6 and 9 carry an engraved bar under them. A
// pocket's walls run along the face's normal, so a flat inlay seats flush;
// on a face steeper than 45 degrees that leans the wall above it past 45 out
// of vertical, so a second cut along a line 45 degrees off vertical takes
// that ledge away (it opens the pocket's top edge by under 0.1).
//
// Each pole is cut flat (DICE.poleFlat), so a vice presses the halves
// together pole to pole while the glue sets.
//
// The die is as small as the numbers allow: "10" with 1.0 to its kite's
// edges and clear of the seam. The groove is placed by a search (`groove`)
// for the most plastic between it and the faces, the hollow and the
// pockets; a block bridging it at one place, which the key's opening takes,
// makes the halves go together one way only.
import { sketch, plane, extrude, subtract, common, fuse } from 'fluidcad/core'
import { Matrix4, Vector3 } from 'three'
import { BOARD, DICE, MARKER } from '../../spec.ts'
import { box, drawContours } from '../../lib/glyphs.ts'
import { numberContours, numberPockets } from '../../lib/numbers.ts'
import { placeBuilt } from '../../lib/kit.ts'
import { prism, taper, move, turn, outline, type Point, type Solid } from '../../lib/solids.ts'
import { regular } from '../markers/common.ts'

const rad = (deg: number) => (deg * Math.PI) / 180

/** The values round the odd pole, face k's normal at 36 + 72k, and round the even pole, face j's at 72j. */
const ODD = [1, 7, 9, 5, 3]
const EVEN = [2, 6, 8, 10, 4]

export interface Face {
  value: number
  /** On the odd pole's half. */
  odd: boolean
  /** Outward unit normal; the face is n . p = inradius. */
  n: Vector3
  pole: Vector3
  tip: Vector3
  sides: [Vector3, Vector3]
  /** The face's own frame: `mid` halfway between the sides, `up` toward the pole, `right` = up x n. */
  mid: Vector3
  up: Vector3
  right: Vector3
}

export interface Die {
  /** Ring radius, pole height, ring height. */
  r: number
  h: number
  z0: number
  inradius: number
  faces: Face[]
  /** The kite's length from `mid` to the pole and to the tip, and its half width at `mid`. */
  length: number
  tip: number
  halfWidth: number
}

/** The die's corners and faces at DICE's size. */
export function die(): Die {
  const { proportion: k, inradius: I } = DICE
  const c = Math.cos(rad(36))
  // Each kite flat: its tip on the plane through its pole and sides.
  const z0h = (1 - c) / (1 + c)
  // The inradius of the die with r = 1 is k / sqrt(1 + slope^2).
  const slope = (k * (1 - z0h)) / c
  const r = (I * Math.sqrt(1 + slope * slope)) / k
  const h = k * r
  const z0 = z0h * h
  const ring = (deg: number, z: number) =>
    new Vector3(r * Math.cos(rad(deg)), r * Math.sin(rad(deg)), z)
  const U = [0, 1, 2, 3, 4].map(i => ring(72 * i, z0))
  const L = [0, 1, 2, 3, 4].map(i => ring(72 * i + 36, -z0))
  const N = new Vector3(0, 0, h)
  const S = new Vector3(0, 0, -h)
  const face = (
    value: number,
    odd: boolean,
    pole: Vector3,
    a: Vector3,
    b: Vector3,
    tip: Vector3
  ): Face => {
    const n = new Vector3().crossVectors(a.clone().sub(pole), b.clone().sub(pole)).normalize()
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const up = pole.clone().sub(mid).normalize()
    return {
      value,
      odd,
      n,
      pole,
      tip,
      sides: [a, b],
      mid,
      up,
      right: new Vector3().crossVectors(up, n),
    }
  }
  const faces = [
    ...ODD.map((v, i) => face(v, true, N, U[i], U[(i + 1) % 5], L[i])),
    ...EVEN.map((v, j) => face(v, false, S, L[j], L[(j + 4) % 5], U[j])),
  ]
  const f = faces[0]
  return {
    r,
    h,
    z0,
    inradius: I,
    faces,
    length: f.pole.distanceTo(f.mid),
    tip: f.tip.distanceTo(f.mid),
    halfWidth: f.sides[0].distanceTo(f.mid),
  }
}

/**
 * The height of the poles' flats: where the pyramid of five kites round a
 * pole is DICE.poleFlat across its pentagon's flats.
 */
export function poleFlat(d: Die = die()): number {
  const corner = DICE.poleFlat / 2 / Math.cos(rad(36))
  return d.h - (corner / d.r) * (d.h - d.z0)
}

/** The far side of the plane through `at` with outward normal `n`: a box to subtract. */
export function beyond(n: Vector3, at: Vector3): Solid {
  const u = new Vector3()
    .crossVectors(n, Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0))
    .normalize()
  const v = new Vector3().crossVectors(n, u)
  const B = 100
  const box = prism(
    [
      [-B, -B],
      [B, -B],
      [B, B],
      [-B, B],
    ],
    B
  )
  return placeBuilt(box, new Matrix4().makeBasis(u, v, n).setPosition(at))
}

/** The hollow's inradius: the die's, less the deepest cut and the plastic under it. */
export function hollow(d: Die = die()): number {
  return d.inradius - Math.max(BOARD.number.depth, MARKER.depth) - DICE.wall.numbers
}

/** The plastic left under each pole's flat, over the hollow's roof. */
const CAP = 2

/** A face-frame point (u right, v up from `mid`) on the face, in the die's frame. */
const onFace = (f: Face, [u, v]: Point) =>
  f.mid.clone().addScaledVector(f.right, u).addScaledVector(f.up, v)

/** The face's frame: x right, y up, z out along its normal, the origin at `mid`. */
const faceFrame = (f: Face) => new Matrix4().makeBasis(f.right, f.up, f.n).setPosition(f.mid)

/** A face's number in its frame: the inlay's pockets glyph by glyph, and the groove under 6 and 9. */
export interface Numeral {
  value: number
  pockets: Point[][][]
  groove: Point[] | null
}

/** The number with its inlay's box centred on the origin, as the board centres a label. */
function centred(value: number): Numeral {
  const label = String(value)
  const [lo, hi] = box(numberContours(label))
  const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
  const pockets = numberPockets(label).map(g =>
    g.map(poly => poly.map(([x, y]): Point => [x - cx, y - cy]))
  )
  if (value !== 6 && value !== 9) return { value, pockets, groove: null }
  const { bar, gap } = DICE.numeral
  const [w, top] = [(hi[0] - lo[0]) * 0.4, lo[1] - cy - BOARD.number.clearance - gap]
  return {
    value,
    pockets,
    groove: [
      [-w, top - bar],
      [w, top - bar],
      [w, top],
      [-w, top],
    ],
  }
}

/** Every point a numeral cuts, pockets and groove. */
const points = (m: Numeral) => [...m.pockets.flat(2), ...(m.groove ?? [])]

/** The kite in its face's frame, anticlockwise: tip, side, pole, side. */
const kite = (d: Die): Point[] => [
  [0, -d.tip],
  [d.halfWidth, 0],
  [0, d.length],
  [-d.halfWidth, 0],
]

/**
 * The heights up its kite at which a number's box may be centred and keep
 * `margin` to every edge: [lo, hi]. Its pockets stay off the seam, so each is
 * cut whole in one half, and a groove keeps `margin` off it as well: cut
 * across the seam it would only split.
 */
function range(m: Numeral, d: Die): [number, number] {
  const k = kite(d)
  const f = d.faces[0]
  const seam = -f.mid.z / f.up.z
  const low = (pts: Point[], gap: number) => seam + gap - Math.min(...pts.map(p => p[1]))
  let [lo, hi] = [
    Math.max(low(m.pockets.flat(2), 0), m.groove ? low(m.groove, DICE.numeral.margin) : -Infinity),
    Infinity,
  ]
  for (const [u, v] of points(m))
    k.forEach((a, i) => {
      const b = k[(i + 1) % 4]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      // The inward normal of an anticlockwise edge, and the margin it asks of (u, v + c).
      const [mu, mv] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]
      const need = DICE.numeral.margin - (mu * (u - a[0]) + mv * (v - a[1]))
      if (mv > 0) lo = Math.max(lo, need / mv)
      else if (mv < 0) hi = Math.min(hi, need / mv)
    })
  return [lo, hi]
}

/**
 * How far up its kite a number's box is centred, null if it does not fit:
 * every number at one height (the middle of the heights at which all of
 * them fit, grooves aside), but 6 and 9 raised as far as their groove needs.
 */
export function numeralHeight(value: number, d: Die = die()): number | null {
  const all = [...ODD, ...EVEN].map(v => range({ ...centred(v), groove: null }, d))
  const [lo, hi] = [Math.max(...all.map(r => r[0])), Math.min(...all.map(r => r[1]))]
  const [a, b] = range(centred(value), d)
  if (lo > hi || a > b) return null
  return Math.min(Math.max((lo + hi) / 2, a), b)
}

/** Does every number fit its kite? */
export const numeralsFit = (d: Die = die()) =>
  [...ODD, ...EVEN].every(v => numeralHeight(v, d) !== null)

/** A face's number where it goes on its kite. */
export function numeral(value: number, d: Die = die()): Numeral {
  const c = numeralHeight(value, d)
  if (c === null) throw new Error('d10: the numbers do not fit their kites: raise DICE.inradius')
  const m = centred(value)
  const up = (p: Point): Point => [p[0], p[1] + c]
  return {
    value,
    pockets: m.pockets.map(g => g.map(poly => poly.map(up))),
    groove: m.groove && m.groove.map(up),
  }
}

/** Every pocket's and groove's floor and sides as points in the die's frame, to measure walls against. */
function pocketSamples(d: Die): Vector3[] {
  const out: Vector3[] = []
  for (const f of d.faces) {
    const m = numeral(f.value, d)
    const regions: [Point[][], number][] = [
      ...m.pockets.map((g): [Point[][], number] => [g, BOARD.number.depth]),
      ...(m.groove ? [[[m.groove], MARKER.depth] as [Point[][], number]] : []),
    ]
    for (const [polys, depth] of regions) {
      for (const poly of polys)
        for (const p of poly)
          for (const t of [0, 0.5, 1]) out.push(onFace(f, p).addScaledVector(f.n, -t * depth))
      const pts = polys.flat()
      const [u0, u1] = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))]
      const [v0, v1] = [Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))]
      for (let u = u0; u <= u1; u += 0.25)
        for (let v = v0; v <= v1; v += 0.25)
          if (inside(polys, [u, v])) out.push(onFace(f, [u, v]).addScaledVector(f.n, -depth))
    }
  }
  return out
}

/** What the ball, at rest on any face, keeps clear of the seam's ring. */
const BALL_CLEAR = 0.3

/** The decagon's apothem through a point: the largest of its reaches along the faces' horizontal normals. */
function apothem(d: Die, [x, y]: Point): number {
  return Math.max(...d.faces.map(f => (f.n.x * x + f.n.y * y) / Math.hypot(f.n.x, f.n.y)))
}

/**
 * The seam ring's inner edge, a decagon square to the faces: `seam.ring` in
 * from the hollow's at the cut, straight up to the ring's top, then out at
 * 45 degrees in the print until it meets the wall, so the groove has
 * plastic over it on every side (the hollow widens above the cut on half of
 * them).
 */
const ringEdge = (d: Die) =>
  (hollow(d) - DICE.seam.ring) / Math.hypot(d.faces[0].n.x, d.faces[0].n.y)

/**
 * How far the ball, at rest on any face, keeps from the seam's ring: every
 * point of the ring and its roof (sampled 0.2 apart) against every resting
 * ball.
 */
function seamClear(d: Die): number {
  const R = DICE.ball.diameter / 2
  const H = hollow(d)
  const { height } = DICE.seam
  const balls = d.faces.map(f => f.n.clone().multiplyScalar(H - R))
  let clear = Infinity
  for (let x = -d.r; x <= d.r; x += 0.2)
    for (let y = -d.r; y <= d.r; y += 0.2)
      for (let z = 0; z <= height + DICE.seam.ring; z += 0.2) {
        const m = Math.max(...d.faces.map(f => f.n.x * x + f.n.y * y + f.n.z * z))
        if (m > H || apothem(d, [x, y]) < ringEdge(d) + Math.max(0, z - height)) continue
        for (const c of balls) clear = Math.min(clear, Math.hypot(x - c.x, y - c.y, z - c.z) - R)
      }
  return clear
}

/**
 * The seam's decagon at apothem `a`: its sides square to the faces'
 * horizontal normals, as the equator's are.
 */
function decagon(d: Die, a: number): Point[] {
  const az = d.faces.map(f => Math.atan2(f.n.y, f.n.x)).sort((p, q) => p - q)
  return az.map((t, k) => {
    const next = k + 1 < az.length ? az[k + 1] : az[0] + 2 * Math.PI
    const mid = (t + next) / 2
    const r = a / Math.cos((next - t) / 2)
    return [r * Math.cos(mid), r * Math.sin(mid)]
  })
}

/** Where the groove's block stands: across the side square to the first face's normal. */
const blockAngle = (d: Die) => Math.atan2(d.faces[0].n.y, d.faces[0].n.x)

/**
 * The plastic left round a groove whose middle is at apothem `a` (in the
 * odd half; the even half is its mirror): to the faces, the land, the
 * hollow with its ring, and the pockets, at points round its walls and
 * across its roof.
 */
function grooveWalls(d: Die, a: number, samples: Vector3[]): number {
  const { land, height, groove } = DICE.seam
  const { width: g, depth } = groove
  const H = hollow(d)
  const pts: Vector3[] = []
  const { mouth } = groove
  // Its walls, its mouth's chamfer at the cut, and its peaked roof.
  const at: [number, number][] = [
    [a - g / 2 - mouth, 0],
    [a + g / 2 + mouth, 0],
    ...[mouth, depth / 2, depth].flatMap((z): [number, number][] => [
      [a - g / 2, z],
      [a + g / 2, z],
    ]),
    [a - g / 4, depth + g / 4],
    [a + g / 4, depth + g / 4],
    [a, depth + g / 2],
  ]
  for (const [apothem, z] of at) {
    const poly = decagon(d, apothem)
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length]
      for (let t = 0; t < 1; t += 0.05)
        pts.push(new Vector3(p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), z))
    })
  }
  let wall = Infinity
  for (const p of pts) {
    // Out to a face, or the land below its top.
    for (const f of d.faces) {
      wall = Math.min(wall, d.inradius - f.n.dot(p))
      const nh = Math.hypot(f.n.x, f.n.y)
      if (f.n.z > 0 && p.z <= land)
        wall = Math.min(wall, (d.inradius - f.n.z * land) / nh - (f.n.x * p.x + f.n.y * p.y) / nh)
    }
    // In to the hollow: no nearer than the die's hollow, nor than the ring's
    // edge (its prism, or the cone of its roof above its top).
    const e = apothem(d, [p.x, p.y]) - ringEdge(d)
    const edge = Math.min(e, Math.max((e - (p.z - height)) / Math.SQRT2, height - p.z))
    wall = Math.min(wall, Math.max(Math.max(...d.faces.map(f => f.n.dot(p) - H)), edge))
    for (const q of samples) if (Math.abs(q.z - p.z) < 3) wall = Math.min(wall, q.distanceTo(p))
  }
  return wall
}

const grooveCache = new Map<string, { apothem: number; wall: number }>()

/** The groove's middle: the apothem, in steps of 0.05, that leaves the most plastic round it. */
export function groove(d: Die = die()): { apothem: number; wall: number } {
  const key = `${d.r}:${d.h}`
  const hit = grooveCache.get(key)
  if (hit) return hit
  const samples = pocketSamples(d).filter(q => Math.abs(q.z) < 4)
  let best = { apothem: 0, wall: -Infinity }
  for (let a = ringEdge(d); a < d.inradius / 0.7; a += 0.05) {
    const wall = grooveWalls(d, a, samples)
    if (wall > best.wall) best = { apothem: a, wall }
  }
  grooveCache.set(key, best)
  return best
}

/** The groove's block, or the key's opening: a strip across the seam's sides at `blockAngle`, `long` along them. */
function across(d: Die, long: number, height: number, t = blockAngle(d)): Solid {
  const [u, v] = [
    [Math.cos(t), Math.sin(t)],
    [-Math.sin(t), Math.cos(t)],
  ]
  const [r0, r1] = [groove(d).apothem - 3, groove(d).apothem + 3]
  const at = (r: number, s: number): Point => [r * u[0] + s * v[0], r * u[1] + s * v[1]]
  return prism([at(r0, -long / 2), at(r1, -long / 2), at(r1, long / 2), at(r0, long / 2)], height)
}

/**
 * The key ring, flat on the bed: the groove less `clearance` across, as tall
 * as both grooves up to where its corners meet their peaked roofs, less
 * `end` at each end, open where the block bridges the groove.
 */
export function buildKey(): Solid {
  const d = die()
  const { width, depth, gap, clearance: c, end } = DICE.seam.groove
  const { apothem: a } = groove(d)
  // A corner `c` in from the groove's wall meets the 45-degree roof `c` above the wall's top.
  const h = 2 * (depth + c - end)
  let key = subtract(
    prism(decagon(d, a + width / 2 - c), h),
    move(prism(decagon(d, a - width / 2 + c), h + 2), 0, 0, -1)
  )
  return subtract(key, move(across(d, gap + 2 * c, h + 2), 0, 0, -1))
}

/**
 * The tools that cut one region (a glyph's pocket or a groove) `depth` into
 * face f, for the half whose print looks along `printUp` (die frame): a
 * prism along the normal, so a flat inlay seats; and where the normal leans
 * more than 45 degrees off the print's vertical, a second column along the
 * line 45 off it, which takes away the ledge the first leaves overhanging.
 */
function pocketTools(f: Face, polys: Point[][], depth: number, d: Die, printUp: Vector3): Solid[] {
  sketch(plane('xy', { offset: -depth }), () => polys.forEach(poly => outline(poly)))
  const tools = [placeBuilt(extrude(depth + 1).new(), faceFrame(f))]
  const lean = f.n.dot(printUp)
  if (lean <= 0 || lean >= Math.SQRT1_2) return tools
  const across = f.n.clone().addScaledVector(printUp, -lean).normalize()
  const s = printUp.clone().add(across).normalize()
  // The column's frame: z along s; its section the floor projected along s.
  const a = new Vector3().crossVectors(s, across).normalize()
  const b = new Vector3().crossVectors(s, a)
  const floor = polys.map(poly => poly.map(p => onFace(f, p).addScaledVector(f.n, -depth)))
  const along = floor.flat().map(q => q.dot(s))
  const z0 = Math.min(...along) - 1
  sketch(plane('xy', { offset: z0 }), () =>
    floor.forEach(poly => outline(poly.map((q): Point => [q.dot(a), q.dot(b)])))
  )
  const column = placeBuilt(
    extrude(Math.max(...along) - z0 + 3).new(),
    new Matrix4().makeBasis(a, b, s)
  )
  tools.push(
    subtract(column, beyond(f.n.clone().negate(), f.n.clone().multiplyScalar(d.inradius - depth)))
  )
  return tools
}

/** A half of the die in the die's frame (the odd pole up), or as it prints (cut face on the bed). */
export function buildHalf(odd: boolean, pose: 'print' | 'die' = 'print'): Solid {
  const d = die()
  const w = walls(d)
  if (w.ballRoom < 0 || w.ballToSeam < BALL_CLEAR || w.round < DICE.wall.groove - 1e-6)
    throw new Error(`d10: a wall is too thin: ${JSON.stringify(w)}`)
  const sign = odd ? 1 : -1
  let s = prism(regular(10, d.r + 3), d.h + 1)
  if (!odd) s = move(s, 0, 0, -d.h - 1)
  // One plane at a time: a cut by several solids at once cuts nothing.
  for (const f of d.faces) s = subtract(s, beyond(f.n, f.n.clone().multiplyScalar(d.inradius)))
  s = subtract(s, beyond(new Vector3(0, 0, sign), new Vector3(0, 0, sign * poleFlat(d))))
  // The equator's knife edge (each half's faces meet its cut at 48 degrees)
  // stood up as a vertical land `seam.land` tall: it prints as perimeters,
  // not a feather a first layer flares, and gives the halves an edge to meet on.
  const { land, height } = DICE.seam
  const slab = (top: number) => move(prism(regular(10, d.r + 3), top + 1), 0, 0, odd ? -1 : -top)
  for (const f of d.faces) {
    if (f.n.z * sign <= 0) continue
    const nh = Math.hypot(f.n.x, f.n.y)
    const v = new Vector3(f.n.x / nh, f.n.y / nh, 0)
    s = subtract(
      s,
      common(
        slab(land),
        beyond(v, v.clone().multiplyScalar((d.inradius - Math.abs(f.n.z) * land) / nh))
      )
    )
  }
  // Every face's pockets on this half's side of the seam.
  const printUp = new Vector3(0, 0, sign)
  for (const f of d.faces) {
    const m = numeral(f.value, d)
    const regions: [Point[][], number][] = [
      ...m.pockets.map((g): [Point[][], number] => [g, BOARD.number.depth]),
      ...(m.groove ? [[[m.groove], MARKER.depth] as [Point[][], number]] : []),
    ]
    for (const [polys, depth] of regions) {
      if (!polys.flat().some(p => sign * onFace(f, p).z > 0.01)) continue
      for (const tool of pocketTools(f, polys, depth, d, printUp)) s = subtract(s, tool)
    }
  }
  // The hollow, cut after the pockets (cut before them, the half takes the
  // kernel over ten minutes): the die's shape moved in to `hollow`, from 1
  // under the cut, its apex cut flat CAP under the pole's flat (a ceiling
  // under 7 across, bridged).
  let tool = move(prism(regular(10, d.r + 3), d.h + 2), 0, 0, odd ? -1 : -d.h - 1)
  for (const f of d.faces) tool = subtract(tool, beyond(f.n, f.n.clone().multiplyScalar(hollow(d))))
  const cap = poleFlat(d) - CAP
  tool = subtract(tool, move(prism(regular(10, d.r + 3), d.h), 0, 0, odd ? cap : -cap - d.h))
  // The seam's ring: everything outside a decagon `seam.ring` in from the
  // hollow's edge at the cut, `seam.height` up from it, then outside that
  // decagon widening at 45 degrees (the ring's roof), so the halves meet on
  // a wide face and the groove has plastic round it (the ball keeps clear).
  const big = regular(10, d.r + 3)
  let keep = subtract(
    move(prism(big, height + 1), 0, 0, -1),
    move(prism(decagon(d, ringEdge(d)), height + 3), 0, 0, -2)
  )
  keep = fuse(
    keep,
    subtract(
      move(prism(big, d.h), 0, 0, height),
      move(taper(decagon(d, ringEdge(d)), d.h, -45), 0, 0, height)
    )
  )
  tool = subtract(tool, odd ? keep : turn(keep, 'x', 180))
  s = subtract(s, tool)
  // The key's groove, up from the cut: its walls, a 45-degree peak for a
  // roof (a flat roof is a bridge that sags onto the key), and its mouth
  // chamfered so a first layer's flare does not narrow it; less the block
  // that bridges it at one place. Built for the odd half and turned over for
  // the even, with its block placed where the turn brings it back.
  const { width: g, depth, gap, mouth } = DICE.seam.groove
  const { apothem: a } = groove(d)
  const band = (outer: Solid, inner: Solid) => subtract(outer, inner)
  const slot = (t: number) => {
    let tool = band(
      move(prism(decagon(d, a + g / 2), depth + 1), 0, 0, -1),
      move(prism(decagon(d, a - g / 2), depth + 3), 0, 0, -2)
    )
    tool = fuse(
      tool,
      band(
        move(taper(decagon(d, a + g / 2), g / 2), 0, 0, depth),
        move(taper(decagon(d, a - g / 2), g / 2 + 1, -45), 0, 0, depth)
      )
    )
    tool = fuse(
      tool,
      band(
        move(taper(decagon(d, a + g / 2 + mouth + 1), mouth + 1), 0, 0, -1),
        move(taper(decagon(d, a - g / 2 - mouth - 1), mouth + 2, -45), 0, 0, -1)
      )
    )
    return subtract(tool, move(across(d, gap, depth + g + 3, t), 0, 0, -1))
  }
  s = subtract(s, odd ? slot(blockAngle(d)) : turn(slot(-blockAngle(d)), 'x', 180))
  return pose === 'print' && !odd ? turn(s, 'x', 180) : s
}

/**
 * The die's frame to a stand's: the face opposite `top` down on z = `floor`,
 * its pole along +x and the ball's centre over the origin, so `top` is the
 * face that shows.
 */
export function restingFrame(top: number, floor = 0, d: Die = die()): Matrix4 {
  const f = d.faces.find(f => f.value === 11 - top)
  if (!f) throw new Error(`d10: no face ${11 - top}`)
  const { up: x, right: y, n } = f
  return new Matrix4().set(
    x.x,
    x.y,
    x.z,
    0,
    y.x,
    y.y,
    y.z,
    0,
    -n.x,
    -n.y,
    -n.z,
    d.inradius + floor,
    0,
    0,
    0,
    1
  )
}

/** The whole die as it stands on a stand, `top` showing (viewer only). */
export function buildDie(top: number, floor = 0): Solid[] {
  const m = restingFrame(top, floor)
  return [true, false].map(odd => placeBuilt(buildHalf(odd, 'die'), m))
}

/** The inlays seated in the whole die, as it stands on a stand (viewer only). */
export function buildDieInlays(top: number, floor = 0): Solid[] {
  const d = die()
  const m = restingFrame(top, floor, d)
  return d.faces.map(f => {
    const c = numeralHeight(f.value, d)!
    const contours = numberContours(String(f.value))
    const [lo, hi] = box(contours)
    const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
    sketch(plane('xy', { offset: -BOARD.number.depth + 0.02 }), () =>
      drawContours(contours, ([x, y]): Point => [x - cx, y - cy + c])
    )
    return placeBuilt(placeBuilt(extrude(BOARD.number.depth).new(), faceFrame(f)), m)
  })
}

/** The inlays for one die, 1 to 10, lying flat in two rows, as the board's numbers print. */
export function buildDieNumbers(): Solid {
  const pitch = 14
  sketch(plane('xy'), () => {
    ;[...ODD, ...EVEN]
      .sort((a, b) => a - b)
      .forEach((value, i) => {
        const contours = numberContours(String(value))
        const [lo, hi] = box(contours)
        const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
        const [ox, oy] = [(i % 5) * pitch, -Math.floor(i / 5) * pitch]
        drawContours(contours, ([x, y]): Point => [x - cx + ox, y - cy + oy])
      })
  })
  return extrude(BOARD.number.depth).new()
}

/** Inside a set of loops, even-odd. */
function inside(polys: Point[][], [x, y]: Point): boolean {
  let odd = false
  for (const p of polys)
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if (
        p[i][1] > y !== p[j][1] > y &&
        x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]
      )
        odd = !odd
  return odd
}

/** The walls the contract asks for, in mm: d10 throws before building a die that breaks one. */
export function walls(d: Die = die()) {
  return {
    /** How much smaller the ball is than the hollow's insphere: it must be free to roll. */
    ballRoom: hollow(d) - DICE.ball.diameter / 2,
    ballToSeam: seamClear(d),
    round: groove(d).wall,
  }
}
