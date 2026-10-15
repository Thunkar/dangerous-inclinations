// Numbers as sketch geometry, drawn from the font's own outlines (fontkit,
// laid out as FluidCAD's text() lays them), so a label can be measured,
// placed and grown before anything is built: the exact curves for the inlay
// itself, and a flattened outline grown by a clearance for its pocket.
import { openSync, type Font } from "fontkit";
import { line, bezier } from "fluidcad/core";
import type { Point } from "./solids.ts";

const fonts = new Map<string, Font>();
function font(file: string): Font {
  if (!fonts.has(file)) fonts.set(file, openSync(decodeURIComponent(new URL(`../${file}`, import.meta.url).pathname)));
  return fonts.get(file)!;
}

/** One glyph outline: its segments, each a line (2 points) or a quadratic or cubic Bezier (3 or 4). */
export type Contour = Point[][];

/** The label's outlines at `size` (em, mm) with the pen starting at the origin, baseline on y = 0. */
export function outlines(file: string, label: string, size: number): Contour[] {
  return glyphOutlines(file, label, size).flat();
}

/** The same, glyph by glyph. */
export function glyphOutlines(file: string, label: string, size: number): Contour[][] {
  const f = font(file);
  const s = size / f.unitsPerEm;
  const run = f.layout(label);
  const glyphs: Contour[][] = [];
  let pen = 0;
  run.glyphs.forEach((g, i) => {
    const out: Contour[] = [];
    const p = run.positions[i];
    const at = (x: number, y: number): Point => [pen + (p.xOffset + x) * s, (p.yOffset + y) * s];
    let start: Point | null = null;
    let last: Point | null = null;
    let contour: Contour = [];
    const close = () => {
      if (start && last && (last[0] !== start[0] || last[1] !== start[1])) contour.push([last, start]);
      if (contour.length) out.push(contour);
      contour = [];
      start = last = null;
    };
    for (const { command, args } of g.path.commands) {
      if (command === "moveTo") {
        close();
        start = last = at(args[0], args[1]);
      } else if (command === "lineTo") {
        const q = at(args[0], args[1]);
        contour.push([last!, q]);
        last = q;
      } else if (command === "quadraticCurveTo") {
        const q = at(args[2], args[3]);
        contour.push([last!, at(args[0], args[1]), q]);
        last = q;
      } else if (command === "bezierCurveTo") {
        const q = at(args[4], args[5]);
        contour.push([last!, at(args[0], args[1]), at(args[2], args[3]), q]);
        last = q;
      } else close();
    }
    close();
    pen += p.xAdvance * s;
    // Drop degenerate segments (a line from a point to itself).
    glyphs.push(
      out.map((c) =>
        c.filter((seg) => seg.length > 2 || Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > 1e-6)
      )
    );
  });
  return glyphs;
}

/** The segment at parameter t. */
function evalSeg(seg: Point[], t: number): Point {
  const u = 1 - t;
  if (seg.length === 2) return [seg[0][0] * u + seg[1][0] * t, seg[0][1] * u + seg[1][1] * t];
  if (seg.length === 3)
    return [0, 1].map((k) => u * u * seg[0][k] + 2 * u * t * seg[1][k] + t * t * seg[2][k]) as Point;
  return [0, 1].map(
    (k) => u * u * u * seg[0][k] + 3 * u * u * t * seg[1][k] + 3 * u * t * t * seg[2][k] + t * t * t * seg[3][k]
  ) as Point;
}

/** A contour as a closed polygon, its curves cut into chords no more than `tol` off them. */
export function flatten(contour: Contour, tol = 0.005): Point[] {
  const pts: Point[] = [];
  for (const seg of contour) {
    if (seg.length === 2) {
      pts.push(seg[0]);
      continue;
    }
    // Enough chords that the sag of each is under tol: sag ~ L^2 / (8 R).
    const span = seg.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - seg[i][0], q[1] - seg[i][1]), 0);
    const n = Math.max(2, Math.ceil(span / Math.sqrt(8 * tol * 0.5)));
    for (let i = 0; i < n; i++) pts.push(evalSeg(seg, i / n));
  }
  return pts;
}

