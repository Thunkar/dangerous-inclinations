/**
 * The subsystems card's grid, in millimetres. The card's size, its frame
 * and how it prints are the player card's (`print/frame.ts`,
 * `card/sheet.ts`'s `cardPages`).
 *
 * Each face is two columns by four rows of equal cells, the title and seven
 * tiles a face, set in a field of the band's ink: the band runs on between
 * the cells as the gutters, so frame and grid are one lattice of ink. The
 * field's edge is the same on both faces (`SX_BAND_MM`: on a front it
 * widens the band), so the cells are the same on both. A tile is laid
 * out at the compact tile's own sizes (`TILE`), a cell `SX_TILE_W_MM` by
 * `SX_TILE_H_MM`, and the grid is zoomed by `SX_SCALE` to the cells.
 */
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, FRAME_MM } from '../print/frame'

export const SX_COLS = 2
export const SX_ROWS = 4
/**
 * The band of ink round the grid on both faces: the back's and a little
 * more, so the marks in a tile's corner keep `CLEAR_MM` off the frame.
 */
export const SX_BAND_MM = FRAME_MM.back + 0.3
/** The ink between two cells as printed. */
export const SX_GAP_MM = 1.2

/** What a tile needs at scale 1: the band and the drawing set its width, the stacked fans its height. */
export const TILE_NEEDS = { width: 45.8, height: 34.85 }

const CELL_W = (CARD_WIDTH_MM - 2 * SX_BAND_MM - (SX_COLS - 1) * SX_GAP_MM) / SX_COLS
const CELL_H = (CARD_HEIGHT_MM - 2 * SX_BAND_MM - (SX_ROWS - 1) * SX_GAP_MM) / SX_ROWS

/** How much smaller than drawn the tiles print: the largest scale the cells allow, never above 1. */
export const SX_SCALE = Math.min(1, CELL_W / TILE_NEEDS.width, CELL_H / TILE_NEEDS.height)

/** A cell as drawn, before the zoom. */
export const SX_TILE_W_MM = CELL_W / SX_SCALE
export const SX_TILE_H_MM = CELL_H / SX_SCALE

/**
 * Inside a tile: its border, the name band (the tile's top edge, with the
 * numbers in its corner), the padding round its body, the line of the slot
 * and what turns it face up, the gap under it, and the drawing's height.
 */
export const TILE = {
  border: 0.35,
  band: 5.2,
  pad: { x: 1.2, top: 0.45, bottom: 0.45 },
  line: 2.2,
  gap: 0.45,
  draw: 20.2,
} as const
