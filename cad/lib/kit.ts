// The game's ship, rebuilt as solids. Every mesh the yard draws carries a
// description of the solid it is (ui/src/ships/solid.ts); this builds each
// one in FluidCAD and puts it where the game puts it, in the print's frame.
import {
  sketch,
  translate,
  circle,
  loft,
  plane,
  revolve,
  cylinder,
  mirror,
  remove,
  fuse,
  subtract,
} from "fluidcad/core";
import { Euler, Matrix4, Vector3 } from "three";
import type { PlacedSolid, SolidSpec } from "../../ui/src/ships/solid.ts";
import { PRINT } from "../spec.ts";
import { prism, move, turn, outline, distinct, grow, type Point, type Solid } from "./solids.ts";

/**
 * The game's frame to the print's, in mm: the game is +X bow, +Y dorsal, Z
 * across with port at -Z; the print stands the same ship belly down with +Z
 * up, which is a quarter turn about x (port to +y), scaled to mm and lifted
 * so `bed` (game y) sits at z = 0. A rotation, not a swap of axes: a swap
 * would print the ship's mirror image.
 */
export function printFrame(bed: number, mmPerUnit = PRINT.mmPerUnit): Matrix4 {
  return new Matrix4()
    .makeScale(mmPerUnit, mmPerUnit, mmPerUnit)
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(0, -bed, 0));
}

const EPS = 1e-6;

/** Build `spec` in its own frame with every length multiplied by f (mm per unit). */
export function buildSpec(spec: SolidSpec, f: number): Solid | null {
  switch (spec.kind) {
    case "box": {
      const [x, y, z] = spec.size.map((n) => (n * f) / 2);
      return move(
        prism(
          [
            [-x, -y],
            [x, -y],
            [x, y],
            [-x, y],
          ],
          2 * z
        ),
        0,
        0,
        -z
      );
    }
    case "cylinder":
      return alongY(
        frustum(spec.bottom * f, spec.top * f, spec.height * f, spec.sides, spec.thetaStart),
        spec.height * f
      );
    case "torus": {
      sketch("xz", () => {
        circle([spec.radius * f, 0], 2 * spec.tube * f);
      });
      return revolve("z").new();
    }
    case "extrude": {
      const bevel = spec.bevel?.thickness ?? 0;
      const scaled = (ring: [number, number][]): Point[] => ring.map(([a, b]) => [a * f, b * f]);
      const height = (spec.depth + 2 * bevel) * f;
      let s = prism(scaled(spec.outline), height);
      for (const hole of spec.holes)
        s = subtract(s, move(prism(scaled(hole), height + 2), 0, 0, -1));
      return bevel ? move(s, 0, 0, -bevel * f) : s;
    }
    case "loft":
      return lofted(spec.stations, f);
    case "hollow": {
      const rake = spec.rake;
      const outer = lofted(
        [
          [spec.x0, ...spec.outer0],
          [spec.x1, ...spec.outer1],
        ],
        f,
        rake
      );
      const run = 0.02 * (spec.x1 - spec.x0);
      const inner = lofted(
        [
          [spec.x0 - run, ...spec.inner0],
          [spec.x1 + run, ...spec.inner1],
        ],
        f,
        rake && { ...rake, fromX: rake.fromX - run }
      );
      return subtract(outer, inner);
    }
    case "lathe": {
      const profile = spec.profile.map(([r, y]): Point => [Math.max(r, 0) * f, y * f]);
      sketch("xy", () => outline(profile));
      return revolve("y").new();
    }
    case "detail":
      return null;
  }
}

/** A frustum along +z from 0 to h: round with many sides, a faceted prism with few. */
function frustum(bottom: number, top: number, h: number, sides: number, thetaStart: number): Solid {
  if (sides >= 10 && Math.abs(top - bottom) < EPS) return cylinder(bottom, h);
  // three puts a vertex at x = r sin a, z = r cos a; once turned to run along
  // y (alongY), the sketch's y is three's -z.
  const ring = (r: number): Point[] =>
    Array.from({ length: sides >= 10 ? 48 : sides }, (_, i) => {
      const a = thetaStart + (i * 2 * Math.PI) / (sides >= 10 ? 48 : sides);
      return [r * Math.sin(a), -r * Math.cos(a)];
    });
  if (Math.abs(top - bottom) < EPS) return prism(ring(bottom), h);
  const at = (z: number, r: number) =>
    sketch(plane("xy", { offset: z }), () => {
      outline(r > EPS ? ring(r) : ring(EPS * 10));
    });
  return loft(at(0, bottom), at(h, top)).new();
}