/** The signed area: positive anticlockwise. */
export function area(poly: Point[]): number {
  return poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
}

/**
 * A polygon moved out by d away from the material, as a solid's faces offset
 * do (Onshape's, which the board was first drawn with): each side shifted by
 * d, neighbours meeting where they cross. `outward` is +1 where the
 * polygon's left is outside (a clockwise outline) and -1 for an
 * anticlockwise one.
 */
export function grow(poly: Point[], d: number, outward: number): Point[] {
  const n = poly.length;
  const normal = (a: Point, b: Point): Point => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(dx, dy);
    return [(-dy / l) * outward, (dx / l) * outward];
  };
  const out = poly.map((p, i) => {
    const n1 = normal(poly[(i - 1 + n) % n], p);
    const n2 = normal(p, poly[(i + 1) % n]);
    const m = [n1[0] + n2[0], n1[1] + n2[1]];
    const len = Math.hypot(m[0], m[1]);
    // The mitre: d over the cosine of half the turn between the two normals.
    const cos = (n1[0] * n2[0] + n1[1] * n2[1] + 1) / 2;
    const k = d / Math.sqrt(Math.max(cos, 0.05));
    return [p[0] + (m[0] / len) * k, p[1] + (m[1] / len) * k] as Point;
  });
  return untangle(out);
}

/** Where segments ab and cd cross, if they do. */
function crossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-15) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

/**
 * An offset outline with the little loops cut out that it folds into where
 * the outline turns tighter than the offset (the tip of a counter): where two
 * nearby sides cross, the stretch between them goes and the crossing joins them.
 */
function untangle(poly: Point[], reach = 40): Point[] {
  let p = poly;
  for (let pass = 0; pass < 1000; pass++) {
    const n = p.length;
    let cut: { i: number; j: number; x: Point } | null = null;
    for (let i = 0; i < n && !cut; i++)
      for (let k = 2; k <= Math.min(reach, n - 2) && !cut; k++) {
        const j = (i + k) % n;
        const x = crossing(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]);
        if (x) cut = { i, j, x };
      }
    if (!cut) return unspike(p);
    const { i, j, x } = cut;
    // Keep p[j+1 .. i] (wrapping), then the crossing.
    const kept: Point[] = [];
    for (let m = (j + 1) % n; ; m = (m + 1) % n) {
      kept.push(p[m]);
      if (m === i) break;
    }
    kept.push(x);
    p = kept;
  }
  return p;
}

/**
 * An outline with its hairpins taken out: a point the outline runs out to
 * and straight back from, which a cut loop can leave where its two sides
 * lay along one line and so never crossed.
 */
function unspike(poly: Point[]): Point[] {
  let p = poly;
  for (let changed = true; changed && p.length > 3; ) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length];
      const b = p[(i + 1) % p.length];
      const u = [p[i][0] - a[0], p[i][1] - a[1]];
      const v = [b[0] - p[i][0], b[1] - p[i][1]];
      const lu = Math.hypot(u[0], u[1]);
      const lv = Math.hypot(v[0], v[1]);
      if (lu < 1e-9 || lv < 1e-9 || (u[0] * v[0] + u[1] * v[1]) / (lu * lv) < -0.99) {
        p = p.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return p;
}

/** The box round a set of contours. */
export function box(contours: Contour[]): [Point, Point] {
  const pts = contours.flatMap((c) => flatten(c, 0.001));
  return [
    [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
    [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
  ];
}

/** Draw contours into the open sketch, each point through `place`. */
export function drawContours(contours: Contour[], place: (p: Point) => Point): void {
  for (const c of contours)
    for (const seg of c) {
      const q = seg.map(place);
      if (q.length === 2) line(q[0], q[1]);
      else bezier(...q);
    }
}

/** Draw closed polygons into the open sketch. */
export function drawPolygons(polys: Point[][], place: (p: Point) => Point): void {
  for (const poly of polys) {
    const q = poly.map(place);
    q.forEach((p, i) => line(p, q[(i + 1) % q.length]));
  }
}
