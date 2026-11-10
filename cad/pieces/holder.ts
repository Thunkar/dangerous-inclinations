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
// vertical; nothing to bridge). The bins in a row all run the row's length.
// A bin's floor carries the token that lives in it, engraved MARKER.depth
// deep: drawn round as a groove with its face as the token carries it, a
// salvo's missiles sunk whole, a sale chip's planet letter; read when empty.
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
import { color, remove, translate, subtract, fuse, sketch, plane, extrude } from 'fluidcad/core'
import { BOARD, MARKER } from '../spec.ts'
import { COLOUR, PLAYER_COLOURS } from '../colours.ts'
import { outlines, box, flatten, drawPolygons, grow, area } from '../lib/glyphs.ts'
import { section, move, turn, prism, type Point, type Solid } from '../lib/solids.ts'
import { slab, TOKEN } from './token.ts'
import { chamferedSlab, regular, clippedRect } from './markers/common.ts'
import { cutGlyph, placed, type Element } from './markers/glyphs.ts'
import { buildCrateToken, CRATE } from './markers/crate.ts'
import { buildDataToken, DATA } from './markers/data.ts'
import { buildEscortMarker, ESCORT } from './markers/escort.ts'
import { buildSaleChip, PLANET_LETTERS, SALE, type Planet } from './markers/sale.ts'
import { buildWreckToken, wreckOutlines } from './wreck.ts'
import { buildSalvo, footprint, salvoOutlines, SALVO } from './salvo.ts'
import { MISSILE } from './missile.ts'

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
}

export const COUNTS = {
  crate: 6,
  data: 14,
  wreck: 12,
  chip: 6,
  salvo: SALVO.each,
  escort: 2,
  players: 6,
}

type Kind = 'crate' | 'data' | 'wreck' | 'chip' | 'salvo' | 'escort'

/** Each token's thickness as it lies in a bin. */
const THICKNESS: Record<Kind, number> = {
  crate: CRATE.thickness,
  data: DATA.thickness,
  wreck: TOKEN.thickness,
  chip: SALE.thickness,
  salvo: MISSILE.thickness,
  escort: ESCORT.thickness,
}

/** A bin: what it holds (a salvo bin, which size; a chip bin, which planet) and its grid (columns, rows, layers). */
export interface Bin {
  kind: Kind
  n?: number
  grid: [number, number, number]
  planet?: Planet
}

/**
 * A bin's token as it lies: its footprint along x and y, its thickness, and
 * the centre of its box in its own frame (the wreck's is off the origin).
 * Salvos lie nose to the back (+y), their size read off their footprint; a
 * sale chip is a disc.
 */
function tokenSize(bin: Bin): { size: Point; t: number; centre: Point } {
  const t = THICKNESS[bin.kind]
  if (bin.kind === 'chip') return { size: [SALE.diameter, SALE.diameter], t, centre: [0, 0] }
  const p =
    bin.kind === 'salvo'
      ? footprint(bin.n ?? 1).map(([x, y]): Point => [-y, x])
      : tokenPlan(bin).polys.flat()
  const [x0, x1] = [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0]))]
  const [y0, y1] = [Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))]
  return { size: [x1 - x0, y1 - y0], t, centre: [(x0 + x1) / 2, (y0 + y1) / 2] }
}

/** A bin's inner width, length front to back, depth and cove radius. */
function measure(bin: Bin) {
  const {
    grid: [cols, rows, layers],
  } = bin
  const { gap: g, head, cove } = HOLDER
  const {
    size: [tx, ty],
    t,
  } = tokenSize(bin)
  const depth = layers * t + head
  const r = Math.min(depth, cove)
  return { w: cols * (tx + g) + g, d: r + rows * (ty + g) + g, depth, r }
}

/** The pool every layout shares: crates, data, wrecks, and a slot of sale chips for each planet. */
export const POOL: Bin[] = [
  { kind: 'crate', grid: [2, 2, 2] },
  { kind: 'data', grid: [4, 2, 2] },
  { kind: 'wreck', grid: [2, 4, 2] },
  ...(Object.keys(PLANET_LETTERS) as Planet[]).map(
    (planet): Bin => ({ kind: 'chip', grid: [1, 2, 3], planet })
  ),
]

