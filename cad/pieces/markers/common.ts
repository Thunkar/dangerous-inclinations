// Shared shapes for the markers and item tokens: the chamfered slab of
// `token.ts` for any outline, the outlines the pieces use, and a lathe for
// round pieces.
import { sketch, revolve } from "fluidcad/core";
import { slab, type Plan } from "../token.ts";
import { outline, type Point, type Solid } from "../../lib/solids.ts";

/** A plan with every side chamfered, from points in either order (made clockwise). */
function plan(pts: Point[]): Plan {
  const a = pts.reduce((s, [x, y], i) => {
    const [u, v] = pts[(i + 1) % pts.length];
    return s + x * v - u * y;
  }, 0);
  const cw = a < 0 ? pts : [...pts].reverse();
  return { pts: cw, chamfered: cw.map(() => true) };
}

/** A slab of the outline, t thick, every side chamfered d top and bottom. */
export function chamferedSlab(pts: Point[], t: number, d: number): Solid {
  return slab(plan(pts), t, d);
}

/** A regular n-gon, circumradius r, its first corner at `deg`. */
export function regular(n: number, r: number, deg = 90): Point[] {
  return Array.from({ length: n }, (_, i): Point => {
    const a = ((deg + (i * 360) / n) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

/** A rectangle w x h centred on the origin, its corners clipped by c. */
export function clippedRect(w: number, h: number, c: number): Point[] {
  const [x, y] = [w / 2, h / 2];
  return [
    [x - c, y],
    [x, y - c],
    [x, -y + c],
    [x - c, -y],
    [-x + c, -y],
    [-x, -y + c],
    [-x, y - c],
    [-x + c, y],
  ];
}

/** A closed [radius, z] profile turned round z. */
export function lathe(profile: Point[]): Solid {
  sketch("xz", () => outline(profile));
  return revolve("z").new();
}
