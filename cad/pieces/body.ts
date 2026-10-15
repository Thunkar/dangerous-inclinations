// The body that sits on a well's hub, over its centre peg (migrated from the
// Onshape featurescript orbitBody.fs, in git history), placed where it stands: on the
// hub's top.
//
// Planet: a dome cut into solid bands by wavy boundaries, two colours
// alternating. The boundaries lean on a shared, tilted axis and each wanders
// off it (a seed reshuffles them), so they never line up. The waves key each
// band onto the one below. A bore runs up from the base through every band
// and stops inside the cap, so the hub's peg (or a longer dowel) lines the
// stack up.
//
// Black hole: the horizon is a sphere with its bottom cut flat to stand on the
// hub's peg. The accretion disc is flat, with rows of swirl streaks cut right
// through it (crescents that taper to points, fat toward their leading end and
// drifting inward as they go round, like matter falling in), and each streak
// has its own inlay: the slot's shape a clearance smaller all round, as thick
// as the disc. The disc goes on the hub, the inlays drop into their slots and
// rest on the hub, and the horizon drops through the disc's hole onto the
// peg; its belly, wider than the hole, holds the disc down.
import { subtract, common, fuse, sketch, plane, extrude, loft, sphere, cylinder } from "fluidcad/core";
import { Matrix4, Vector3 } from "three";
import { BOARD, ORBIT_BODY } from "../spec.ts";
import { prism, move, outline, type Point, type Solid } from "../lib/solids.ts";
import { placeBuilt } from "../lib/kit.ts";

const rad = (d: number) => (d * Math.PI) / 180;
/** Where every body stands: on the hub's top. */
const BASE = BOARD.thickness;
const C = BOARD.clearance;
const PEG = BOARD.peg;

// ---- Planet ---------------------------------------------------------------

const P = ORBIT_BODY.planet;
const MIN_GAP = 1;
const BORE = PEG.diameter / 2 + P.clearance;

interface Boundary {
  height: number;
  tilt: number;
  lean: number;
  reach: number;
  waves: number;
  phase: number;
}

/**
 * Boundary k (1 to bands - 1): a wavy ring, z = its height + its wave(a),
 * flat along the radius, then tilted whole about a level line through its
 * height. All lean the same way, the planet's tilted axis, each off it by a
 * few degrees so no two are quite parallel. The tilt dips one side, so the
 * heights are spread between the lowest that keeps the first boundary off the
 * base and the highest that leaves a cap. The wave shrinks with the dome's
 * radius at that height; neighbouring boundaries carry different counts and
 * each a second, faster ripple. The seed reshuffles all of it.
 */
function boundary(k: number): Boundary {
  const r = P.radius;
  const jitter = (salt: number) => Math.sin(k * 2.39996 + P.seed * 1.61803 + salt);
  const lowest = r * Math.tan(rad(P.tilt * 1.05)) + P.amplitude + MIN_GAP;
  const highest = 0.78 * r;
  const height = P.bands === 2 ? (lowest + highest) / 2 : lowest + ((k - 1) * (highest - lowest)) / (P.bands - 2);
  return {
    height,
    tilt: P.tilt * (1 + 0.05 * jitter(0)),
    lean: P.seed * 73 + 5 * jitter(1),
    reach: (P.amplitude * Math.sqrt(r * r - height * height)) / r,
    waves: P.waves + (k % 2),
    phase: k * 137.5 + P.seed * 59,
  };
}

const wave = (b: Boundary, a: number) =>
  b.reach * (0.7 * Math.sin(rad(b.waves * a + b.phase)) + 0.3 * Math.sin(rad((2 * b.waves + 1) * a + 2 * b.phase)));
const zAt = (b: Boundary, rho: number, a: number) => b.height + rho * Math.tan(rad(b.tilt)) * Math.cos(rad(a - b.lean)) + wave(b, a);

