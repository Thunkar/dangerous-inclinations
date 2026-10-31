// The token holder: a tray for the tokens that come and go in play, so the
// table keeps them sorted and a player takes one out with a fingertip. Only
// those: crates, data, wrecks, sale chips, and each player's salvo tokens and
// Escort markers (ship tokens, stations and Home markers live on the board).
//
// Every compartment is a bin cut down from the tray's top: shallow, the
// tokens loose in a layer or two (three for the thin sale chips), its floor
// running up into its front wall in a cove of flat facets, so a token slid
// toward the player rides up and out. The cove opens upward, so it prints
// with no overhang. The tray's height follows each bin: every bin stands on
// the same thin floor, so the deep wreck bin rises above a low shell and no
// solid is left under the shallow bins (every face looks up or stands
// vertical; nothing to bridge). A bin's floor carries the mark of what lives in it,
// engraved MARKER.depth deep (the crate, the data dish, the hull, a planet's
// letter, the Escort shield), read when it is empty.
//
// Counts for six players (RULES.md, engine/src/game/missions/missionDeck.ts):
// crates 6, one a Deliver primary and a player keeps one primary; data 14,
// six Intercepts at most plus the pile's four Survey and four Salvage (loot
// is a token turned over); wrecks 12, a six-seat game leaves 10.9 and 70%
// are never salvaged; sale chips 6 a planet; salvo tokens 3 of each size a
// player, for up to three salvos in the air (three launchers' magazines, the
// most any hull the balance suite flies carries); Escort markers 2 a player,
// one for each secondary a hand holds.
//
// The pool tray holds what everyone shares, and each player has a small
// caddy in their colour with their salvo tokens sorted by size and their
// Escort markers.
import { color, remove, translate, subtract, fuse, sketch, plane, extrude } from "fluidcad/core";
import { BOARD, MARKER } from "../spec.ts";
import { outlines, box, flatten, drawPolygons } from "../lib/glyphs.ts";
import { section, move, turn, type Point, type Solid } from "../lib/solids.ts";
import { slab } from "./token.ts";
import { chamferedSlab } from "./markers/common.ts";
import { cutGlyph, placed, type GlyphName } from "./markers/glyphs.ts";
import { buildCrateToken } from "./markers/crate.ts";
import { buildDataToken } from "./markers/data.ts";
import { buildEscortMarker } from "./markers/escort.ts";
import { buildSaleChip, PLANET_LETTERS, type Planet } from "./markers/sale.ts";
import { buildWreckToken } from "./wreck.ts";
import { buildSalvo, footprint, SALVO } from "./salvo.ts";

export const HOLDER = {
  /** Walls between bins, the tray's rim, the floor under the deepest bin and the slab's chamfer. */
  wall: 2,
  rim: 3,
  floor: 2.4,
  chamfer: 0.8,
  /** Room round each token, and over the top layer. */
  gap: 0.8,
  head: 1.2,
  /** The cove's largest radius, and its facets. */
  cove: 6,
  facets: 4,
};

export const COUNTS = { crate: 6, data: 14, wreck: 12, chip: 6, salvo: SALVO.each, escort: 2, players: 6 };

type Kind = "crate" | "data" | "wreck" | "chip" | "salvo" | "escort";

/**
 * Each token as it lies in a bin: its footprint along x and y, its
 * thickness, and the centre of its box in its own frame (the wreck's is off
 * the origin). Salvos lie nose to the back, their size read off their
 * footprint.
 */
const TOKENS: Record<Exclude<Kind, "salvo">, { size: Point; t: number; centre: Point }> = {
  crate: { size: [18, 20.8], t: 4, centre: [0, 0] },
  data: { size: [17, 17], t: 3.6, centre: [0, 0] },
  wreck: { size: [20.25, 9.6], t: 6, centre: [0.375, 1.03] },
  chip: { size: [16, 16], t: 2.5, centre: [0, 0] },
  escort: { size: [17.46, 20], t: 3, centre: [0, 0] },
};

