// One gravity well as a kit (migrated from the Onshape featurescript
// orbitRings.fs, in git history): separate rings with walled, numbered sectors, a hub
// and radial arms that lock the rings in place, and the lane markers that
// stand in grooves cut into a band outside the outer ring's track. Sectors
// are numbered from 0 and run clockwise (RULES.md: "numbered 0-23 and
// increase in the direction of drift").
//
// Assembly: the arms lie on the table and plug under the hub. Every ring sits
// on them over notches cut in its underside, and a tooth on each arm fills
// every gap between rings, so the rings cannot slide or turn. A ring too big
// for the bed is cut into segments on arm lines; the arms under the joints
// hold the segments together. Each lane marker drops into its own groove,
// which stops short of the arms, so the groove holds it both ways. The
// numbers are inlaid: each ring's pockets take its numbers, printed apart.
import { subtract, fuse, sketch, plane, extrude, revolve, cylinder } from "fluidcad/core";
import { BOARD, WELLS } from "../spec.ts";
import { prism, move, turn, section, outline, type Point, type Solid } from "../lib/solids.ts";
import { outlines, glyphOutlines, flatten, grow, area, box, drawContours, drawPolygons, type Contour } from "../lib/glyphs.ts";

export type WellKind = keyof typeof WELLS;

const B = BOARD;
const STEP = 360 / B.sectors;
/** Sectors run clockwise. */
const TURN = -1;
const TOP = B.thickness;
const C = B.clearance;
const rad = (d: number) => (d * Math.PI) / 180;
/** Sector edge s's angle, degrees. */
const edge = (s: number) => B.startAngle + TURN * s * STEP;
/** Sector s's middle, degrees. */
const middle = (s: number) => B.startAngle + TURN * (s + 0.5) * STEP;
const at = (deg: number, r: number): Point => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];

/** A lane: its first sector, how many, and what it is. */
interface Lane {
  first: number;
  count: number;
  name: string;
}

/** The black hole's lanes every 4 sectors all round, and a planet's at sectors 4-7 and 16-19. */
function lanesOf(kind: WellKind): Lane[] {
  if (kind === "planet")
    return [
      { first: 4, count: 4, name: "arrivals" },
      { first: 16, count: 4, name: "departures" },
    ];
  const names = ["out to Beta", "in from Alpha", "out to Gamma", "in from Beta", "out to Alpha", "in from Gamma"];
  return Array.from({ length: B.sectors / 4 }, (_, k) => ({ first: 4 * k, count: 4, name: names[k % 6] }));
}

/** The fewest segments, each a whole number of arm spans, that fit on the bed. */
function segmentCount(rIn: number, rOut: number): number {
  const arms = B.arm.count;
  const fits = (span: number) => {
    if (span > 180.001) return 2 * rOut <= B.bed;
    if (span > 179.999) return 2 * rOut <= B.bed && rOut <= B.bed;
    return 2 * rOut * Math.sin(rad(span / 2)) <= B.bed && rOut - rIn * Math.cos(rad(span / 2)) <= B.bed;
  };
  for (let s = 1; s <= arms; s++) if (arms % s === 0 && fits(360 / s)) return s;
  return arms;
}

