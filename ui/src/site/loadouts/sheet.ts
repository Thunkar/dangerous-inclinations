/**
 * Where the loadout cards sit on printed A4 pages, in millimetres.
 *
 * Nine cards to a page, three columns by three rows, centred, touching, so
 * one cut separates two cards, with the crop marks (`card/sheet.ts`) on every
 * trim line outside the grid. The duplex shifts the backs off their fronts,
 * and the backs' plain frame (`missions/backs.tsx`) is what hides it. A page is the next nine in order and the last
 * page holds what is left; `missions/sheet.ts` puts each page's backs behind it.
 */
import { FRONT_FRAME_MM } from '../card/cardStyles'
import { gridSlots, type Grid, type Rect } from '../card/sheet'

/** Mission-card stock: the standard sleeve's card (Magic's), 63 x 88. */
export const LOADOUT_WIDTH_MM = 63
export const LOADOUT_HEIGHT_MM = 88

/**
 * How much smaller the art is drawn inside the frame of paper round every
 * front (`FRONT_FRAME_MM`), the same both ways, so a cut that misses its line
 * lands in the frame.
 */
export const ART_SCALE = (LOADOUT_WIDTH_MM - 2 * FRONT_FRAME_MM) / LOADOUT_WIDTH_MM
/** Where the art sits inside the frame: the frame at the sides, the rest above and below. */
export const ART_TOP_MM = (LOADOUT_HEIGHT_MM * (1 - ART_SCALE)) / 2

/** Nine to a page, three by three. */
export const LOADOUT_GRID: Grid = {
  columns: 3,
  rows: 3,
  width: LOADOUT_WIDTH_MM,
  height: LOADOUT_HEIGHT_MM,
  gutter: 0,
}

/** The pages `cards` print on, each card with the rectangle it takes there. */
export function loadoutPages<T>(cards: readonly T[]): Array<Array<{ card: T } & Rect>> {
  const slots = gridSlots(LOADOUT_GRID)
  const pages: Array<Array<{ card: T } & Rect>> = []
  for (let i = 0; i < cards.length; i += slots.length)
    pages.push(cards.slice(i, i + slots.length).map((card, j) => ({ card, ...slots[j] })))
  return pages
}
