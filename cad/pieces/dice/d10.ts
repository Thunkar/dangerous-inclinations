// The hull and fuel die: a pentagonal trapezohedron, a counter turned by
// hand and never rolled. Poles on z, the upper ring's corners at 72i and
// z0, the lower ring's at 72i + 36 and -z0, z0 solved so each kite is flat;
// opposite faces are parallel, so the die stands as tall as twice its
// inradius on any face. A steel ball sealed in its centre is what the
// stand's magnet holds.
//
// It prints as two halves split at z = 0 (a regular decagon), each on its
// cut face, so every outer face looks up: the odd pole's half as it stands,
// the even pole's turned over. The ball sits in a cylinder with a
// 45-degree roof in each half, and two 1.75 filament pins in holes both
// halves share line them up.
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
// The die is as small as the numbers allow: "10" with 1.0 to its kite's
// edges and clear of the seam, 1.6 under every pocket floor to the cavity, and the pin holes 1.2
// from the cavity, the faces and the pockets, where the pins are placed by
// a search (d10.ts `pins`). The holes are 144 degrees apart, so the halves
// go together one way only and no 72-degree step leaves the pins in holes.
import { sketch, plane, extrude, subtract } from "fluidcad/core";
import { Matrix4, Vector3 } from "three";
import { BOARD, DICE, MARKER } from "../../spec.ts";
import { box, drawContours } from "../../lib/glyphs.ts";
import { numberContours, numberPockets } from "../../lib/numbers.ts";
import { placeBuilt } from "../../lib/kit.ts";
import { prism, move, turn, outline, type Point, type Solid } from "../../lib/solids.ts";
import { lathe, regular } from "../markers/common.ts";

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The values round the odd pole, face k's normal at 36 + 72k, and round the even pole, face j's at 72j. */
const ODD = [1, 7, 9, 5, 3];
const EVEN = [2, 6, 8, 10, 4];
/** The second pin hole's angle from the first: not 180, nor a multiple of 72. */
const PIN_SPREAD = 144;

export interface Face {
  value: number;
  /** On the odd pole's half. */
  odd: boolean;
  /** Outward unit normal; the face is n . p = inradius. */
  n: Vector3;
  pole: Vector3;
  tip: Vector3;
  sides: [Vector3, Vector3];
  /** The face's own frame: `mid` halfway between the sides, `up` toward the pole, `right` = up x n. */
  mid: Vector3;
  up: Vector3;
  right: Vector3;
}

export interface Die {
  /** Ring radius, pole height, ring height. */
  r: number;
  h: number;
  z0: number;
  inradius: number;
  faces: Face[];
  /** The kite's length from `mid` to the pole and to the tip, and its half width at `mid`. */
  length: number;
  tip: number;
  halfWidth: number;
}

/** The die's corners and faces at DICE's size. */
export function die(): Die {
  const { proportion: k, inradius: I } = DICE;
  const c = Math.cos(rad(36));
  // Each kite flat: its tip on the plane through its pole and sides.
  const z0h = (1 - c) / (1 + c);
  // The inradius of the die with r = 1 is k / sqrt(1 + slope^2).
  const slope = (k * (1 - z0h)) / c;
  const r = (I * Math.sqrt(1 + slope * slope)) / k;
  const h = k * r;
  const z0 = z0h * h;
  const ring = (deg: number, z: number) => new Vector3(r * Math.cos(rad(deg)), r * Math.sin(rad(deg)), z);
  const U = [0, 1, 2, 3, 4].map((i) => ring(72 * i, z0));
  const L = [0, 1, 2, 3, 4].map((i) => ring(72 * i + 36, -z0));
  const N = new Vector3(0, 0, h);
  const S = new Vector3(0, 0, -h);
  const face = (value: number, odd: boolean, pole: Vector3, a: Vector3, b: Vector3, tip: Vector3): Face => {
    const n = new Vector3().crossVectors(a.clone().sub(pole), b.clone().sub(pole)).normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const up = pole.clone().sub(mid).normalize();
    return { value, odd, n, pole, tip, sides: [a, b], mid, up, right: new Vector3().crossVectors(up, n) };
  };
  const faces = [
    ...ODD.map((v, i) => face(v, true, N, U[i], U[(i + 1) % 5], L[i])),
    ...EVEN.map((v, j) => face(v, false, S, L[j], L[(j + 4) % 5], U[j])),
  ];
  const f = faces[0];
  return {
    r,
    h,
    z0,
    inradius: I,
    faces,
    length: f.pole.distanceTo(f.mid),
    tip: f.tip.distanceTo(f.mid),
    halfWidth: f.sides[0].distanceTo(f.mid),
  };
}