/** How high the bore runs: past every boundary at its wall, and its cap clear. */
function boreTop(): number {
  let top = PEG.height + P.clearance;
  for (let k = 1; k < P.bands; k++)
    for (let m = 0; m < 144; m++) top = Math.max(top, zAt(boundary(k), BORE, m * 2.5) + MIN_GAP);
  if (top + MIN_GAP >= Math.sqrt(P.radius ** 2 - BORE ** 2)) throw new Error("The peg bore would break through the planet's top");
  return top;
}

/** The dome, flat on the base, with the bore up into it. */
function dome(): Solid {
  const r = P.radius;
  const s = subtract(sphere(r), move(cylinder(r + 1, r + 1), 0, 0, -r - 1));
  return subtract(s, move(cylinder(BORE, boreTop() + 1), 0, 0, -1));
}

/**
 * A closed curve through `points` (the first not repeated), as a fitted
 * spline is: a periodic cubic with centripetal parameters (each span the
 * square root of its chord). Returns the curve at t in [0, 1).
 */
function closedSpline(points: number[][]): (t: number) => number[] {
  const n = points.length;
  const chord = points.map((p, i) => {
    const q = points[(i + 1) % n];
    return Math.sqrt(Math.hypot(...p.map((x, d) => q[d] - x)));
  });
  const total = chord.reduce((a, b) => a + b, 0);
  const h = chord.map((c) => c / total);
  const knots = [0];
  for (let i = 0; i < n; i++) knots.push(knots[i] + h[i]);
  // Second derivatives M of each coordinate: the periodic spline's cyclic tridiagonal system.
  const solve = (y: number[]) => {
    const a = Array.from({ length: n }, (_, i) => h[(i - 1 + n) % n]);
    const b = Array.from({ length: n }, (_, i) => 2 * (h[(i - 1 + n) % n] + h[i]));
    const c = Array.from({ length: n }, (_, i) => h[i]);
    const r = Array.from(
      { length: n },
      (_, i) => 6 * ((y[(i + 1) % n] - y[i]) / h[i] - (y[i] - y[(i - 1 + n) % n]) / h[(i - 1 + n) % n])
    );
    // Dense Gauss elimination: n is a hundred or so.
    const A = Array.from({ length: n }, (_, i) => {
      const row = new Array(n + 1).fill(0);
      row[(i - 1 + n) % n] += a[i];
      row[i] += b[i];
      row[(i + 1) % n] += c[i];
      row[n] = r[i];
      return row;
    });
    for (let i = 0; i < n; i++) {
      for (let k = i + 1; k < n; k++) {
        const f = A[k][i] / A[i][i];
        if (f) for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j];
      }
    }
    const M = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let v = A[i][n];
      for (let j = i + 1; j < n; j++) v -= A[i][j] * M[j];
      M[i] = v / A[i][i];
    }
    return M;
  };
  const dims = points[0].length;
  const Ms = Array.from({ length: dims }, (_, d) => solve(points.map((p) => p[d])));
  return (t: number) => {
    t = ((t % 1) + 1) % 1;
    let i = 0;
    while (i < n - 1 && knots[i + 1] <= t) i++;
    const hi = h[i];
    const u = (t - knots[i]) / hi;
    return Array.from({ length: dims }, (_, d) => {
      const [y0, y1] = [points[i][d], points[(i + 1) % n][d]];
      const [m0, m1] = [Ms[d][i], Ms[d][(i + 1) % n]];
      return (1 - u) * y0 + u * y1 + ((hi * hi) / 6) * (((1 - u) ** 3 - (1 - u)) * m0 + (u ** 3 - u) * m1);
    });
  };
}

/**
 * A sketch of a polygon whose points (world x, y, z) all lie in one upright
 * plane: the xz plane turned about the world's z to run along it and pushed
 * out to it along its normal, (x, 0, z) mapping to (x cos, x sin, z) there.
 */
