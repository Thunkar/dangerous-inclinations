// The mission glyphs (ui/src/components/common/
// MissionGlyph.tsx) as outlines a sketch can draw. The glyphs are JSX with
// relative SVG paths, transforms and one stroke, which `lib/icons.ts` does
// not read, so their path data is copied here verbatim and turned into
// elements: each element is one filled region (an outer loop and the holes
// in it), cut or fused one at a time, since overlapping loops in one sketch
// would read as even-odd and a cut by solids that do not touch cuts nothing.
import { subtract } from "fluidcad/core";
import { prism, move, type Point, type Solid } from "../../lib/solids.ts";

/** One filled region: its outer loop and the holes in it, glyph units (64 box, y down). */
export interface Element {
  outer: Point[];
  holes: Point[][];
}

/** Parse an SVG path (M L H V Z, absolute and relative, implicit repeats) into closed loops. */
function loops(d: string): Point[][] {
  const tok = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+/g) ?? [];
  const out: Point[][] = [];
  let loop: Point[] = [];
  let pen: Point = [0, 0];
  let start: Point = [0, 0];
  let cmd = "";
  let i = 0;
  const num = () => Number(tok[i++]);
  const close = () => {
    if (loop.length > 2) out.push(loop);
    loop = [];
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        close();
        const [x, y] = [num(), num()];
        pen = rel ? [pen[0] + x, pen[1] + y] : [x, y];
        start = pen;
        loop = [pen];
        cmd = rel ? "l" : "L"; // further pairs are line-tos
        break;
      }
      case "L": {
        const [x, y] = [num(), num()];
        pen = rel ? [pen[0] + x, pen[1] + y] : [x, y];
        loop.push(pen);
        break;
      }
      case "H": {
        const x = num();
        pen = [rel ? pen[0] + x : x, pen[1]];
        loop.push(pen);
        break;
      }
      case "V": {
        const y = num();
        pen = [pen[0], rel ? pen[1] + y : y];
        loop.push(pen);
        break;
      }
      case "Z":
        close();
        pen = start;
        break;
    }
  }
  close();
  return out;
}

const area = (p: Point[]) => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0) / 2;
const rot = (deg: number, [cx, cy]: Point) => ([x, y]: Point): Point => {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [x - cx, y - cy];
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** An even-odd path: its biggest loop is the outer, the rest holes in it. */
function evenOdd(d: string, map = (p: Point) => p): Element {
  const ls = loops(d).map((l) => l.map(map));
  ls.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  return { outer: ls[0], holes: ls.slice(1) };
}
/** A nonzero path whose loops do not nest: each loop its own element. */
function solidLoops(d: string, map = (p: Point) => p): Element[] {
  return loops(d).map((l) => ({ outer: l.map(map), holes: [] }));
}
/** A stroked segment, `w` wide, as a rectangle. */
function stroke(a: Point, b: Point, w: number): Element {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [nx, ny] = [(-(b[1] - a[1]) / l) * (w / 2), ((b[0] - a[0]) / l) * (w / 2)];
  return { outer: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], holes: [] };
}

// ---- The glyphs, path data verbatim from MissionGlyph.tsx -----------------

const BONE = "M7 50l4-3h42l4 3-4 3H11z";
const SIGNAL = [0, 1, 2].map((step): [Point, Point] => {
  const x = 30 + (step * 7 * 7) / 14.765;
  const y = 16 - (step * 7 * 13) / 14.765;
  return [[x, y], [x + 13, y + 7]];
});

export const GLYPHS = {
  /** Deliver's crate alone (the glyph's first path: the isometric box). */
  crate: (): Element[] => [
    evenOdd("M18 17l14 7v16l-14 7-14-7V24zM16.7 31h2.6v15h-2.6zM17.9 29.9L6.6 24.2 5.4 26.6l11.3 5.7zM18.1 29.9l11.3-5.7 1.2 2.4-11.3 5.7z"),
  ],
  /** Piracy: the skull and the crossed bones. */
  piracy: (): Element[] => [
    evenOdd(
      "M24 2h16l10 10v13l-8 6v7H22v-7l-8-6V12zM21 11h6l3 5-3 7h-6l-3-7zM43 11h-6l-3 5 3 7h6l3-7zM32 24l5 7H27zM26 33h2.5v5H26zM31 33h2.5v5H31zM36 33h2.5v5H36z"
    ),
    ...[18, -18].flatMap((t) => solidLoops(BONE, rot(t, [32, 50]))),
  ],
  /** Escort: the shield's rim and the hull inside it. */
  escort: (): Element[] => [evenOdd("M8 5h48v25L32 60 8 30zM13 10v18.2L32 52l19-23.8V10z"), ...solidLoops("M32 15l8 22-8-5.5-8 5.5z")],
  /** Intercept: the dish (turned 30 about 30,30), the mast and foot, the three signal bars. */
  intercept: (): Element[] => [
    ...solidLoops("M13 24h34l-8 12H21z", rot(30, [30, 30])),
    // The mast and its foot touch: one outline.
    { outer: [[24, 34], [31, 34], [31, 55], [37, 55], [37, 60], [17, 60], [17, 55], [24, 55]], holes: [] },
    ...SIGNAL.map(([a, b]) => stroke(a, b, 4)),
  ],
  /** Destroy's hull alone (the ship in its gunsight): the game's mark for a ship. */
  hull: (): Element[] => solidLoops("M32 14l15 37-15-9-15 9z"),
};
export type GlyphName = keyof typeof GLYPHS;

/** The glyph's box in glyph units. */
function bounds(els: Element[]): [Point, Point] {
  const all = els.flatMap((e) => e.outer);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

/**
 * The glyph in mm, its box's longer side `size`, centred on `at`, y up,
 * turned `deg`; `mirror` flips x (for a face printed on the bed, read from below).
 */
export function placed(name: GlyphName, size: number, at: Point = [0, 0], opts: { deg?: number; mirror?: boolean } = {}): Element[] {
  const els = GLYPHS[name]();
  const [lo, hi] = bounds(els);
  const k = size / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const a = ((opts.deg ?? 0) * Math.PI) / 180;
  const f = ([x, y]: Point): Point => {
    const u = (x - cx) * k * (opts.mirror ? -1 : 1);
    const v = (cy - y) * k;
    return [at[0] + u * Math.cos(a) - v * Math.sin(a), at[1] + u * Math.sin(a) + v * Math.cos(a)];
  };
  return els.map((e) => ({ outer: e.outer.map(f), holes: e.holes.map((h) => h.map(f)) }));
}

/** One element as a solid from z0 to z1. */
export function elementSolid(e: Element, z0: number, z1: number): Solid {
  let s = move(prism(e.outer, z1 - z0), 0, 0, z0);
  for (const h of e.holes) s = subtract(s, move(prism(h, z1 - z0 + 2), 0, 0, z0 - 1));
  return s;
}

/** Cut each element into `solid` from z0 to z1, one at a time. */
export function cutGlyph(solid: Solid, els: Element[], z0: number, z1: number): Solid {
  for (const e of els) solid = subtract(solid, elementSolid(e, z0, z1));
  return solid;
}