/** The well's layout: every radius, the hub, the arms, the lanes and how each ring is cut. */
export function wellOf(kind: WellKind) {
  const n = WELLS[kind].rings;
  const half = (B.pitch - B.gap) / 2;
  const centre = Array.from({ length: n }, (_, i) => B.firstRadius + i * B.pitch);
  const inner = centre.map((r) => r - half);
  const outer = centre.map((r) => r + half);
  const lanes = lanesOf(kind);
  const band = lanes.length ? B.lane.band : 0;
  // The outer edge of each ring's part: the last one carries the lane band.
  const edgeOf = outer.map((r, i) => (i === n - 1 ? r + band : r));
  // A smaller hub leaves ring 1 where it is; the arms' first tooth grows to fill the wider gap.
  const hubRadius = WELLS[kind].hubRadius || inner[0] - B.gap;
  const armStart = hubRadius - B.arm.underHub;
  const armEnd = edgeOf[n - 1] + B.gap;
  const segments = inner.map((r, i) => segmentCount(r, edgeOf[i]));
  return {
    kind,
    n,
    centre,
    inner,
    outer,
    edgeOf,
    hubRadius,
    armStart,
    armEnd,
    lanes,
    segments,
    grooveInner: outer[n - 1] + B.wall.foot,
    grooveOuter: outer[n - 1] + band - B.wall.foot,
    armAngle: (j: number) => edge((j * B.sectors) / B.arm.count),
  };
}
type Well = ReturnType<typeof wellOf>;

// ---- Shapes ---------------------------------------------------------------

/** A flat ring between two radii, from z0 to z1. */
function annulus(rIn: number, rOut: number, z0: number, z1: number): Solid {
  const outerDisc = move(cylinder(rOut, z1 - z0), 0, 0, z0);
  return subtract(outerDisc, move(cylinder(rIn, z1 - z0 + 2), 0, 0, z0 - 1));
}

/** A pie slice from the centre, turning `sweep` (signed) from `from`, reaching well past `radius`. */
function wedge(from: number, sweep: number, radius: number, z0: number, height: number): Solid {
  const steps = Math.ceil(Math.abs(sweep) / 10);
  const pts: Point[] = [[0, 0]];
  for (let i = 0; i <= steps; i++) pts.push(at(from + (sweep * i) / steps, 2 * radius));
  return move(prism(pts, height), 0, 0, z0);
}

/** A stretch of flat ring: from `from`, turning `sweep` (signed), between two radii. */
function arcPiece(rIn: number, rOut: number, z0: number, z1: number, from: number, sweep: number): Solid {
  const rest = sweep > 0 ? 360 - sweep : -360 - sweep;
  return subtract(annulus(rIn, rOut, z0, z1), wedge(from + sweep, rest, rOut, z0 - 1, z1 - z0 + 2));
}

/** A bar along the radius at `angle`, from r0 to r1, `half` either side. */
function radialRect(angle: number, r0: number, r1: number, half: number): Point[] {
  const [c, s] = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  const p = (r: number, w: number): Point => [r * c - w * s, r * s + w * c];
  return [p(r0, -half), p(r1, -half), p(r1, half), p(r0, half)];
}

/** Cut the notches the arms run in under the hub and every ring, one at a time. */
function notched(w: Well, solid: Solid): Solid {
  for (let j = 0; j < B.arm.count; j++) {
    const notch = radialRect(w.armAngle(j), w.armStart - C, w.armEnd + 1, B.arm.width / 2 + C);
    solid = subtract(solid, move(prism(notch, B.arm.height + C + 1), 0, 0, -1));
  }
  return solid;
}

// ---- Numbers --------------------------------------------------------------

/** The font size at which a "0" stands `number.height` tall. */
let fontSize = 0;
function size(): number {
  if (!fontSize) {
    const [lo, hi] = box(outlines(B.number.font, "0", 1));
    fontSize = B.number.height / (hi[1] - lo[1]);
  }
  return fontSize;
}

/**
 * Sector s's number on ring i: its outlines and where each point of them
 * goes. The label's box is centred on the ring's centre line at the sector's
 * middle, its top toward the centre of the well.
 */
function label(w: Well, i: number, s: number): { contours: Contour[]; place: (p: Point) => Point } {
  const contours = outlines(B.number.font, String(s), size());
  const [lo, hi] = box(contours);
  const [cx, cy] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const mid = middle(s);
  const spin = rad(mid + 90);
  const [ox, oy] = at(mid, w.centre[i]);
  const place = ([x, y]: Point): Point => {
    const [dx, dy] = [x - cx, y - cy];
    return [ox + dx * Math.cos(spin) - dy * Math.sin(spin), oy + dx * Math.sin(spin) + dy * Math.cos(spin)];
  };
  return { contours, place };
}

