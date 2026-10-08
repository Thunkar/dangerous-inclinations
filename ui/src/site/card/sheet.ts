/**
 * Where the card's faces sit on a printed A4 sheet, in millimetres.
 *
 * Four faces to a page, two columns by two rows, centred, with one gutter
 * between them and crop marks on every trim line outside the faces. A sheet
 * printed on one side carries two cards, each front beside its back. A sheet
 * printed on both sides carries four fronts on the first page and four backs
 * on the second, each back where the printer's flip puts it behind its front:
 * mirrored left to right for a flip on the long edge, top to bottom (and
 * turned over) for a flip on the short edge. The mirror is taken of the page,
 * not of the grid, so it stays right if the grid ever stops being symmetric.
 */
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './cardStyles'

/** Between two faces: room to cut once on each side and for the marks between. */
export const GUTTER_MM = 4
const COLUMNS = 2
const ROWS = 2

/** How far a crop mark stays off the trim corner, and how long it runs. */
const MARK_GAP_MM = 0.5
const MARK_LENGTH_MM = 5
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

export interface PlacedFace extends Rect {
  face: Face
  /** Turned 180° about its centre. */
  rotated: boolean
}

export interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** The grid's slots, row by row: the top-left corner of each face. */
export function gridSlots(): Array<{ x: number; y: number }> {
  const x0 = (SHEET_WIDTH_MM - (COLUMNS * CARD_WIDTH_MM + (COLUMNS - 1) * GUTTER_MM)) / 2
  const y0 = (SHEET_HEIGHT_MM - (ROWS * CARD_HEIGHT_MM + (ROWS - 1) * GUTTER_MM)) / 2
  const slots: Array<{ x: number; y: number }> = []
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLUMNS; col++)
      slots.push({
        x: x0 + col * (CARD_WIDTH_MM + GUTTER_MM),
        y: y0 + row * (CARD_HEIGHT_MM + GUTTER_MM),
      })
  return slots
}

function place(face: Face, at: { x: number; y: number }, rotated = false): PlacedFace {
  return { face, x: at.x, y: at.y, width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM, rotated }
}

/** Behind a front when the sheet turns over on its long (vertical) edge. */
export function behindLongEdge(front: Rect): PlacedFace {
  return place('back', { x: SHEET_WIDTH_MM - front.x - front.width, y: front.y })
}

/** Behind a front when the sheet turns over on its short (horizontal) edge. */
export function behindShortEdge(front: Rect): PlacedFace {
  return place('back', { x: front.x, y: SHEET_HEIGHT_MM - front.y - front.height }, true)
}

/** The pages a mode prints, each a list of the faces on it. */
export function sheetPages(mode: PrintMode): PlacedFace[][] {
  const slots = gridSlots()
  if (mode === 'sheet')
    return [slots.map((slot, i) => place(i % COLUMNS === 0 ? 'front' : 'back', slot))]
  const fronts = slots.map(slot => place('front', slot))
  const behind = mode === 'duplex-long' ? behindLongEdge : behindShortEdge
  return [fronts, fronts.map(behind)]
}

/**
 * The crop marks for a page: every face corner extended outward along both
 * of its edges, stopping short of the next face or the unprintable edge.
 */
export function cropMarks(faces: Rect[]): Line[] {
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
          const end = Math.min(MARK_GAP_MM + MARK_LENGTH_MM, free - MARK_GAP_MM)
          if (end <= MARK_GAP_MM) continue
          add({
            x1: x + dx * MARK_GAP_MM,
            y1: y + dy * MARK_GAP_MM,
            x2: x + dx * end,
            y2: y + dy * end,
          })
        }
      }
  }
  return marks
}