/**
 * A player's caddy, two rows: in front the salvos of 2 and 1 and the two
 * Escort markers, behind them the salvos of 4 and 3. Each salvo bin holds 3,
 * in two layers, but the singles lie three abreast so a fingertip fits in.
 */
const salvoBin = (n: number): Bin => ({ kind: 'salvo', n, grid: n === 1 ? [3, 1, 1] : [2, 1, 2] })
export const CADDY: Bin[][] = [
  [salvoBin(2), salvoBin(1), { kind: 'escort', grid: [1, 1, 2] }],
  [salvoBin(4), salvoBin(3)],
]

/** Bins placed in rows, front (y small) to back: each bin's front-left inner corner, and its length, the row's longest. */
export interface Placed {
  bin: Bin
  at: Point
  d: number
}

/** Lay rows of bins left to right, front row first; the tray's outer size and height. */
export function lay(rows: Bin[][]): { bins: Placed[]; size: Point; height: number } {
  const { wall, rim, floor } = HOLDER
  const bins: Placed[] = []
  let y = rim
  let width = 0
  let deepest = 0
  for (const row of rows) {
    let x = rim
    const length = Math.max(...row.map(bin => measure(bin).d))
    for (const bin of row) {
      const m = measure(bin)
      bins.push({ bin, at: [x, y], d: length })
      x += m.w + wall
      deepest = Math.max(deepest, m.depth)
    }
    width = Math.max(width, x - wall + rim)
    y += length + wall
  }
  return { bins, size: [width, y - wall + rim], height: deepest + floor }
}

/** The bin's cavity from the tray's top down: a section in y-z, its front cove in facets, pulled along x. */
function cavity({ bin, at: [x, y], d }: Placed, top: number): Solid {
  const { w, depth, r } = measure(bin)
  const floor = top - depth
  const arc = Array.from({ length: HOLDER.facets + 1 }, (_, i): Point => {
    const a = ((i / HOLDER.facets) * Math.PI) / 2
    return [r - r * Math.cos(a), floor + r - r * Math.sin(a)]
  })
  // The front wall stands from the top down to the cove (nothing of it when the cove is the bin's depth).
  const profile: Point[] = [[0, top + 1], ...arc, [d, floor], [d, top + 1]]
  return move(section(profile, w), x, y, 0)
}

/** The token a bin holds in plan as it lies there: its outlines and its face. */
function tokenPlan({ kind, n = 1 }: Bin): { polys: Point[][]; face: Element[] } {
  switch (kind) {
    case 'crate':
      return {
        polys: [regular(6, CRATE.flats / 2 / Math.cos(Math.PI / 6), 90)],
        face: placed('crate', CRATE.mark),
      }
    case 'data':
      return {
        polys: [clippedRect(DATA.size, DATA.size, DATA.clip)],
        face: placed('intercept', DATA.mark),
      }
    case 'wreck':
      return { polys: wreckOutlines(), face: [] }
    case 'escort': {
      const [rim, hull] = placed('escort', ESCORT.tall)
      return { polys: [rim.outer], face: [hull] }
    }
    case 'salvo':
      return { polys: salvoOutlines(n).map(p => p.map(([x, y]): Point => [-y, x])), face: [] }
    case 'chip':
      return { polys: [], face: [] }
  }
}

/** The groove a token is drawn with, and the most its drawing is enlarged past the token's size. */
const LINE = 0.8
const ENLARGE = 1.4

/**
 * Cut the bin's mark into its floor, centred on the floor behind the cove: a
 * sale chip's planet letter, or the token drawn as a groove with its face
 * engraved as the token carries it (a salvo's missiles, too thin to draw
 * round, sunk whole).
 */
