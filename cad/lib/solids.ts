// Small solid builders over FluidCAD. Every tool is built on the XY plane
// and pulled along +z, then moved into place, so no part file has to know
// which way a named sketch plane faces. Every solid is built `.new()` and
// joined by an explicit fuse or subtract: FluidCAD fuses touching solids in a
// part on its own, and a solid fused that way cannot be fused again.
import { sketch, line, extrude, cylinder, translate, rotate } from "fluidcad/core";
import type { ISceneObject } from "fluidcad/core";

export type Solid = ISceneObject;
export type Point = [number, number];
export type Vec = [number, number, number];
export type Axis = "x" | "y" | "z";

/** A closed polygon on z = 0, pulled up by `height`, as a solid of its own. */
export function prism(points: Point[], height: number): Solid {
  sketch("xy", () => {
    points.forEach((p, i) => line(p, points[(i + 1) % points.length]));
  });
  return extrude(height).new();
}

/** An axis-aligned box from [x0, y0, z0] to [x1, y1, z1]. */
export function block([x0, y0, z0]: Vec, [x1, y1, z1]: Vec): Solid {
  const b = prism(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    z1 - z0
  );
  return z0 ? translate(0, 0, z0, b) : b;
}

/** A disc of diameter d and thickness t along +z from z = 0. */
export function disc(d: number, t: number): Solid {
  return cylinder(d / 2, t);
}

/**
 * A convex polygon grown outward by d (every edge moved out, corners
 * mitred). Points run anticlockwise.
 */
export function grow(points: Point[], d: number): Point[] {
  const n = points.length;
  const edges = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const len = Math.hypot(dx, dy);
    return { p: [p[0] + (dy / len) * d, p[1] - (dx / len) * d], dir: [dx / len, dy / len] };
  });
  return edges.map((e, i) => {
    const prev = edges[(i - 1 + n) % n];
    // Intersect prev's line with e's line.
    const [x1, y1] = prev.p;
    const [dx1, dy1] = prev.dir;
    const [x2, y2] = e.p;
    const [dx2, dy2] = e.dir;
    const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / (dx1 * dy2 - dy1 * dx2);
    return [x1 + dx1 * t, y1 + dy1 * t];
  });
}

/** Move a solid; returns the moved solid. */
export const move = (solid: Solid, x: number, y: number, z: number): Solid =>
  translate(x, y, z, solid);

/** Turn a solid about a world axis through the origin, in degrees. */
export const turn = (solid: Solid, axis: Axis, degrees: number): Solid =>
  rotate(axis, degrees, solid);

/** A closed polygon in the y-z plane, given as [y, z] points, pulled along +x from x = 0. */
export function section(points: Point[], length: number): Solid {
  const solid = prism(
    points.map(([y, z]) => [z, y]),
    length
  );
  // Sketch (a, b) at height h turns to (x, y, z) = (-h, b, a).
  return move(turn(solid, "y", -90), length, 0, 0);
}

/** A V along y from y0 to y1: `width` across at z = 0, its point `depth` below. */
export function vee(width: number, depth: number, y0: number, y1: number): Solid {
  const v = prism(
    [
      [-width / 2, 0],
      [width / 2, 0],
      [0, depth],
    ],
    y1 - y0
  );
  // Sketch (a, b) at height h turns to (x, y, z) = (a, h, -b).
  return move(turn(v, "x", -90), 0, y0, 0);
}
