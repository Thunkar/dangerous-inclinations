// The die's stand: one per counter, hull and fuel, the counter's icon on
// top. The die's bottom face drops into a pocket the die's own shape (its
// face, and its neighbours' faces as they rise, all grown by half the
// clearance; they lean out, so a square-walled kite would catch them), and a
// 10x3 magnet lies flat under the pocket floor, sealed, under the die's
// centre, where the die's loose ball comes to rest over it. It is loaded
// from the bed into a slot with a flat roof (a 10.2 bridge) and a plug
// printed apart is glued in behind it, flush with the bed.
//
// The fuel stand's floor carries a 0, read when the empty tank's die is
// lifted off: an inlay pocket for the board's own 0 (lib/numbers.ts). The
// kite has no room for it beside the magnet, so it sits over it and that
// floor is the inlay's depth thicker: the fuel stand stands that much taller
// and its magnet that much lower; both take the same plug.
//
// The stand is a chamfered slab, a kite plinth: the pocket's rim grown and
// stretched over the icon, inlaid on top past the pocket's long tail (the one
// place the die does not overhang). The icon, the 0 and the die's numbers are
// one set of inlays printed apart in the die's accent (`buildInlaySet`): the
// icon grown by `iconGrow` so its thinnest stroke prints as a piece, its
// pocket by the numbers' clearance on top of that.
import { subtract, color, sketch, plane, extrude } from "fluidcad/core";
import { Vector3 } from "three";
import { BOARD, DICE, MOUNT } from "../../spec.ts";
import { TABLE } from "../../../ui/src/design/tokens.ts";
import { iconLoops } from "../../lib/icons.ts";
import { box, drawContours, drawPolygons, grow as offset, area as signedArea } from "../../lib/glyphs.ts";
import { numberContours, numberPockets } from "../../lib/numbers.ts";
import { prism, move, disc, block, grow, distinct, type Point, type Solid } from "../../lib/solids.ts";
import { chamferedSlab, regular } from "../markers/common.ts";
import { cutGlyph, type Element } from "../markers/glyphs.ts";
import { die, beyond, restingFrame, buildDie, buildDieInlays, buildDieNumbers } from "./d10.ts";

export type Counter = "hull" | "fuel";
const ICON = { hull: "damage", fuel: "fuel" } as const;

/** The magnet slot's roof, the pocket floor and the stand's top, from the bed. */
export function heights(counter: Counter) {
  const s = DICE.stand;
  const roof = s.plug + s.magnet.thickness + MOUNT.magnetClearance;
  const floor = roof + s.seal + (counter === "fuel" ? BOARD.number.depth : 0);
  return { roof, floor, top: floor + s.pocketDepth };
}

/** A plane n . p = c in the stand's frame. */
interface Plane {
  n: Vector3;
  c: number;
}

/**
 * The die standing on z = floor (stand.ts's frame: its pole along +x, the
 * ball over the origin): the bottom face's kite on the floor, and every
 * other face's plane pushed out by half the clearance. Every face's
 * neighbourhood is the same up to a mirror in x, so any face will do.
 */
function seat(floor: number): { kite: Point[]; planes: Plane[] } {
  const d = die();
  const m = restingFrame(10, floor, d);
  const bottom = d.faces.find((f) => f.value === 1)!;
  const kite = [bottom.tip, bottom.sides[0], bottom.pole, bottom.sides[1]].map((p): Point => {
    const q = p.clone().applyMatrix4(m);
    return [q.x, q.y];
  });
  const planes = d.faces
    .filter((f) => f !== bottom)
    .map((f) => {
      const n = f.n.clone().transformDirection(m);
      const at = f.n.clone().multiplyScalar(d.inradius).applyMatrix4(m);
      return { n, c: n.dot(at) + DICE.stand.clearance / 2 };
    });
  return { kite: anticlockwise(kite), planes };
}

const area = (p: Point[]) => p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0) / 2;
const anticlockwise = (p: Point[]) => (area(p) >= 0 ? p : [...p].reverse());