/** A bin: what it holds (a salvo bin, which size), its grid (columns, rows, layers), and the mark in its floor. */
interface Bin {
  kind: Kind;
  n?: number;
  grid: [number, number, number];
  mark?: { glyph: GlyphName } | { planet: Planet };
}

/** A bin's token as it lies: a salvo's footprint turned nose to the back (+y). */
function tokenSize({ kind, n = 1 }: Bin): { size: Point; t: number; centre: Point } {
  if (kind !== "salvo") return TOKENS[kind];
  const p = footprint(n).map(([x, y]): Point => [-y, x]);
  const [x0, x1] = [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0]))];
  const [y0, y1] = [Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))];
  return { size: [x1 - x0, y1 - y0], t: 3, centre: [(x0 + x1) / 2, (y0 + y1) / 2] };
}

/** A bin's inner width, length front to back, depth and cove radius. */
function measure(bin: Bin) {
  const { grid: [cols, rows, layers] } = bin;
  const { gap: g, head, cove } = HOLDER;
  const { size: [tx, ty], t } = tokenSize(bin);
  const depth = layers * t + head;
  const r = Math.min(depth, cove);
  return { w: cols * (tx + g) + g, d: r + rows * (ty + g) + g, depth, r };
}

/** The pool every layout shares: crates, data, wrecks, and a slot of sale chips for each planet. */
const POOL: Bin[] = [
  { kind: "crate", grid: [2, 2, 2], mark: { glyph: "crate" } },
  { kind: "data", grid: [4, 2, 2], mark: { glyph: "intercept" } },
  { kind: "wreck", grid: [2, 4, 2], mark: { glyph: "hull" } },
  ...(Object.keys(PLANET_LETTERS) as Planet[]).map((planet): Bin => ({ kind: "chip", grid: [1, 2, 3], mark: { planet } })),
];

/**
 * A player's caddy, two rows: in front the salvos of 2 and 1 and the two
 * Escort markers, behind them the salvos of 4 and 3. Each salvo bin holds 3,
 * in two layers, but the singles lie three abreast so a fingertip fits in.
 */
const salvoBin = (n: number): Bin => ({ kind: "salvo", n, grid: n === 1 ? [3, 1, 1] : [2, 1, 2] });
const CADDY: Bin[][] = [
  [salvoBin(2), salvoBin(1), { kind: "escort", grid: [1, 1, 2], mark: { glyph: "escort" } }],
  [salvoBin(4), salvoBin(3)],
];

/** Bins placed in rows, front (y small) to back: each bin's front-left inner corner. */
interface Placed {
  bin: Bin;
  at: Point;
}

/** Lay rows of bins left to right, front row first; the tray's outer size and height. */
function lay(rows: Bin[][]): { bins: Placed[]; size: Point; height: number } {
  const { wall, rim, floor } = HOLDER;
  const bins: Placed[] = [];
  let y = rim;
  let width = 0;
  let deepest = 0;
  for (const row of rows) {
    let x = rim;
    let length = 0;
    for (const bin of row) {
      const m = measure(bin);
      bins.push({ bin, at: [x, y] });
      x += m.w + wall;
      length = Math.max(length, m.d);
      deepest = Math.max(deepest, m.depth);
    }
    width = Math.max(width, x - wall + rim);
    y += length + wall;
  }
  return { bins, size: [width, y - wall + rim], height: deepest + floor };
}

/** The bin's cavity from the tray's top down: a section in y-z, its front cove in facets, pulled along x. */
function cavity({ bin, at: [x, y] }: Placed, top: number): Solid {
  const { w, d, depth, r } = measure(bin);
  const floor = top - depth;
  const arc = Array.from({ length: HOLDER.facets + 1 }, (_, i): Point => {
    const a = ((i / HOLDER.facets) * Math.PI) / 2;
    return [r - r * Math.cos(a), floor + r - r * Math.sin(a)];
  });
  // The front wall stands from the top down to the cove (nothing of it when the cove is the bin's depth).
  const profile: Point[] = [[0, top + 1], ...arc, [d, floor], [d, top + 1]];
  return move(section(profile, w), x, y, 0);
}