function marked(s: Solid, { bin, at: [x, y], d }: Placed, top: number): Solid {
  const { w, depth, r } = measure(bin)
  const floor = top - depth
  const centre: Point = [x + w / 2, y + (r + d) / 2]
  const [z0, z1] = [floor - MARKER.depth, floor + 1]
  if (bin.planet) {
    // A planet's letter, from the board's font, as the sale chip carries it.
    const letter = PLANET_LETTERS[bin.planet]
    const [lo, hi] = box(outlines(BOARD.number.font, letter, 1))
    const k = Math.min(Math.min(w, d - r) * 0.55, 10) / Math.max(hi[0] - lo[0], hi[1] - lo[1])
    const polys = outlines(BOARD.number.font, letter, k).map(c => flatten(c))
    const [cx, cy] = [((lo[0] + hi[0]) / 2) * k, ((lo[1] + hi[1]) / 2) * k]
    sketch(plane('xy', { offset: z0 }), () =>
      drawPolygons(polys, ([u, v]): Point => [u - cx + centre[0], v - cy + centre[1]])
    )
    return subtract(s, extrude(MARKER.depth + 1).new())
  }
  const plan = tokenPlan(bin)
  const all = plan.polys.flat()
  const [lo, hi] = [0, 1].map(m =>
    [0, 1].map(i => (m ? Math.max : Math.min)(...all.map(p => p[i])))
  ) as [Point, Point]
  const c: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
  // Most of the floor, never smaller than the token nor past ENLARGE times it.
  const k = Math.min(
    ENLARGE,
    Math.max(1, (Math.min(w, d - r) * 0.6) / Math.max(hi[0] - lo[0], hi[1] - lo[1]))
  )
  const f = ([u, v]: Point): Point => [centre[0] + (u - c[0]) * k, centre[1] + (v - c[1]) * k]
  for (const poly of plan.polys.map(p => p.map(f))) {
    let cut = move(prism(poly, z1 - z0), 0, 0, z0)
    if (bin.kind !== 'salvo')
      cut = subtract(
        cut,
        move(prism(grow(poly, -LINE, area(poly) < 0 ? 1 : -1), z1 - z0 + 2), 0, 0, z0 - 1)
      )
    s = subtract(s, cut)
  }
  return cutGlyph(
    s,
    plan.face.map(e => ({ outer: e.outer.map(f), holes: e.holes.map(h => h.map(f)) })),
    z0,
    z1
  )
}

/** A tray of bins laid in rows: a chamfered slab, as tall as its deepest bin, with each bin cut and marked. */
function tray(rows: Bin[][]): Solid {
  const {
    bins,
    size: [w, d],
    height,
  } = lay(rows)
  let s = chamferedSlab(
    [
      [0, 0],
      [w, 0],
      [w, d],
      [0, d],
    ],
    height,
    HOLDER.chamfer
  )
  // One cut at a time: a cut by several solids that do not touch cuts nothing.
  for (const p of bins) s = subtract(s, cavity(p, height))
  for (const p of bins) s = marked(s, p, height)
  return s
}

/**
 * A row's columns: each bin's stretch of the tray, across its full depth,
 * as tall as the bin needs. The wall between two bins goes to the taller
 * one; the shorter column reaches 0.5 into the taller, so the two overlap.
 */
export function columns(row: Bin[]): { x0: number; x1: number; height: number; bin: Placed }[] {
  const {
    bins,
    size: [w],
  } = lay([row])
  const tall = bins.map(p => measure(p.bin).depth + HOLDER.floor)
  return bins.map((p, i) => {
    const left = i === 0 ? 0 : tall[i - 1] > tall[i] ? p.at[0] - 0.5 : p.at[0] - HOLDER.wall
    const right =
      i === bins.length - 1
        ? w
        : tall[i + 1] > tall[i]
          ? p.at[0] + measure(p.bin).w + 0.5
          : bins[i + 1].at[0]
    return { x0: left, x1: right, height: tall[i], bin: p }
  })
}

/** A one-row tray whose height follows each bin: a column a bin, fused, the outer sides chamfered, then the bins cut. */
function steppedTray(row: Bin[]): Solid {
  const {
    size: [, d],
  } = lay([row])
  const cols = columns(row)
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
  )
  let s: Solid = fuse(...pieces)
  for (const c of cols) s = subtract(s, cavity(c.bin, c.height))
  for (const c of cols) s = marked(s, c.bin, c.height)
  return s
}

/** The pool tray, and a caddy for each player in their colour. */
export const buildPoolTray = () => steppedTray(POOL)
export const buildCaddy = () => tray(CADDY)

/** Outer size and height of the pieces, and what the pool tray's steps save against a flat slab (mm3, before chamfers). */
export function holderInfo() {
  const pool = lay([POOL])
  const caddy = lay(CADDY)
  const saved = columns(POOL).reduce(
    (v, c) => v + (pool.height - c.height) * (c.x1 - c.x0) * pool.size[1],
    0
  )
  return { pool, caddy, saved }
}