/** The sectors on segment j of ring i. */
function sectorsOf(w: Well, i: number, j: number): number[] {
  const span = B.sectors / w.segments[i];
  return Array.from({ length: B.sectors }, (_, s) => s).filter((s) => Math.floor(s / span) === j);
}

/**
 * Cut the pockets for ring i's numbers: each outline grown by the inlay's
 * clearance away from the number, as deep as the number from the top. One
 * glyph at a time: a cut by several solids that do not touch cuts nothing.
 */
function pocketed(w: Well, i: number, ring: Solid): Solid {
  for (let s = 0; s < B.sectors; s++) {
    const { place } = label(w, i, s);
    for (const glyph of glyphOutlines(B.number.font, String(s), size())) {
      const flat = glyph.map((c) => flatten(c));
      // The outline with the most area is the glyph's outside: the material
      // lies to one side of it, the same side of every contour in the font.
      const outside = flat.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
      const away = area(outside) < 0 ? 1 : -1;
      const polys = flat.map((poly) => grow(poly, B.number.clearance, away).map(place));
      sketch(plane("xy", { offset: TOP - B.number.depth }), () => drawPolygons(polys, (p) => p));
      ring = subtract(ring, extrude(B.number.depth + 1).new());
    }
  }
  return ring;
}

// ---- Pieces ---------------------------------------------------------------

/** Ring i (0 based), uncut: the track, its walls and rims, the lane grooves, the notches and the number pockets. */
function ringWhole(w: Well, i: number): Solid {
  const { height, foot, crest } = B.wall;
  let ring = annulus(w.inner[i], w.edgeOf[i], 0, TOP);
  // A wall on every sector edge, trapezoid in section, across the track. Its
  // ends stop a hair inside the rims, which cover them: a flat end on the
  // rims' round faces would only touch them along a line, which the kernel's
  // booleans cannot take.
  const tuck = 0.05;
  const spoke: Point[] = [
    [-foot / 2, TOP],
    [foot / 2, TOP],
    [crest / 2, TOP + height],
    [-crest / 2, TOP + height],
  ];
  const spokes = Array.from({ length: B.sectors }, (_, s) =>
    turn(move(section(spoke, w.outer[i] - w.inner[i] - 2 * tuck), w.inner[i] + tuck, 0, 0), "z", edge(s))
  );
  // Rims: upright on the track's edges, sloped toward it; revolved.
  const [a, b] = [w.inner[i], w.outer[i]];
  sketch("xz", () => {
    outline([
      [a, TOP],
      [a + foot, TOP],
      [a + crest, TOP + height],
      [a, TOP + height],
    ]);
    outline([
      [b - foot, TOP],
      [b, TOP],
      [b, TOP + height],
      [b - crest, TOP + height],
    ]);
  });
  const rims = revolve("z").new();
  ring = fuse(ring, ...spokes, rims);
  // Lane grooves in the outer ring's band, each stopping short of its ends,
  // leaving a wall between neighbours and clearing the arm notches.
  if (i === w.n - 1) {
    const trim = B.arm.width / 2 + C + foot / 2;
    for (const lane of w.lanes) {
      const t = (trim / w.grooveInner) * (180 / Math.PI);
      ring = subtract(
        ring,
        arcPiece(
          w.grooveInner,
          w.grooveOuter,
          TOP - B.lane.groove,
          TOP + height + 1,
          edge(lane.first) + TURN * t,
          TURN * (lane.count * STEP - 2 * t)
        )
      );
    }
  }
  ring = notched(w, ring);
  return pocketed(w, i, ring);
}