/** Cut the bin's mark into its floor, centred on the floor behind the cove. */
function marked(s: Solid, { bin, at: [x, y] }: Placed, top: number): Solid {
  if (!bin.mark) return s;
  const { w, d, depth, r } = measure(bin);
  const floor = top - depth;
  const centre: Point = [x + w / 2, y + (r + d) / 2];
  const size = Math.min(w, d - r) * 0.55;
  if ("glyph" in bin.mark) return cutGlyph(s, placed(bin.mark.glyph, Math.min(size, 16), centre), floor - MARKER.depth, floor + 1);
  // A planet's letter, from the board's font, as the sale chip carries it.
  const letter = PLANET_LETTERS[bin.mark.planet];
  const [lo, hi] = box(outlines(BOARD.number.font, letter, 1));
  const k = Math.min(size, 10) / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const polys = outlines(BOARD.number.font, letter, k).map((c) => flatten(c));
  const [cx, cy] = [((lo[0] + hi[0]) / 2) * k, ((lo[1] + hi[1]) / 2) * k];
  sketch(plane("xy", { offset: floor - MARKER.depth }), () => drawPolygons(polys, ([u, v]): Point => [u - cx + centre[0], v - cy + centre[1]]));
  return subtract(s, extrude(MARKER.depth + 1).new());
}

/** A tray of bins laid in rows: a chamfered slab, as tall as its deepest bin, with each bin cut and marked. */
function tray(rows: Bin[][]): Solid {
  const { bins, size: [w, d], height } = lay(rows);
  let s = chamferedSlab(
    [
      [0, 0],
      [w, 0],
      [w, d],
      [0, d],
    ],
    height,
    HOLDER.chamfer
  );
  // One cut at a time: a cut by several solids that do not touch cuts nothing.
  for (const p of bins) s = subtract(s, cavity(p, height));
  for (const p of bins) s = marked(s, p, height);
  return s;
}

/**
 * A row's columns: each bin's stretch of the tray, across its full depth,
 * as tall as the bin needs. The wall between two bins goes to the taller
 * one; the shorter column reaches 0.5 into the taller, so the two overlap.
 */
export function columns(row: Bin[]): { x0: number; x1: number; height: number; bin: Placed }[] {
  const { bins, size: [w] } = lay([row]);
  const tall = bins.map((p) => measure(p.bin).depth + HOLDER.floor);
  return bins.map((p, i) => {
    const left = i === 0 ? 0 : tall[i - 1] > tall[i] ? p.at[0] - 0.5 : p.at[0] - HOLDER.wall;
    const right = i === bins.length - 1 ? w : tall[i + 1] > tall[i] ? p.at[0] + measure(p.bin).w + 0.5 : bins[i + 1].at[0];
    return { x0: left, x1: right, height: tall[i], bin: p };
  });
}

/** A one-row tray whose height follows each bin: a column a bin, fused, the outer sides chamfered, then the bins cut. */
function steppedTray(row: Bin[]): Solid {
  const { size: [, d] } = lay([row]);
  const cols = columns(row);
  const pieces = cols.map(({ x0, x1, height }, i) =>
    slab(
      {
        // Clockwise: left side, back, right side, front.
        pts: [
          [x0, 0],
          [x0, d],
          [x1, d],
          [x1, 0],
        ],
        chamfered: [i === 0, true, i === cols.length - 1, true],
      },
      height,
      HOLDER.chamfer
    )
  );
  let s: Solid = fuse(...pieces);
  for (const c of cols) s = subtract(s, cavity(c.bin, c.height));
  for (const c of cols) s = marked(s, c.bin, c.height);
  return s;
}

/** The pool tray, and a caddy for each player in their colour. */
export const buildPoolTray = () => steppedTray(POOL);
export const buildCaddy = () => tray(CADDY);

/** Outer size and height of the pieces, and what the pool tray's steps save against a flat slab (mm3, before chamfers). */
export function holderInfo() {
  const pool = lay([POOL]);
  const caddy = lay(CADDY);
  const saved = columns(POOL).reduce((v, c) => v + (pool.height - c.height) * (c.x1 - c.x0) * pool.size[1], 0);
  return { pool, caddy, saved };
}