// ---- Viewer: the trays filled ----------------------------------------------

const TRAY_COLOUR = '#e8dfc8'
const KIND_COLOURS: Partial<Record<Kind, string>> = {
  crate: '#2f8f8a',
  data: '#6c4fa3',
  wreck: '#55555a',
}

/** One token of a bin's kind in its own frame, as it lies in the bin. */
function tokenOf({ kind, n = 1 }: Bin, planet?: Planet): Solid {
  switch (kind) {
    case 'crate':
      return buildCrateToken()
    case 'data':
      return buildDataToken()
    case 'wreck':
      return buildWreckToken()
    case 'chip':
      return buildSaleChip(planet ?? 'alpha')
    case 'salvo':
      return turn(buildSalvo(n), 'z', 90)
    case 'escort':
      return buildEscortMarker()
  }
}

/**
 * Where `count` tokens lie in a bin whose inner front-left corner is at
 * `at`, layer by layer from the back: each token's origin, its tray's top at
 * `top`.
 */
export function slots(
  { bin, at: [x, y] }: { bin: Bin; at: Point },
  top: number,
  count: number
): [number, number, number][] {
  const {
    grid: [cols, rows],
  } = bin
  const {
    size: [tx, ty],
    t,
    centre,
  } = tokenSize(bin)
  const { depth, r } = measure(bin)
  const g = HOLDER.gap
  return Array.from({ length: count }, (_, i) => {
    const layer = Math.floor(i / (cols * rows))
    const c = i % cols
    const row = rows - 1 - (Math.floor(i / cols) % rows)
    return [
      x + g + c * (tx + g) + tx / 2 - centre[0],
      y + r + g + row * (ty + g) + ty / 2 - centre[1],
      top - depth + layer * t + 0.02,
    ]
  })
}

/** Fill a bin with `count` copies of its token, layer by layer from the back, at (ox, oy). */
function fill(p: Placed, top: number, count: number, colour: string, [ox, oy]: Point): void {
  const base = tokenOf(p.bin, p.bin.planet)
  for (const [x, y, z] of slots(p, top, count))
    color(colour, translate(ox + x, oy + y, z, true, base))
  remove(base)
}

/** Fill a laid-out tray's bins at (ox, oy), each from its own top; `player` colours a caddy's tokens. */
function fillAll(placedBins: { bin: Placed; top: number }[], at: Point, player?: number): void {
  for (const { bin: p, top } of placedBins) {
    const k = p.bin.kind
    const colour = (player !== undefined && PLAYER_COLOURS[player]) || TRAY_COLOUR
    if (k === 'salvo' || k === 'escort')
      fill(p, top, k === 'salvo' ? COUNTS.salvo : COUNTS.escort, colour, at)
    else if (k === 'chip' && p.bin.planet) fill(p, top, COUNTS.chip, COLOUR[p.bin.planet], at)
    else fill(p, top, COUNTS[k], KIND_COLOURS[k] ?? TRAY_COLOUR, at)
  }
}

/** The pool tray filled, at (ox, oy). */
export function showPool([ox, oy]: Point = [0, 0]): void {
  color(TRAY_COLOUR, move(buildPoolTray(), ox, oy, 0))
  fillAll(
    columns(POOL).map(c => ({ bin: c.bin, top: c.height })),
    [ox, oy]
  )
}

/** A caddy filled with a player's tokens, in their colour, at (ox, oy). */
export function showCaddy(player: number, [ox, oy]: Point = [0, 0]): void {
  const { bins, height } = lay(CADDY)
  color(PLAYER_COLOURS[player], move(buildCaddy(), ox, oy, 0))
  fillAll(
    bins.map(bin => ({ bin, top: height })),
    [ox, oy],
    player
  )
}

/** The pool tray filled, and the six caddies in a row in front of it. */
export function showPoolAndCaddies([ox, oy]: Point = [0, 0]): void {
  showPool([ox, oy])
  const [cw, cd] = lay(CADDY).size
  for (let i = 0; i < COUNTS.players; i++) showCaddy(i, [ox + i * (cw + 4), oy - cd - 6])
}
