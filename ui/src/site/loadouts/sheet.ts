/**
 * Where the loadout cards sit on printed A4 pages, in millimetres.
 *
 * Nine cards to a page, three columns by three rows, centred, with the player
 * card's gutter between them and its crop marks (`card/sheet.ts`) on every
 * trim line outside the faces. A page is the next nine in order and the last
 * page holds what is left; `missions/sheet.ts` puts each page's backs behind it.
 */
import { gridSlots, type Grid, type Rect } from '../card/sheet'

/** Mission-card stock: poker size. */
export const LOADOUT_WIDTH_MM = 63
export const LOADOUT_HEIGHT_MM = 88

/** Nine to a page, three by three. */
export const LOADOUT_GRID: Grid = {
  columns: 3,
  rows: 3,
  width: LOADOUT_WIDTH_MM,
  height: LOADOUT_HEIGHT_MM,
}

/** The pages `cards` print on, each card with the rectangle it takes there. */
export function loadoutPages<T>(cards: readonly T[]): Array<Array<{ card: T } & Rect>> {
  const slots = gridSlots(LOADOUT_GRID)
  const pages: Array<Array<{ card: T } & Rect>> = []
  for (let i = 0; i < cards.length; i += slots.length)
    pages.push(cards.slice(i, i + slots.length).map((card, j) => ({ card, ...slots[j] })))
  return pages
}