function uprightPolygon(points: number[][]) {
  const [p, q] = [points[0], points[1]];
  const along = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const [c, s] = [Math.cos(along), Math.sin(along)];
  // The xz plane's normal is -y; turned, (sin, -cos): the line lies that far out along it.
  const out = p[0] * s - p[1] * c;
  return sketch(plane("xz", { offset: out, rotateZ: (along * 180) / Math.PI, rotationAxes: "world" }), () =>
    outline(points.map(([x, y, z]) => [x * c + y * s, z] as Point))
  );
}

/**
 * Everything below boundary k, as far out as the dome reaches. The boundary
 * is the surface lofted between two closed curves at the same heights, its
 * wave sampled 8 to each ripple of its faster wave and fitted through: one
 * curve inside the bore, one outside the dome, joined point to point by
 * their splines' parameters (so the joining lines lean round where the inner
 * curve's chords run long). Built as solid: under each joining line a
 * profile in its own upright plane, lofted round in two halves; then tilted
 * about the level line through its height that lifts the side it leans
 * toward.
 */
function below(k: number): Solid {
  const b = boundary(k);
  const r = P.radius;
  const samples = 8 * (2 * b.waves + 1);
  const near = BORE / 2;
  const far = r / Math.cos(rad(b.tilt)) + 2;
  const floor = -r - 2;
  const curve = (rho: number) =>
    closedSpline(
      Array.from({ length: samples }, (_, m) => {
        const a = (m * 360) / samples;
        return [rho * Math.cos(rad(a)), rho * Math.sin(rad(a)), b.height + wave(b, a)];
      })
    );
  const [inner, outer] = [curve(near), curve(far)];
  const rulings = 2 * samples;
  // Under each joining line, a quad from its inner end to its outer one, down to the floor.
  const quad = (i: number) => {
    const [p, q] = [inner(i / rulings), outer(i / rulings)];
    return [
      [p[0], p[1], floor],
      [q[0], q[1], floor],
      [q[0], q[1], q[2]],
      [p[0], p[1], p[2]],
    ];
  };
  const half = (from: number, to: number) => {
    const profiles = [];
    for (let i = from; i <= to; i++) profiles.push(uprightPolygon(quad(i)));
    return loft(...profiles).new();
  };
  const solid = fuse(half(0, rulings / 2), half(rulings / 2, rulings));
  const axis = new Vector3(Math.sin(rad(b.lean)), -Math.cos(rad(b.lean)), 0);
  const tilt = new Matrix4()
    .makeTranslation(0, 0, b.height)
    .multiply(new Matrix4().makeRotationAxis(axis, rad(b.tilt)))
    .multiply(new Matrix4().makeTranslation(0, 0, -b.height));
  return placeBuilt(solid, tilt);
}

/** Band n (1 at the base), standing on the hub. */
export function buildBand(n: number): Solid {
  let band = dome();
  if (n < P.bands) band = common(band, below(n));
  if (n > 1) band = subtract(band, below(n - 1));
  return move(band, 0, 0, BASE);
}

// ---- Black hole -----------------------------------------------------------

const H = ORBIT_BODY.blackHole;
const S = H.streaks;
/**
 * The disc's hole is the horizon's width (plus the clearance) at the disc's
 * top: the sphere is narrower than that everywhere below, so it drops
 * through, and wider above, so it overhangs the disc.
 */
const HOLE = Math.sqrt((H.radius + C) ** 2 - (H.centre - H.disc.thickness) ** 2);

/** The horizon: a sphere cut flat on the hub, with the peg's hole. */
export function buildHorizon(): Solid {
  const r = H.radius;
  let s = move(sphere(r), 0, 0, H.centre);
  // Everything below the hub's top goes.
  s = subtract(s, move(cylinder(r + 1, r + 1 - H.centre), 0, 0, H.centre - r - 1));
  s = subtract(s, move(cylinder(PEG.diameter / 2 + C, PEG.height + C + 1), 0, 0, -1));
  return move(s, 0, 0, BASE);
}

/**
 * A streak runs round the disc (u from 0 at its trailing end to 1 at its
 * leading end), drifting inward by the infall as it goes, and its width
 * swells from a point to its widest two thirds of the way along, then closes
 * to a point again: a comet with its head forward. Each row out is a little
 * narrower and shorter, and turned by the stagger so the rows do not line up.
 */
