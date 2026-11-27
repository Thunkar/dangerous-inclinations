/**
 * Where a card's faces sit on a printed A4 sheet, in millimetres.
 *
 * The decks' faces sit in a grid, centred, with crop marks on every trim
 * line outside the faces. A grid may have no gutter (`Grid.gutter`): its
 * cards touch and one cut separates two of them. Their backs sit where the
 * printer's flip puts each behind its front: mirrored left to right for a
 * flip on the long edge, top to bottom for a flip on the short edge, and
 * turned so that the card, turned over on its own long side, reads upright.
 * The mirror is taken of the page, not of the grid, so it stays right if the
 * grid ever stops being symmetric.
 *
 * The player card and the subsystems card print two faces a page, each a
 * quarter turn round (`Turn`), one above the other and touching
 * (`cardPages`): on one side a card's front above its back, on both sides
 * two fronts and then their two backs.
 */
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '../print/frame'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './cardStyles'

/** How far a crop mark stays off the trim corner and off whatever stops it. */
const MARK_GAP_MM = 0.5
/** How wide a cut line is drawn: anywhere the blade lands on it cuts clean. */
export const CUT_BAND_MM = 1
/** Printers do not reach the paper's edge; no mark runs into this. */
const UNPRINTABLE_MM = 5

export type PrintMode = 'sheet' | 'duplex-long' | 'duplex-short'
export type Face = 'front' | 'back'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** How far a face is turned on the page, clockwise, in degrees. */
export type Turn = 0 | 90 | 180 | 270

/**
 * A face in its slot. The rectangle is the slot on the page; a face turned a
 * quarter round is the slot's height wide and its width tall.
 */
export interface PlacedFace extends Rect {
  face: Face
  turn: Turn
}

export interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A grid of equal cards on the page: how many across and down, each card's size and the gap between. */
export interface Grid {
  columns: number
  rows: number
  width: number
  height: number
  gutter: number
}

/** The grid's slots, row by row, centred on the page with its gutter between: each card's rectangle. */
export function gridSlots({ columns, rows, width, height, gutter }: Grid): Rect[] {
  const x0 = (SHEET_WIDTH_MM - (columns * width + (columns - 1) * gutter)) / 2
  const y0 = (SHEET_HEIGHT_MM - (rows * height + (rows - 1) * gutter)) / 2
  const slots: Rect[] = []
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++)
      slots.push({
        x: x0 + col * (width + gutter),
        y: y0 + row * (height + gutter),
        width,
        height,
      })
  return slots
}

/**
 * Behind a front when the sheet turns over on its long (vertical) edge. A
 * back is its front's size. An upright card turns over the way the sheet
 * does, so its back stays upright; a card on its side turns over across the
 * sheet's turn, so its back is turned the other way round.
 */
export function behindLongEdge(front: Rect & { turn: Turn }): PlacedFace {
  const { width, height } = front
  return {
    face: 'back',
    x: SHEET_WIDTH_MM - front.x - width,
    y: front.y,
    width,
    height,
    turn: ((360 - front.turn) % 360) as Turn,
  }
}

/**
 * Behind a front when the sheet turns over on its short (horizontal) edge.
 * An upright card turns over across the sheet's turn, so its back is turned
 * upside down; a card on its side turns over the way the sheet does, so its
 * back keeps its front's turn.
 */
export function behindShortEdge(front: Rect & { turn: Turn }): PlacedFace {
  const { width, height } = front
  return {
    face: 'back',
    x: front.x,
    y: SHEET_HEIGHT_MM - front.y - height,
    width,
    height,
    turn: ((540 - front.turn) % 360) as Turn,
  }
}

/**
 * The player card's and the subsystems card's grid: two faces on their sides,
 * one above the other, touching, so a slot is the card's height wide.
 */
export const CARD_GRID: Grid = {
  columns: 1,
  rows: 2,
  width: CARD_HEIGHT_MM,
  height: CARD_WIDTH_MM,
  gutter: 0,
}

/** How far the player card and the subsystems card are turned on the page. */
export const CARD_TURN: Turn = 90

/**
 * The pages a mode prints of the player card or the subsystems card, every
 * face a quarter turn round. On one side, one page: the front above its
 * back, to cut out and glue. On both, two fronts and then, on the next page,
 * each one's back where the flip puts it.
 */
export function cardPages(mode: PrintMode): PlacedFace[][] {
  const slots = gridSlots(CARD_GRID)
  if (mode === 'sheet')
    return [
      slots.map((slot, i) => ({
        ...slot,
        face: i === 0 ? ('front' as const) : ('back' as const),
        turn: CARD_TURN,
      })),
    ]
  const fronts = slots.map(slot => ({ ...slot, face: 'front' as const, turn: CARD_TURN }))
  const behind = mode === 'duplex-long' ? behindLongEdge : behindShortEdge
  return [fronts, fronts.map(behind)]
}

/**
 * The crop marks for a page: every face corner extended outward along both
 * of its edges as far as the next face or the unprintable edge. Where two
 * faces touch there is no room, so a shared trim line is marked only outside
 * the grid. A mark starts `from` off its corner: past a bleed, where one runs
 * round the faces.
 */
export function cropMarks(faces: Rect[], from: number = MARK_GAP_MM): Line[] {
  const marks: Line[] = []
  const seen = new Set<string>()
  const add = (line: Line) => {
    // A mark in a gutter is drawn from both of its faces: once is enough.
    const ends = [
      `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`,
      `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`,
    ]
    const key = ends.sort().join(' ')
    if (seen.has(key)) return
    seen.add(key)
    marks.push(line)
  }
  // How far from (x, y) in direction (dx, dy) the way is clear of faces and the edge.
  const room = (x: number, y: number, dx: number, dy: number) => {
    let free =
      dx > 0
        ? SHEET_WIDTH_MM - UNPRINTABLE_MM - x
        : dx < 0
          ? x - UNPRINTABLE_MM
          : dy > 0
            ? SHEET_HEIGHT_MM - UNPRINTABLE_MM - y
            : y - UNPRINTABLE_MM
    for (const f of faces) {
      if (dx !== 0 && y >= f.y && y <= f.y + f.height) {
        const d = dx > 0 ? f.x - x : x - (f.x + f.width)
        if (d >= 0) free = Math.min(free, d)
      }
      if (dy !== 0 && x >= f.x && x <= f.x + f.width) {
        const d = dy > 0 ? f.y - y : y - (f.y + f.height)
        if (d >= 0) free = Math.min(free, d)
      }
    }
    return free
  }
  for (const f of faces) {
    for (const [x, sx] of [
      [f.x, -1],
      [f.x + f.width, 1],
    ])
      for (const [y, sy] of [
        [f.y, -1],
        [f.y + f.height, 1],
      ]) {
        // Along the horizontal edge, outward in x; along the vertical edge, outward in y.
        for (const [dx, dy] of [
          [sx, 0],
          [0, sy],
        ]) {
          const free = room(x, y, dx, dy)
          const end = free - MARK_GAP_MM
          if (end <= from) continue
          add({
            x1: x + dx * from,
            y1: y + dy * from,
            x2: x + dx * end,
            y2: y + dy * end,
          })
        }
      }
  }
  return marks
}