/** A solid built along +z from 0 to h, turned to run along y and centred, as three's cylinder. */
function alongY(solid: Solid, h: number): Solid {
  // A turn of -90 about x takes +z to +y.
  return move(turn(solid, "x", -90), 0, -h / 2, 0);
}

/**
 * `armoredSection` (ui/src/ships/loft.ts) as a solid: stations [x, h, w, lift?]
 * along x. With `rake`, a station at or ahead of `fromX` is sheared (x moves
 * forward by k for every unit below y0): its ring stays flat, on a yz plane
 * turned about z by atan(k), and is stretched along that plane by 1 / cos.
 */
function lofted(
  stations: number[][],
  f: number,
  rake?: { k: number; y0: number; fromX: number }
): Solid {
  const profile = ([x, h, w, lift = 0]: number[]) => {
    const c = Math.min(h, w) * 0.35;
    // The yz sketch's (a, b) is the world's (y, z): height then width.
    const ring: Point[] = [
      [h, w - c],
      [h - c, w],
      [-h + c, w],
      [-h, w - c],
      [-h, -w + c],
      [-h + c, -w],
      [h - c, -w],
      [h, -w + c],
    ].map(([y, z]) => [(y + lift) * f, z * f]);
    if (!rake || x < rake.fromX - 1e-9)
      return sketch(plane("yz", { offset: x * f }), () => outline(ring));
    // The sheared ring lies on the plane x + k y = x + k y0. FluidCAD moves
    // the yz plane along x by `offset` and then turns it about its own
    // vertical (world z) by `rotateY`, its in-plane axis then running along
    // (-sin t, cos t, 0): a ring point at height y sits y / cos t along it.
    const t = Math.atan(rake.k);
    const at = (x + rake.k * rake.y0) * f;
    return sketch(plane("yz", { rotateY: (t * 180) / Math.PI, offset: at }), () =>
      outline(ring.map(([y, z]): Point => [y / Math.cos(t), z]))
    );
  };
  const pieces = stations.slice(1).map((s, i) => loft(profile(stations[i]), profile(s)).new());
  return pieces.length > 1 ? fuse(...pieces) : pieces[0];
}

/** A polygon's signed area: positive when its points run anticlockwise. */
function area(points: [number, number][]): number {
  return (
    points.reduce((sum, [x0, y0], i) => {
      const [x1, y1] = points[(i + 1) % points.length];
      return sum + x0 * y1 - x1 * y0;
    }, 0) / 2
  );
}

/** Push a polygon's edges out by d, whichever way it runs. */
function outward(points: [number, number][], d: number): [number, number][] {
  const p = distinct(points);
  return grow(area(p) >= 0 ? p : [...p].reverse(), d);
}

/**
 * `spec` grown by g on every side (in its own units). The game keeps its
 * overlays a hair off the walls they lie on, so they never flicker; printed,
 * they must touch, and a nozzle cannot draw the gap anyway.
 */
