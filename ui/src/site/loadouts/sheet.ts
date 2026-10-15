/**
 * Where the loadout cards sit on printed A4 pages, in millimetres.
 *
 * Nine cards to a page, three columns by three rows, centred, with the player
 * card's gutter between them and its crop marks (`card/sheet.ts`) on every
 * trim line outside the faces. Fronts only: the cards have no back, so a page
 * is simply the next nine in order and the last page holds what is left.
 */
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { GUTTER_MM, type Rect } from '../card/sheet'

/** Mission-card stock: poker size. */
export const LOADOUT_WIDTH_MM = 63
export const LOADOUT_HEIGHT_MM = 88

const COLUMNS = 3
const ROWS = 3
const CARDS_PER_PAGE = COLUMNS * ROWS

/** The grid's slots, row by row: each card's rectangle on the page. */
export function loadoutSlots(): Rect[] {
  const x0 = (SHEET_WIDTH_MM - (COLUMNS * LOADOUT_WIDTH_MM + (COLUMNS - 1) * GUTTER_MM)) / 2
  const y0 = (SHEET_HEIGHT_MM - (ROWS * LOADOUT_HEIGHT_MM + (ROWS - 1) * GUTTER_MM)) / 2
  const slots: Rect[] = []
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLUMNS; col++)
      slots.push({
        x: x0 + col * (LOADOUT_WIDTH_MM + GUTTER_MM),
        y: y0 + row * (LOADOUT_HEIGHT_MM + GUTTER_MM),
        width: LOADOUT_WIDTH_MM,
        height: LOADOUT_HEIGHT_MM,
      })
  return slots
}

/** The pages `cards` print on, each card with the rectangle it takes there. */
export function loadoutPages<T>(cards: readonly T[]): Array<Array<{ card: T } & Rect>> {
  const slots = loadoutSlots()
  const pages: Array<Array<{ card: T } & Rect>> = []
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE)
    pages.push(cards.slice(i, i + CARDS_PER_PAGE).map((card, j) => ({ card, ...slots[j] })))
  return pages
}