function streakAt(row: number, j: number, u: number) {
  const margin = 2.5;
  const inner = HOLE + margin;
  const band = (H.disc.outer - margin - inner) / S.rows;
  const width = S.width * (1 - 0.15 * row);
  const length = S.length * (1 - 0.1 * row);
  // Clockwise, the board's drift.
  return {
    rho: inner + band * (row + 0.5) + S.infall * (0.5 - u),
    angle: (j * 360) / S.perRow + row * S.stagger - length * u,
    half: (width / 2) * Math.max(0, Math.sin(Math.PI * (1 - u) ** 0.6)) ** 0.6,
  };
}

/** A streak's outline from uFrom to uTo, its half width less `shrink`; an end closed to nothing is a single point. */
function streakOutline(row: number, j: number, uFrom: number, uTo: number, shrink: number): Point[] {
  const samples = 60;
  const outside: Point[] = [];
  const inside: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const p = streakAt(row, j, uFrom + ((uTo - uFrom) * i) / samples);
    const half = Math.max(p.half - shrink, 0);
    const [c, s] = [Math.cos(rad(p.angle)), Math.sin(rad(p.angle))];
    outside.push([(p.rho + half) * c, (p.rho + half) * s]);
    inside.push([(p.rho - half) * c, (p.rho - half) * s]);
  }
  const pointed = shrink === 0;
  const out = [...outside];
  for (let i = pointed ? samples - 1 : samples; i >= (pointed ? 1 : 0); i--) out.push(inside[i]);
  return out;
}

const streaks = () =>
  Array.from({ length: S.rows }, (_, row) => Array.from({ length: S.perRow }, (_, j) => [row, j] as const)).flat();

/** The accretion disc: flat, as wide as the hub, the streaks' slots cut through it. */
export function buildDisc(): Solid {
  const t = H.disc.thickness;
  let disc = subtract(cylinder(H.disc.outer, t), move(cylinder(HOLE, t + 2), 0, 0, -1));
  for (const [row, j] of streaks()) disc = subtract(disc, move(prism(streakOutline(row, j, 0, 1, 0), t + 2), 0, 0, -1));
  return move(disc, 0, 0, BASE);
}

/** The streaks' inlays: each slot a clearance smaller all round, its points stopped where it would get thinner than 0.6 mm. */
export function buildInlays(): void {
  for (const [row, j] of streaks()) {
    let uLow = 0;
    while (uLow < 0.5 && streakAt(row, 0, uLow).half - C < 0.3) uLow += 0.005;
    let uHigh = 1;
    while (uHigh > 0.5 && streakAt(row, 0, uHigh).half - C < 0.3) uHigh -= 0.005;
    sketch(plane("xy", { offset: BASE }), () => outline(streakOutline(row, j, uLow, uHigh, C)));
    extrude(H.disc.thickness).new();
  }
}

/** Every body piece of a well, with its name and the call that builds it. */
export const BODIES: Record<"blackHole" | "planet", { name: string; file: string; call: string }[]> = {
  planet: Array.from({ length: P.bands }, (_, k) => ({
    name: `Band ${k + 1}`,
    file: `band-${k + 1}`,
    call: `buildBody("band", ${k + 1})`,
  })),
  blackHole: [
    { name: "Horizon", file: "horizon", call: `buildBody("horizon")` },
    { name: "Accretion disc", file: "accretion-disc", call: `buildBody("disc")` },
    { name: "Streak inlay", file: "streak-inlay", call: `buildBody("inlays")` },
  ],
};

/** The piece by name, for the part files. */
export function buildBody(piece: "band" | "horizon" | "disc" | "inlays", n = 0): Solid | void {
  if (piece === "band") return buildBand(n);
  if (piece === "horizon") return buildHorizon();
  if (piece === "disc") return buildDisc();
  return buildInlays();
}