/** The far side of the plane through `at` with outward normal `n`: a box to subtract. */
export function beyond(n: Vector3, at: Vector3): Solid {
  const u = new Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)).normalize();
  const v = new Vector3().crossVectors(n, u);
  const B = 100;
  const box = prism(
    [
      [-B, -B],
      [B, -B],
      [B, B],
      [-B, B],
    ],
    B
  );
  return placeBuilt(box, new Matrix4().makeBasis(u, v, n).setPosition(at));
}

/** The ball's cavity: its radius, the height of its straight wall, and its roof's apex. */
export function cavity() {
  const R = (DICE.ball.diameter + DICE.ball.clearance) / 2;
  // A 45-degree roof that touches the cavity's own circle: the ball, smaller by the clearance, never reaches it.
  const wall = R * (Math.SQRT2 - 1);
  return { R, wall, apex: wall + R };
}

/** The most n . p reaches over the cavity, for a face whose normal leans `nz` out of the cut. */
function cavityReach(n: Vector3): number {
  const { R, wall, apex } = cavity();
  // The cavity's furthest points are the rim at the top of its straight wall and its roof's apex.
  return Math.max(Math.hypot(n.x, n.y) * R + Math.abs(n.z) * wall, Math.abs(n.z) * apex);
}


/** A face-frame point (u right, v up from `mid`) on the face, in the die's frame. */
const onFace = (f: Face, [u, v]: Point) => f.mid.clone().addScaledVector(f.right, u).addScaledVector(f.up, v);

/** The face's frame: x right, y up, z out along its normal, the origin at `mid`. */
const faceFrame = (f: Face) => new Matrix4().makeBasis(f.right, f.up, f.n).setPosition(f.mid);

/** A face's number in its frame: the inlay's pockets glyph by glyph, and the groove under 6 and 9. */
export interface Numeral {
  value: number;
  pockets: Point[][][];
  groove: Point[] | null;
}

/** The number with its inlay's box centred on the origin, as the board centres a label. */
function centred(value: number): Numeral {
  const label = String(value);
  const [lo, hi] = box(numberContours(label));
  const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const pockets = numberPockets(label).map((g) => g.map((poly) => poly.map(([x, y]): Point => [x - cx, y - cy])));
  if (value !== 6 && value !== 9) return { value, pockets, groove: null };
  const { bar, gap } = DICE.numeral;
  const [w, top] = [(hi[0] - lo[0]) * 0.4, lo[1] - cy - BOARD.number.clearance - gap];
  return { value, pockets, groove: [[-w, top - bar], [w, top - bar], [w, top], [-w, top]] };
}

/** Every point a numeral cuts, pockets and groove. */
const points = (m: Numeral) => [...m.pockets.flat(2), ...(m.groove ?? [])];

/** The kite in its face's frame, anticlockwise: tip, side, pole, side. */
const kite = (d: Die): Point[] => [[0, -d.tip], [d.halfWidth, 0], [0, d.length], [-d.halfWidth, 0]];

/**
 * The heights up its kite at which a number's box may be centred and keep
 * `margin` to every edge: [lo, hi]. Its pockets stay off the seam, so each is
 * cut whole in one half, and a groove keeps `margin` off it as well: cut
 * across the seam it would only split.
 */
function range(m: Numeral, d: Die): [number, number] {
  const k = kite(d);
  const f = d.faces[0];
  const seam = -f.mid.z / f.up.z;
  const low = (pts: Point[], gap: number) => seam + gap - Math.min(...pts.map((p) => p[1]));
  let [lo, hi] = [Math.max(low(m.pockets.flat(2), 0), m.groove ? low(m.groove, DICE.numeral.margin) : -Infinity), Infinity];
  for (const [u, v] of points(m))
    k.forEach((a, i) => {
      const b = k[(i + 1) % 4];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // The inward normal of an anticlockwise edge, and the margin it asks of (u, v + c).
      const [mu, mv] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      const need = DICE.numeral.margin - (mu * (u - a[0]) + mv * (v - a[1]));
      if (mv > 0) lo = Math.max(lo, need / mv);
      else if (mv < 0) hi = Math.min(hi, need / mv);
    });
  return [lo, hi];
}

