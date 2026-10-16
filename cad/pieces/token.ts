// The ship token for the board: a 6 mm slab cut to a ship in plan, nose +x,
// with the sides of its V-notches, its stern corners and its flanks into the
// nose chamfered at 45 degrees top and bottom, and the rest square (the
// designer's Onshape token, read back from its export and drawn again).
//
// The kernel's chamfer cannot take it (two chamfers run out over one short
// square side from both ends, and the flank's runs out over the nose's
// square sides), so the token is built as it is: at a height h into a
// chamfered band, its outline is the plan's with every chamfered side moved
// in by the chamfer less h and every square side left where it is. Between
// the heights at which a side shrinks away, every such outline has the same
// corners, and the band is lofted between them; each face is flat.
import { sketch, plane, loft, fuse } from "fluidcad/core";
import { prism, move, outline, type Point, type Solid } from "../lib/solids.ts";

export const TOKEN = { thickness: 6, chamfer: 1.125 };

/** The port half of the outline, stern to nose (the starboard half mirrors it). */
const PORT: Point[] = [
  [-9.75, 3.75],
  [-8.25, 3.75],
  [-6, 3.3],
  [-5.25, 2.25],
  [-4.5, 3.3],
  [-1.5, 3.3],
  [-0.75, 2.25],
  [0.75, 2.25],
  [1.5, 3.3],
  [4.5, 3.3],
  [5.25, 2.25],
  [6, 2.25],
  [9.958028, 1.775106],
  [9.958028, 1.541507],
  [9.75, 1.125],
  [9.75, 0.75],
  [10.5, 0.375],
];
/** The chamfered sides on the port half: side i runs from PORT[i] to PORT[i + 1]. */
const CHAMFERED = [0, 2, 3, 5, 7, 9, 10, 11];

interface Side {
  /** Unit direction, and the inward normal (the material's side). */
  d: Point;
  n: Point;
  /** The line: n . p = c (+ the inset). */
  c: number;
  chamfered: boolean;
}

/** The whole outline, clockwise from the stern's port corner, and its sides. */
function sides(): Side[] {
  const pts: Point[] = [...PORT, ...[...PORT].reverse().map(([x, y]) => [x, -y] as Point)];
  const n = pts.length;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const d: Point = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    // Clockwise: the inside is on the right.
    const nn: Point = [d[1], -d[0]];
    // Port sides by index; a starboard side is the mirror of port side (2 * PORT.length - 2 - i).
    const port = i < PORT.length - 1 ? i : i >= PORT.length && i < 2 * PORT.length - 1 ? 2 * PORT.length - 2 - i : -1;
    return { d, n: nn, c: nn[0] * p[0] + nn[1] * p[1], chamfered: CHAMFERED.includes(port) };
  });
}

/** Where two sides' lines cross, each moved in by its inset. */
function corner(a: Side, b: Side, inset: number): Point {
  const ca = a.c + (a.chamfered ? inset : 0);
  const cb = b.c + (b.chamfered ? inset : 0);
  const det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
  return [(ca * b.n[1] - cb * a.n[1]) / det, (a.n[0] * cb - b.n[0] * ca) / det];
}

function outlineAt(active: Side[], inset: number): Point[] {
  return active.map((s, i) => corner(active[(i - 1 + active.length) % active.length], s, inset));
}

/** A side's length at an inset, measured along it (negative once it has shrunk past nothing). */
function lengthAt(active: Side[], i: number, inset: number): number {
  const p = outlineAt(active, inset);
  const [a, b] = [p[i], p[(i + 1) % p.length]];
  return (b[0] - a[0]) * active[i].d[0] + (b[1] - a[1]) * active[i].d[1];
}

/**
 * The band's outlines from the plan's (inset 0) to the face's (the full
 * chamfer): one at each inset where a side shrinks away, taken a hair before
 * it goes and again just after, without it.
 */
function stages(): { inset: number; outline: Point[] }[] {
  const full = TOKEN.chamfer;
  let active = sides();
  let at = 0;
  const out: { inset: number; outline: Point[] }[] = [{ inset: 0, outline: outlineAt(active, 0) }];
  for (;;) {
    // The first side to shrink away before the full chamfer: lengths change linearly between events.
    let next = full;
    let gone = -1;
    for (let i = 0; i < active.length; i++) {
      const [l0, l1] = [lengthAt(active, i, at), lengthAt(active, i, full)];
      if (l1 < -1e-9 && l0 > 1e-9) {
        const t = at + ((full - at) * l0) / (l0 - l1);
        if (t < next) [next, gone] = [t, i];
      }
    }
    if (gone < 0) {
      out.push({ inset: full, outline: outlineAt(active, full) });
      return out;
    }
    const hair = 1e-3;
    out.push({ inset: next - hair, outline: outlineAt(active, next - hair) });
    // Every side gone by then: the starboard twin of a port side goes with it.
    const ends = active.map((_, i) => lengthAt(active, i, next));
    active = active.filter((_, i) => i !== gone && ends[i] > 1e-7);
    out.push({ inset: next - hair, outline: outlineAt(active, next - hair) });
    at = next;
  }
}

/** One chamfered band, bottom (z from 0) or top (z to the thickness). */
function band(top: boolean): Solid[] {
  const t = TOKEN.thickness;
  const d = TOKEN.chamfer;
  const z = (inset: number) => (top ? t - d + inset : d - inset);
  const s = stages();
  const pieces: Solid[] = [];
  for (let k = 0; k + 1 < s.length; k++) {
    if (s[k].inset === s[k + 1].inset) continue;
    const [a, b] = [s[k], s[k + 1]];
    // Lofts run from lower to upper.
    const [lo, hi] = z(a.inset) < z(b.inset) ? [a, b] : [b, a];
    const below = sketch(plane("xy", { offset: z(lo.inset) }), () => outline(lo.outline));
    const above = sketch(plane("xy", { offset: z(hi.inset) }), () => outline(hi.outline));
    pieces.push(loft(below, above).new());
  }
  return pieces;
}

export function buildToken(): Solid {
  const t = TOKEN.thickness;
  const d = TOKEN.chamfer;
  const middle = move(prism(stages()[0].outline, t - 2 * d), 0, 0, d);
  return fuse(middle, ...band(false), ...band(true));
}