/** Segment j of ring i (0 based), as its part prints: `Ring k` or `Ring k.j`. */
export function buildRing(kind: WellKind, i: number, j = 0): Solid {
  const w = wellOf(kind);
  const ring = ringWhole(w, i);
  const segments = w.segments[i];
  if (segments === 1) return ring;
  const span = B.sectors / segments;
  return subtract(ring, wedge(edge((j + 1) * span), TURN * (360 - span * STEP), w.edgeOf[i], -1, TOP + B.wall.height + 2));
}

/** The numbers inlaid in segment j of ring i. */
export function buildNumbers(kind: WellKind, i: number, j = 0): Solid {
  const w = wellOf(kind);
  sketch(plane("xy", { offset: TOP - B.number.depth }), () => {
    for (const s of sectorsOf(w, i, j)) {
      const { contours, place } = label(w, i, s);
      drawContours(contours, place);
    }
  });
  return extrude(B.number.depth).new();
}

/** The hub, with the centre peg the planet or black hole sits on, notched for the arms. */
export function buildHub(kind: WellKind): Solid {
  const w = wellOf(kind);
  const hub = fuse(cylinder(w.hubRadius, TOP), move(cylinder(B.peg.diameter / 2, B.peg.height), 0, 0, TOP));
  return notched(w, hub);
}

/** Arm j: a bar under everything, and a tooth filling each gap it crosses. */
export function buildArm(kind: WellKind, j: number): Solid {
  const w = wellOf(kind);
  const gaps: [number, number][] = [[w.hubRadius + C, w.inner[0] - C]];
  for (let i = 0; i + 1 < w.n; i++) gaps.push([w.edgeOf[i] + C, w.inner[i + 1] - C]);
  gaps.push([w.edgeOf[w.n - 1] + C, w.armEnd]);
  const a = w.armAngle(j);
  const half = B.arm.width / 2;
  const bar = prism(radialRect(a, w.armStart, w.armEnd, half), B.arm.height);
  return fuse(bar, ...gaps.map(([r0, r1]) => prism(radialRect(a, r0, r1, half), TOP)));
}

/** Lane marker l: its groove a clearance smaller all round, standing proud of the ring. */
export function buildLane(kind: WellKind, l: number): Solid {
  const w = wellOf(kind);
  const lane = w.lanes[l];
  const trim = B.arm.width / 2 + C + B.wall.foot / 2 + C;
  const t = (trim / w.grooveInner) * (180 / Math.PI);
  return arcPiece(
    w.grooveInner + C,
    w.grooveOuter - C,
    TOP - B.lane.groove,
    TOP + B.lane.raise,
    edge(lane.first) + TURN * t,
    TURN * (lane.count * STEP - 2 * t)
  );
}

/** Every part of a well, with its name and the call that builds it. */
export function partsOf(kind: WellKind): { name: string; file: string; call: string }[] {
  const w = wellOf(kind);
  const out: { name: string; file: string; call: string }[] = [];
  for (let i = 0; i < w.n; i++)
    for (let j = 0; j < w.segments[i]; j++) {
      const name = w.segments[i] === 1 ? `Ring ${i + 1}` : `Ring ${i + 1}.${j + 1}`;
      const file = name.toLowerCase().replace(" ", "-");
      out.push({ name, file, call: `buildRing("${kind}", ${i}, ${j})` });
      out.push({ name: `${name} numbers`, file: `${file}-numbers`, call: `buildNumbers("${kind}", ${i}, ${j})` });
    }
  out.push({ name: "Hub", file: "hub", call: `buildHub("${kind}")` });
  for (let j = 0; j < B.arm.count; j++) out.push({ name: `Arm ${j + 1}`, file: `arm-${j + 1}`, call: `buildArm("${kind}", ${j})` });
  w.lanes.forEach((lane, l) => {
    const name = `Lane ${lane.first}-${lane.first + lane.count - 1} ${lane.name}`;
    out.push({ name, file: `lane-${lane.first}-${lane.first + lane.count - 1}`, call: `buildLane("${kind}", ${l})` });
  });
  return out;
}