/**
 * How far up its kite a number's box is centred, null if it does not fit:
 * every number at one height (the middle of the heights at which all of
 * them fit, grooves aside), but 6 and 9 raised as far as their groove needs.
 */
export function numeralHeight(value: number, d: Die = die()): number | null {
  const all = [...ODD, ...EVEN].map((v) => range({ ...centred(v), groove: null }, d));
  const [lo, hi] = [Math.max(...all.map((r) => r[0])), Math.min(...all.map((r) => r[1]))];
  const [a, b] = range(centred(value), d);
  if (lo > hi || a > b) return null;
  return Math.min(Math.max((lo + hi) / 2, a), b);
}

/** Does every number fit its kite? */
export const numeralsFit = (d: Die = die()) => [...ODD, ...EVEN].every((v) => numeralHeight(v, d) !== null);

/** A face's number where it goes on its kite. */
export function numeral(value: number, d: Die = die()): Numeral {
  const c = numeralHeight(value, d);
  if (c === null) throw new Error("d10: the numbers do not fit their kites: raise DICE.inradius");
  const m = centred(value);
  const up = (p: Point): Point => [p[0], p[1] + c];
  return { value, pockets: m.pockets.map((g) => g.map((poly) => poly.map(up))), groove: m.groove && m.groove.map(up) };
}