export function grown(spec: SolidSpec, g: number): SolidSpec {
  switch (spec.kind) {
    case "box":
      return { ...spec, size: [spec.size[0] + 2 * g, spec.size[1] + 2 * g, spec.size[2] + 2 * g] };
    case "cylinder": {
      const r = (n: number) => (n > 0 ? n + g : n);
      return { ...spec, top: r(spec.top), bottom: r(spec.bottom), height: spec.height + 2 * g };
    }
    case "torus":
      return { ...spec, tube: spec.tube + g };
    case "extrude": {
      const bevel = spec.bevel ?? { thickness: 0, size: 0 };
      return {
        ...spec,
        outline: outward(spec.outline, g),
        holes: spec.holes.map((h) => outward(h, -g)),
        bevel: { thickness: bevel.thickness + g, size: bevel.size },
      };
    }
    case "loft":
      return {
        ...spec,
        stations: spec.stations.map(([x, h, w, lift]) => [
          x,
          h + g,
          w + g,
          ...(lift === undefined ? [] : [lift]),
        ]),
      };
    case "hollow": {
      const out = ([h, w, lift]: [number, number, number]): [number, number, number] => [
        h + g,
        w + g,
        lift,
      ];
      const inn = ([h, w, lift]: [number, number, number]): [number, number, number] => [
        h - g,
        w - g,
        lift,
      ];
      return {
        ...spec,
        outer0: out(spec.outer0),
        outer1: out(spec.outer1),
        inner0: inn(spec.inner0),
        inner1: inn(spec.inner1),
      };
    }
    default:
      return spec;
  }
}

/** The thinnest a printed feature may be; thinner parts of the game's ship are thickened to it. */
export function thickened(spec: SolidSpec, mmPerUnit: number, min: number): SolidSpec {
  const at = (n: number) => Math.max(n, min / mmPerUnit);
  switch (spec.kind) {
    case "box":
      return { ...spec, size: [at(spec.size[0]), at(spec.size[1]), at(spec.size[2])] };
    case "cylinder": {
      const r = (n: number) => (n > 0 ? Math.max(n, min / 2 / mmPerUnit) : n);
      return { ...spec, top: r(spec.top), bottom: r(spec.bottom), height: at(spec.height) };
    }
    case "torus":
      return { ...spec, tube: Math.max(spec.tube, min / 2 / mmPerUnit) };
    case "extrude":
      return {
        ...spec,
        depth: Math.max(spec.depth, min / mmPerUnit - 2 * (spec.bevel?.thickness ?? 0)),
      };
    default:
      return spec;
  }
}

/**
 * Put a solid built in its own frame where `m` puts that frame: `m` may
 * mirror (a starboard mount) and must otherwise be a rotation and a move;
 * any uniform scale in it is returned for the caller to build at.
 */
function decompose(m: Matrix4): {
  k: number;
  rotation: Matrix4;
  mirrored: boolean;
  position: Vector3;
} {
  const columns = [new Vector3(), new Vector3(), new Vector3()];
  m.extractBasis(columns[0], columns[1], columns[2]);
  const scales = columns.map((c) => c.length());
  const k = scales[0];
  if (scales.some((s) => Math.abs(s - k) > 1e-6 * k))
    throw new Error(`Non-uniform scale: ${scales.join(", ")}`);
  const rotation = new Matrix4().makeBasis(
    columns[0].divideScalar(k),
    columns[1].divideScalar(k),
    columns[2].divideScalar(k)
  );
  const mirrored = rotation.determinant() < 0;
  // A mirror in the solid's own z, and the rest is a rotation.
  if (mirrored) rotation.multiply(new Matrix4().makeScale(1, 1, -1));
  return { k, rotation, mirrored, position: new Vector3().setFromMatrixPosition(m) };
}

function apply(
  solid: Solid,
  { rotation, mirrored, position }: ReturnType<typeof decompose>
): Solid {
  if (mirrored) {
    const reflected = mirror("xy", solid).new();
    remove(solid);
    solid = reflected;
  }
  // three's 'XYZ' Euler is Rx Ry Rz: about z first, then y, then x.
  const e = new Euler().setFromRotationMatrix(rotation, "XYZ");
  const deg = (a: number) => (a * 180) / Math.PI;
  if (Math.abs(e.z) > EPS) solid = turn(solid, "z", deg(e.z));
  if (Math.abs(e.y) > EPS) solid = turn(solid, "y", deg(e.y));
  if (Math.abs(e.x) > EPS) solid = turn(solid, "x", deg(e.x));
  return move(solid, position.x, position.y, position.z);
}

