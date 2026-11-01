// The salvo tokens: one token for a salvo of 1 to 4 missiles, which fly
// together until they hit, are shot down or run out of flight; a rack that
// shoots some down swaps it for the token of what is left. The 1 is the
// missile token (missile.ts). Each player has 3 of each size, in their
// colour, for up to three salvos in the air (three launchers' magazines).
//
// A salvo lies abreast: N missiles side by side, fins overlapping, on a bar
// across their tails, so the count reads at a glance from across the table.
// It lies nose prograde (+x) as the missile token does, and the 4 fits a
// black hole ring 1 sector (`fit`: 0.89 clear). The designer chose this look
// over a dart with the count engraved and a formation on a plate, whose 4
// fitted only turned across the ring.
import { fuse, subtract, color } from "fluidcad/core";
import { BOARD } from "../spec.ts";
import { prism, move, type Point, type Solid } from "../lib/solids.ts";
import { slab, type Plan } from "./token.ts";
import { MISSILE, missilePlan, buildMissileToken } from "./missile.ts";
import { chamferedSlab } from "./markers/common.ts";
import { wellOf } from "./well.ts";

export const SALVO = {
  /** Missile to missile (the fins, 3.8 across, overlap), and the tail bar's length, height and reach behind the tails. */
  pitch: 3.6,
  bar: { length: 1.8, height: 2, behind: 1.4 },
  /** Salvos a player has of each size. */
  each: 3,
};

/** Each missile's offset across the salvo. */
const abreast = (n: number): Point[] => Array.from({ length: n }, (_, i): Point => [0, (i - (n - 1) / 2) * SALVO.pitch]);

/** A plan moved by (x, y). */
const shifted = ({ pts, chamfered }: Plan, [x, y]: Point): Plan => ({ pts: pts.map(([u, v]): Point => [u + x, v + y]), chamfered });

/** The missile plan's tail: its rearmost x. */
const tail = () => Math.min(...missilePlan().pts.map((p) => p[0]));

/** The convex hull of points, anticlockwise. */
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

/** The tail bar of an abreast salvo: across every missile's tail, reaching `behind` past it. */
function barOutline(n: number): Point[] {
  const { length, behind } = SALVO.bar;
  const x0 = tail() - behind;
  const half = ((n - 1) / 2) * SALVO.pitch + 1.2;
  return [
    [x0, -half],
    [x0 + length, -half],
    [x0 + length, half],
    [x0, half],
  ];
}

/** The token's footprint, for fitting it in a sector and sizing its bin: the hull of everything it is. */
export function footprint(n: number): Point[] {
  const plan = missilePlan().pts;
  if (n === 1) return hull(plan);
  return hull([...abreast(n).flatMap((o) => plan.map(([x, y]): Point => [x + o[0], y + o[1]])), ...barOutline(n)]);
}

/** The token in plan, nose +x: each missile's outline, and the tail bar's for two or more. */
export function salvoOutlines(n: number): Point[][] {
  const plan = missilePlan().pts;
  const missiles = abreast(n).map((o) => plan.map(([x, y]): Point => [x + o[0], y + o[1]]));
  return n === 1 ? missiles : [...missiles, barOutline(n)];
}

/** A salvo token of n missiles, nose +x, on the bed: the missile token for one. */
export function buildSalvo(n: number): Solid {
  if (n === 1) return buildMissileToken();
  const { thickness: t, chamfer: c } = MISSILE;
  const missiles = abreast(n).map((o) => slab(shifted(missilePlan(), o), t, c));
  const bar = chamferedSlab(barOutline(n), SALVO.bar.height, c);
  return fuse(bar, ...missiles);
}

// ---- The ring 1 sector -------------------------------------------------------

/** Black hole ring 1's sector floor: between the rims' wall feet and the sector edges' (half a foot each side). */
export function sector() {
  const w = wellOf("blackHole");
  const foot = BOARD.wall.foot;
  const span = (2 * Math.PI) / BOARD.sectors;
  return { r0: w.inner[0] + foot, r1: w.outer[0] - foot, inner: w.inner[0], outer: w.outer[0], span, edge: foot / 2 };
}

/**
 * How well a footprint fits the sector floor nose prograde, along the ring:
 * the largest least clearance to its walls over where it sits across the
 * ring, and that place. The sector's middle points along +y, its centre on
 * the ring's centre line at the origin; `turns` (degrees) tries others.
 */
export function fit(pts: Point[], turns: number[] = [0]): { clearance: number; r: number; turn: number } {
  const s = sector();
  const half = s.span / 2;
  const rc = (s.inner + s.outer) / 2;
  let best = { clearance: -Infinity, r: rc, turn: 0 };
  for (const deg of turns) {
    const a = (deg * Math.PI) / 180;
    const turned = pts.map(([x, y]): Point => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
    for (let r = s.r0; r <= s.r1; r += 0.1) {
      let least = Infinity;
      for (const [x, y] of turned) {
        // In the well: the sector's middle along +y at radius r.
        const [px, py] = [x, y + r];
        const rr = Math.hypot(px, py);
        const th = Math.atan2(px, py);
        least = Math.min(least, rr - s.r0, s.r1 - rr, rr * Math.sin(half - th) - s.edge, rr * Math.sin(half + th) - s.edge);
      }
      if (least > best.clearance) best = { clearance: least, r, turn: deg };
    }
  }
  return { ...best, r: best.r - rc };
}

/** The sector as a shallow piece for the sheet: its floor and the walls round it, centred as `fit` puts it. */
export function buildSector(): Solid {
  const s = sector();
  const rc = (s.inner + s.outer) / 2;
  const half = s.span / 2;
  const arc = (r: number, a0: number, a1: number, k = 12): Point[] =>
    Array.from({ length: k + 1 }, (_, i): Point => {
      const a = a0 + ((a1 - a0) * i) / k;
      return [r * Math.sin(a), r * Math.cos(a) - rc];
    });
  const outer = [...arc(s.inner, -half, half), ...arc(s.outer, half, -half)];
  // The floor: the rims' feet in, and the edges' half feet (an angle at each radius, close enough at this size).
  const da = (r: number) => s.edge / r;
  const floor = [...arc(s.r0, -half + da(s.r0), half - da(s.r0)), ...arc(s.r1, half - da(s.r1), -half + da(s.r1))];
  return subtract(prism(outer, 1 + BOARD.wall.height), move(prism(floor, 3), 0, 0, 1));
}

/** A row of four sectors, a salvo of 1 to 4 in each, nose prograde (viewer only). */
export function showSalvoRow([ox, oy]: Point, colour: string, pitch = 26): void {
  for (let n = 1; n <= 4; n++) {
    const x = ox + (n - 1) * pitch;
    color("#3a3a40", move(buildSector(), x, oy, 0));
    color(colour, move(buildSalvo(n), x, oy + fit(footprint(n)).r, 1.02));
  }
}