/** Every pocket's and groove's floor and sides as points in the die's frame, to measure walls against. */
function pocketSamples(d: Die): Vector3[] {
  const out: Vector3[] = [];
  for (const f of d.faces) {
    const m = numeral(f.value, d);
    const regions: [Point[][], number][] = [
      ...m.pockets.map((g): [Point[][], number] => [g, BOARD.number.depth]),
      ...(m.groove ? [[[m.groove], MARKER.depth] as [Point[][], number]] : []),
    ];
    for (const [polys, depth] of regions) {
      for (const poly of polys) for (const p of poly) for (const t of [0, 0.5, 1]) out.push(onFace(f, p).addScaledVector(f.n, -t * depth));
      const pts = polys.flat();
      const [u0, u1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
      const [v0, v1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
      for (let u = u0; u <= u1; u += 0.25)
        for (let v = v0; v <= v1; v += 0.25) if (inside(polys, [u, v])) out.push(onFace(f, [u, v]).addScaledVector(f.n, -depth));
    }
  }
  return out;
}

/** The walls round one pin hole at (x, y): to the cavity, to the faces and to the pockets. */
function holeWalls(d: Die, samples: Vector3[], [x, y]: Point) {
  const { hole, depth } = DICE.pin;
  const rh = hole / 2;
  const profile: Point[] = [[0, 0], [rh, 0], [rh, depth], [0, depth + rh]];
  let pocket = Infinity;
  for (const q of samples) {
    if (Math.abs(q.z) > depth + rh + 2 || Math.abs(q.x - x) > rh + 2 || Math.abs(q.y - y) > rh + 2) continue;
    pocket = Math.min(pocket, outside(profile, [Math.hypot(q.x - x, q.y - y), Math.abs(q.z)]));
  }
  // A face reaches furthest into a hole on its own side of the cut: the hole's top rim, or its tip.
  const face = Math.min(
    ...d.faces.map((f) => {
      const [nh, nz] = [Math.hypot(f.n.x, f.n.y), Math.abs(f.n.z)];
      const c = f.n.x * x + f.n.y * y;
      return d.inradius - Math.max(c + nh * rh + nz * depth, c + nz * (depth + rh));
    })
  );
  return { cavity: Math.hypot(x, y) - rh - cavity().R, face, pocket: Math.min(pocket, 99) };
}

const pinCache = new Map<string, { radius: number; angles: number[]; at: Point[] }>();

/**
 * The pin holes: a pair PIN_SPREAD apart, at the angle and radius (searched
 * in steps of 1 degree and 0.05) that leave the thinnest of their walls the
 * thickest, no nearer the cavity than its wall.
 */
export function pins(d: Die = die()): { radius: number; angles: number[]; at: Point[] } {
  const key = `${d.r}:${d.h}`;
  const hit = pinCache.get(key);
  if (hit) return hit;
  const samples = pocketSamples(d);
  const rh = DICE.pin.hole / 2;
  const inner = cavity().R + DICE.wall.pins + rh;
  const at = (deg: number, r: number): Point => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
  const thinnest = (p: Point) => {
    const w = holeWalls(d, samples, p);
    return Math.min(w.cavity, w.face, w.pocket);
  };
  let best = { wall: -Infinity, radius: inner, angle: 0 };
  for (let radius = inner; radius <= inner + 1.5; radius += 0.05) {
    const ring = Array.from({ length: 360 }, (_, a) => thinnest(at(a, radius)));
    for (let a = 0; a < 360; a++) {
      const wall = Math.min(ring[a], ring[(a + PIN_SPREAD) % 360]);
      if (wall > best.wall + 1e-9) best = { wall, radius, angle: a };
    }
  }
  const angles = [best.angle, (best.angle + PIN_SPREAD) % 360];
  const out = { radius: best.radius, angles, at: angles.map((a) => at(a, best.radius)) };
  pinCache.set(key, out);
  return out;
}

/**
 * The tools that cut one region (a glyph's pocket or a groove) `depth` into
 * face f, for the half whose print looks along `printUp` (die frame): a
 * prism along the normal, so a flat inlay seats; and where the normal leans
 * more than 45 degrees off the print's vertical, a second column along the
 * line 45 off it, which takes away the ledge the first leaves overhanging.
 */
function pocketTools(f: Face, polys: Point[][], depth: number, d: Die, printUp: Vector3): Solid[] {
  sketch(plane("xy", { offset: -depth }), () => polys.forEach((poly) => outline(poly)));
  const tools = [placeBuilt(extrude(depth + 1).new(), faceFrame(f))];
  const lean = f.n.dot(printUp);
  if (lean <= 0 || lean >= Math.SQRT1_2) return tools;
  const across = f.n.clone().addScaledVector(printUp, -lean).normalize();
  const s = printUp.clone().add(across).normalize();
  // The column's frame: z along s; its section the floor projected along s.
  const a = new Vector3().crossVectors(s, across).normalize();
  const b = new Vector3().crossVectors(s, a);
  const floor = polys.map((poly) => poly.map((p) => onFace(f, p).addScaledVector(f.n, -depth)));
  const along = floor.flat().map((q) => q.dot(s));
  const z0 = Math.min(...along) - 1;
  sketch(plane("xy", { offset: z0 }), () => floor.forEach((poly) => outline(poly.map((q): Point => [q.dot(a), q.dot(b)]))));
  const column = placeBuilt(extrude(Math.max(...along) - z0 + 3).new(), new Matrix4().makeBasis(a, b, s));
  tools.push(subtract(column, beyond(f.n.clone().negate(), f.n.clone().multiplyScalar(d.inradius - depth))));
  return tools;
}

/** A half of the die in the die's frame (the odd pole up), or as it prints (cut face on the bed). */
export function buildHalf(odd: boolean, pose: "print" | "die" = "print"): Solid {
  const d = die();
  const w = walls(d);
  if (w.numbers < DICE.wall.numbers || Math.min(w.pinToCavity, w.pinToFace, w.pinToPocket) < DICE.wall.pins - 1e-6)
    throw new Error(`d10: a wall is too thin: ${JSON.stringify(w)}`);
  const sign = odd ? 1 : -1;
  let s = prism(regular(10, d.r + 3), d.h + 1);
  if (!odd) s = move(s, 0, 0, -d.h - 1);
  // One plane at a time: a cut by several solids at once cuts nothing.
  for (const f of d.faces) s = subtract(s, beyond(f.n, f.n.clone().multiplyScalar(d.inradius)));
  // The cavity and the holes, from 1 under the cut up to their roofs (mirrored for the even half).
  const turned = (profile: Point[]) => lathe(profile.map(([r, z]): Point => [r, sign * z]));
  const { R, wall } = cavity();
  s = subtract(s, turned([[0, -1], [R, -1], [R, wall], [0, wall + R]]));
  const rh = DICE.pin.hole / 2;
  for (const [x, y] of pins(d).at)
    s = subtract(s, move(turned([[0, -1], [rh, -1], [rh, DICE.pin.depth], [0, DICE.pin.depth + rh]]), x, y, 0));
  // Every face's pockets on this half's side of the seam.
  const printUp = new Vector3(0, 0, sign);
  for (const f of d.faces) {
    const m = numeral(f.value, d);
    const regions: [Point[][], number][] = [
      ...m.pockets.map((g): [Point[][], number] => [g, BOARD.number.depth]),
      ...(m.groove ? [[[m.groove], MARKER.depth] as [Point[][], number]] : []),
    ];
    for (const [polys, depth] of regions) {
      if (!polys.flat().some((p) => sign * onFace(f, p).z > 0.01)) continue;
      for (const tool of pocketTools(f, polys, depth, d, printUp)) s = subtract(s, tool);
    }
  }
  return pose === "print" && !odd ? turn(s, "x", 180) : s;
}

/**
 * The die's frame to a stand's: the face opposite `top` down on z = `floor`,
 * its pole along +x and the ball's centre over the origin, so `top` is the
 * face that shows.
 */
export function restingFrame(top: number, floor = 0, d: Die = die()): Matrix4 {
  const f = d.faces.find((f) => f.value === 11 - top);
  if (!f) throw new Error(`d10: no face ${11 - top}`);
  const { up: x, right: y, n } = f;
  return new Matrix4().set(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, -n.x, -n.y, -n.z, d.inradius + floor, 0, 0, 0, 1);
}

/** The whole die as it stands on a stand, `top` showing (viewer only). */
export function buildDie(top: number, floor = 0): Solid[] {
  const m = restingFrame(top, floor);
  return [true, false].map((odd) => placeBuilt(buildHalf(odd, "die"), m));
}

/** The inlays seated in the whole die, as it stands on a stand (viewer only). */
export function buildDieInlays(top: number, floor = 0): Solid[] {
  const d = die();
  const m = restingFrame(top, floor, d);
  return d.faces.map((f) => {
    const c = numeralHeight(f.value, d)!;
    const contours = numberContours(String(f.value));
    const [lo, hi] = box(contours);
    const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    sketch(plane("xy", { offset: -BOARD.number.depth + 0.02 }), () =>
      drawContours(contours, ([x, y]): Point => [x - cx, y - cy + c])
    );
    return placeBuilt(placeBuilt(extrude(BOARD.number.depth).new(), faceFrame(f)), m);
  });
}

/** The inlays for one die, 1 to 10, lying flat in two rows, as the board's numbers print. */
export function buildDieNumbers(): Solid {
  const pitch = 14;
  sketch(plane("xy"), () => {
    [...ODD, ...EVEN]
      .sort((a, b) => a - b)
      .forEach((value, i) => {
        const contours = numberContours(String(value));
        const [lo, hi] = box(contours);
        const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
        const [ox, oy] = [(i % 5) * pitch, -Math.floor(i / 5) * pitch];
        drawContours(contours, ([x, y]): Point => [x - cx + ox, y - cy + oy]);
      });
  });
  return extrude(BOARD.number.depth).new();
}

/** Inside a set of loops, even-odd. */
function inside(polys: Point[][], [x, y]: Point): boolean {
  let odd = false;
  for (const p of polys)
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) odd = !odd;
  return odd;
}

/** How far a point is outside a convex polygon (0 inside). */
function outside(poly: Point[], q: Point): number {
  if (inside([poly], q)) return 0;
  return Math.min(
    ...poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
    })
  );
}

/** The walls the contract asks for, in mm: d10 throws before building a die that breaks one. */
export function walls(d: Die = die()) {
  const { at } = pins(d);
  const samples = pocketSamples(d);
  const holes = at.map((p) => holeWalls(d, samples, p));
  return {
    /** Under the deepest cut (the 6 and 9 grooves) to the cavity, and under an inlay's floor. */
    numbers: d.inradius - Math.max(BOARD.number.depth, MARKER.depth) - cavityReach(d.faces[0].n),
    inlayFloor: d.inradius - BOARD.number.depth - cavityReach(d.faces[0].n),
    pinToCavity: Math.min(...holes.map((h) => h.cavity)),
    pinToFace: Math.min(...holes.map((h) => h.face)),
    pinToPocket: Math.min(...holes.map((h) => h.pocket)),
  };
}