/** Put a solid already built in mm where `m` (rotation, move, maybe a mirror) puts its frame. */
export function placeBuilt(solid: Solid, m: Matrix4): Solid {
  const parts = decompose(m);
  if (Math.abs(parts.k - 1) > 1e-6) throw new Error(`A built solid cannot be scaled (${parts.k})`);
  return apply(solid, parts);
}

/**
 * Build a placed solid in the print: its description at its scale, grown by
 * `grow` mm and no thinner than `min` mm, mirrored if the game mirrors it,
 * turned and moved by `frame` times the mesh's matrix times its bake.
 */
export function placeSolid(
  placed: PlacedSolid,
  frame: Matrix4,
  { min = 0, grow: by = 0 }: { min?: number; grow?: number } = {}
): Solid | null {
  const m = frame.clone().multiply(new Matrix4().fromArray(placed.matrix));
  if (placed.spec.bake) m.multiply(new Matrix4().fromArray(placed.spec.bake));
  const parts = decompose(m);
  let spec = by ? grown(placed.spec, by / parts.k) : placed.spec;
  if (min) spec = thickened(spec, parts.k, min);
  const solid = buildSpec(spec, parts.k);
  return solid && apply(solid, parts);
}

/**
 * Fuse many solids into one. FluidCAD fuses solids that do not touch into
 * nothing at all, and one fuse of a few hundred solids can crash its kernel,
 * so this fuses them in chunks that each carry a copy of `solids[anchorAt]`
 * (the ship's core, which everything touches), and then fuses the chunks,
 * which all overlap. A solid that touches nothing in its chunk stays a separate
 * shape rather than taking the rest down with it.
 */
export function unite(solids: Solid[], chunk = 60, anchorAt = 0): Solid {
  if (solids.length <= chunk) return fuse(...solids);
  const anchor = solids[anchorAt];
  const rest = solids.filter((_, i) => i !== anchorAt);
  const groups: Solid[] = [];
  for (let i = 0; i < rest.length; i += chunk) {
    const base = i + chunk < rest.length ? translate(0, 0, 0, true, anchor) : anchor;
    groups.push(fuse(base, ...rest.slice(i, i + chunk)));
  }
  return fuse(...groups);
}

/**
 * Fuse many solids into one, by place: pieces in order along x (their boxes,
 * mm), cut into runs of `chunk`. FluidCAD fuses solids that do not touch
 * into nothing, and one fuse of a few hundred can crash its kernel, so each
 * run is fused on its own and the runs then together. A piece that reaches
 * over the split between two runs goes into both (a copy into the second), so
 * two pieces that touch across the split always share a run; and every run
 * carries a copy of the anchor (the core), so the runs overlap.
 */
export function uniteAlong(
  pieces: { s: Solid; box: { min: { x: number }; max: { x: number } } }[],
  anchorAt: number,
  chunk = 100,
  reach = 1
): Solid {
  if (pieces.length <= chunk) return fuse(...pieces.map((p) => p.s));
  const anchor = pieces[anchorAt];
  const rest = pieces
    .filter((_, i) => i !== anchorAt)
    .sort((a, b) => a.box.min.x + a.box.max.x - (b.box.min.x + b.box.max.x));
  const runs: (typeof rest)[] = [];
  for (let i = 0; i < rest.length; i += chunk) runs.push(rest.slice(i, i + chunk));
  // Copies first, before any fuse takes the originals.
  const extras: Solid[][] = runs.map(() => []);
  for (let r = 0; r + 1 < runs.length; r++) {
    const split = (runs[r][runs[r].length - 1].box.max.x + runs[r + 1][0].box.min.x) / 2;
    for (const p of runs[r])
      if (p.box.max.x + reach > split) extras[r + 1].push(translate(0, 0, 0, true, p.s));
    for (const p of runs[r + 1])
      if (p.box.min.x - reach < split) extras[r].push(translate(0, 0, 0, true, p.s));
  }
  const cores = runs.map((_, r) =>
    r + 1 < runs.length ? translate(0, 0, 0, true, anchor.s) : anchor.s
  );
  const fused = runs.map((run, r) => fuse(cores[r], ...run.map((p) => p.s), ...extras[r]));
  return fuse(...fused);
}