// ---- Viewer: the trays filled ----------------------------------------------

const TRAY_COLOUR = "#e8dfc8";
const PLAYER_COLOURS = ["#c43a2c", "#2f6fb5", "#d9a441", "#3c9a5f", "#7a4fb0", "#3a3a3a"];
const KIND_COLOURS: Partial<Record<Kind, string>> = { crate: "#2f8f8a", data: "#6c4fa3", wreck: "#55555a" };
const PLANET_COLOURS: Record<Planet, string> = { alpha: "#c43a2c", beta: "#2f6fb5", gamma: "#d9a441" };

/** One token of a bin's kind in its own frame, as it lies in the bin. */
function tokenOf({ kind, n = 1 }: Bin, planet?: Planet): Solid {
  switch (kind) {
    case "crate":
      return buildCrateToken();
    case "data":
      return buildDataToken();
    case "wreck":
      return buildWreckToken();
    case "chip":
      return buildSaleChip(planet ?? "alpha");
    case "salvo":
      return turn(buildSalvo(n), "z", 90);
    case "escort":
      return buildEscortMarker();
  }
}

/** Fill a bin with `count` copies of its token, layer by layer from the back, at (ox, oy). */
function fill({ bin, at: [x, y] }: Placed, top: number, count: number, colour: string, [ox, oy]: Point): void {
  const { grid: [cols, rows] } = bin;
  const { size: [tx, ty], t, centre } = tokenSize(bin);
  const { depth, r } = measure(bin);
  const g = HOLDER.gap;
  const base = tokenOf(bin, bin.mark && "planet" in bin.mark ? bin.mark.planet : undefined);
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / (cols * rows));
    const c = i % cols;
    const row = rows - 1 - (Math.floor(i / cols) % rows);
    const px = ox + x + g + c * (tx + g) + tx / 2 - centre[0];
    const py = oy + y + r + g + row * (ty + g) + ty / 2 - centre[1];
    color(colour, translate(px, py, top - depth + layer * t + 0.02, true, base));
  }
  remove(base);
}

/** Fill a laid-out tray's bins at (ox, oy), each from its own top; `player` colours a caddy's tokens. */
function fillAll(placedBins: { bin: Placed; top: number }[], at: Point, player?: number): void {
  for (const { bin: p, top } of placedBins) {
    const k = p.bin.kind;
    const colour = (player !== undefined && PLAYER_COLOURS[player]) || TRAY_COLOUR;
    if (k === "salvo" || k === "escort") fill(p, top, k === "salvo" ? COUNTS.salvo : COUNTS.escort, colour, at);
    else if (k === "chip" && p.bin.mark && "planet" in p.bin.mark) fill(p, top, COUNTS.chip, PLANET_COLOURS[p.bin.mark.planet], at);
    else fill(p, top, COUNTS[k], KIND_COLOURS[k] ?? TRAY_COLOUR, at);
  }
}

/** The pool tray filled, at (ox, oy). */
export function showPool([ox, oy]: Point = [0, 0]): void {
  color(TRAY_COLOUR, move(buildPoolTray(), ox, oy, 0));
  fillAll(columns(POOL).map((c) => ({ bin: c.bin, top: c.height })), [ox, oy]);
}

/** A caddy filled with a player's tokens, in their colour, at (ox, oy). */
export function showCaddy(player: number, [ox, oy]: Point = [0, 0]): void {
  const { bins, height } = lay(CADDY);
  color(PLAYER_COLOURS[player], move(buildCaddy(), ox, oy, 0));
  fillAll(bins.map((bin) => ({ bin, top: height })), [ox, oy], player);
}

/** The pool tray filled, and the six caddies in a row in front of it. */
export function showPoolAndCaddies([ox, oy]: Point = [0, 0]): void {
  showPool([ox, oy]);
  const [cw, cd] = lay(CADDY).size;
  for (let i = 0; i < COUNTS.players; i++) showCaddy(i, [ox + i * (cw + 4), oy - cd - 6]);
}