/** A polygon cut by a plane's trace at height z, keeping n . p <= c. */
function clip(poly: Point[], { n, c }: Plane, z: number): Point[] {
  const side = ([x, y]: Point) => n.x * x + n.y * y + n.z * z - c;
  const out: Point[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const [a, b] = [side(p), side(q)];
    if (a <= 0) out.push(p);
    if (a * b < 0) {
      const t = a / (a - b);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out;
}

/** The pocket: its floor's footprint, and its rim at the stand's top (wider: the die's faces lean out). */
export function pocket(counter: Counter) {
  const { floor, top } = heights(counter);
  const { kite, planes } = seat(floor);
  const around = grow(kite, 3);
  return { kite, planes, around, rim: planes.reduce((p, pl) => clip(p, pl, top), around) };
}

/** The convex hull of a set of points, anticlockwise. */
function hull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const h: Point[] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

/** The icon's centre: past the rim's tail by the gap. */
function iconAt(rim: Point[]): Point {
  const { icon, iconGap } = DICE.stand;
  return [Math.max(...rim.map((p) => p[0])) + iconGap + icon / 2, 0];
}

/** What the outline must hold: the rim and the icon's square, each grown by the rim's wall. */
function held(rim: Point[]): Point[] {
  const { icon, rim: wall } = DICE.stand;
  const [x, y] = iconAt(rim);
  const square = regular(4, icon / Math.SQRT2, 45).map(([u, v]): Point => [x + u, y + v]);
  return [...grow(rim, wall), ...grow(square, wall)];
}

/** The stand's outline: everything it holds, wrapped. */
export function outline(counter: Counter): Point[] {
  return hull(held(pocket(counter).rim));
}

/** Is p inside the loop (even-odd)? */
function within(loop: Point[], [x, y]: Point): boolean {
  let odd = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
  }
  return odd;
}

/**
 * Loops as filled regions, each cut on its own: a cut by solids that do not
 * touch cuts nothing. A loop inside an even number of others is an outline,
 * and the loops one deeper inside it are its holes.
 */
function regions(loops: Point[][]): Element[] {
  const depth = loops.map((l, i) => loops.filter((o, j) => j !== i && within(o, l[0])).length);
  return loops
    .map((outer, i) => ({ outer, i }))
    .filter(({ i }) => depth[i] % 2 === 0)
    .map(({ outer, i }) => ({
      outer,
      holes: loops.filter((h, j) => depth[j] === depth[i] + 1 && within(outer, h[0])),
    }));
}

/** Turn a point a quarter turn anticlockwise: what reads up reads toward -x, as the top face's number does. */
const quarter = ([x, y]: Point): Point => [-y, x];

export function buildStand(counter: Counter): Solid {
  const { roof, floor, top } = heights(counter);
  const { chamfer, pocketDepth } = DICE.stand;
  let s = chamferedSlab(outline(counter), top, chamfer);
  // The pocket: a slab over the floor cut by every face plane that reaches it.
  const { planes, around, rim } = pocket(counter);
  let tool = move(prism(around, pocketDepth + 1), 0, 0, floor);
  for (const pl of planes) {
    const corners = around.flatMap(([x, y]) => [floor, top + 1].map((z) => pl.n.x * x + pl.n.y * y + pl.n.z * z));
    if (Math.max(...corners) > pl.c) tool = subtract(tool, beyond(pl.n, pl.n.clone().multiplyScalar(pl.c)));
  }
  s = subtract(s, tool);
  // The magnet's slot, from the bed to its flat roof.
  s = subtract(s, move(disc(DICE.stand.magnet.diameter + MOUNT.magnetClearance, roof + 1), 0, 0, -1));
  const [ix, iy] = iconAt(rim);
  const at = (e: Element): Element => ({ outer: e.outer.map(([x, y]) => [x + ix, y + iy]), holes: e.holes.map((h) => h.map(([x, y]) => [x + ix, y + iy])) });
  s = cutGlyph(s, iconRegions(counter, DICE.stand.iconGrow + BOARD.number.clearance).map(at), top - BOARD.number.depth, top + 1);
  if (counter === "fuel") {
    // The board's 0, its box centred over the magnet.
    const [lo, hi] = box(numberContours("0"));
    const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    for (const glyph of numberPockets("0"))
      s = cutGlyph(s, regions(glyph.map((poly) => poly.map(([x, y]) => quarter([x - cx, y - cy])))), floor - BOARD.number.depth, floor + 1);
  }
  return s;
}

/**
 * The stand's icon as filled regions, read the way the stand's top reads,
 * centred on the origin, every edge moved `d` away from the icon's material.
 */
function iconRegions(counter: Counter, d: number): Element[] {
  // A traced outline can cross itself where the tracer started (damage's
  // does); offset by nothing, it comes back untangled.
  const loops = iconLoops(ICON[counter], DICE.stand.icon).map((l) => offset(distinct(l), 0, 1).map(quarter));
  const depth = loops.map((l, i) => loops.filter((o, j) => j !== i && within(o, l[0])).length);
  // An outline's material is its inside and a hole's its outside: grow each away from it.
  const grown = loops.map((l, i) => offset(l, d, signedArea(l) > 0 === (depth[i] % 2 === 1) ? 1 : -1));
  return regions(grown);
}

/** The plug that closes a stand's magnet slot: the slot's section less the fit all round, its length less the fit. */
export function buildPlug(side = DICE.stand.plugFit): Solid {
  return disc(DICE.stand.magnet.diameter + MOUNT.magnetClearance - 2 * side, DICE.stand.plug - MOUNT.plugFit.length);
}

/** The fits `coupons/stand-plug` tries, one to four notches. */
export const PLUG_FITS = [0.1, 0.05, 0, -0.05];

/**
 * The plug fit test piece: a block with the stand's magnet slot, cut from the
 * bed as the stand cuts it, and a plug at each of `PLUG_FITS` beside it, its
 * notches across its top. The fit that slides in snug and holds goes into
 * `DICE.stand.plugFit`.
 */
export function buildPlugCoupon(): void {
  const slot = DICE.stand.magnet.diameter + MOUNT.magnetClearance;
  const { roof } = heights("hull");
  const side = slot + 6;
  const holder = subtract(block([0, 0, 0], [side, side, roof + 1]), move(disc(slot, roof + 1), side / 2, side / 2, -1));
  const t = DICE.stand.plug - MOUNT.plugFit.length;
  const plugs = PLUG_FITS.map((fit, i) => {
    let plug = move(buildPlug(fit), side + 6 + i * (slot + 3), side / 2, 0);
    const x = side + 6 + i * (slot + 3);
    for (let k = 0; k <= i; k++) {
      const y = side / 2 - 2.25 + k * 1.5;
      plug = subtract(plug, block([x - 4, y, t - 0.4], [x + 4, y + 0.6, t + 1]));
    }
    return plug;
  });
  void [holder, ...plugs];
}

/**
 * A die's inlays, printed flat in its accent: its numbers 1 to 10, and below
 * them its stand's icon (and the fuel stand's 0). Each is a solid of its own.
 */
export function buildInlaySet(counter: Counter): void {
  buildDieNumbers();
  const row = -2 * 14 - 2;
  for (const e of iconRegions(counter, DICE.stand.iconGrow)) {
    sketch(plane("xy"), () => drawPolygons([e.outer, ...e.holes], ([x, y]): Point => [x + DICE.stand.icon / 2, y + row]));
    extrude(BOARD.number.depth).new();
  }
  if (counter === "fuel") {
    const contours = numberContours("0");
    const [lo, hi] = box(contours);
    sketch(plane("xy"), () => drawContours(contours, ([x, y]): Point => [x - (lo[0] + hi[0]) / 2 + 14 + DICE.stand.icon / 2, y - (lo[1] + hi[1]) / 2 + row]));
    extrude(BOARD.number.depth).new();
  }
}

/** The 0 inlaid in the fuel stand's floor (viewer only). */
export function buildZeroInlay(): Solid {
  const contours = numberContours("0");
  const [lo, hi] = box(contours);
  const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const floor = heights("fuel").floor;
  sketch(plane("xy", { offset: floor - BOARD.number.depth + 0.02 }), () => drawContours(contours, ([x, y]) => quarter([x - cx, y - cy])));
  return extrude(BOARD.number.depth).new();
}

/** A stand with its die on it and their inlays, `top` showing, at `at`; `top` null leaves the die off (viewer only). */
export function showOnStand(counter: Counter, top: number | null, at: Point = [0, 0]): void {
  const [x, y] = at;
  const accent = ACCENT[counter];
  color(BODY_COLOUR, move(buildStand(counter), x, y, 0));
  const { top: z } = heights(counter);
  const [ix, iy] = iconAt(pocket(counter).rim);
  for (const e of iconRegions(counter, DICE.stand.iconGrow)) {
    sketch(plane("xy", { offset: z - BOARD.number.depth + 0.02 }), () => drawPolygons([e.outer, ...e.holes], ([u, v]): Point => [u + ix + x, v + iy + y]));
    color(accent, extrude(BOARD.number.depth).new());
  }
  if (counter === "fuel") color(accent, move(buildZeroInlay(), x, y, 0));
  if (top === null) return;
  const floor = heights(counter).floor;
  for (const half of buildDie(top, floor)) color(BODY_COLOUR, move(half, x, y, 0));
  for (const inlay of buildDieInlays(top, floor)) color(accent, move(inlay, x, y, 0));
}

/**
 * The viewer's colours: the dice and stands black, each die's inlays in its
 * counter's colour on the table (cad/colours.ts reads the same; it is not
 * imported here, since its planets pull the engine into the CAD server).
 */
const BODY_COLOUR = "#2b2b2d";
const ACCENT: Record<Counter, string> = { hull: TABLE.hull, fuel: TABLE.fuel };
