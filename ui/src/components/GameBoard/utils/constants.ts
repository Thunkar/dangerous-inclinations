/**
 * GameBoard configuration constants
 */

export const BOARD_CONFIG = {
  /** Total board size in pixels */
  BOARD_SIZE: 1850,
  /** Maximum extent from center (planet distance + planet outermost ring) */
  MAX_EXTENT: 710,
  /** Padding around the board edges */
  PADDING: 100,
} as const

export const MINIMAP_CONFIG = {
  /** Minimap size in pixels */
  SIZE: 150,
  /** Margin from screen edges */
  MARGIN: 20,
} as const

export const ZOOM_CONFIG = {
  /** Minimum zoom level */
  MIN: 0.5,
  /** Maximum zoom level */
  MAX: 3,
  /** Zoom delta per scroll */
  DELTA_MULTIPLIER_IN: 1.1,
  DELTA_MULTIPLIER_OUT: 0.9,
} as const

/**
 * Calculate scale factor to fit all gravity wells on the board
 */
export function calculateScaleFactor(boardSize: number): number {
  return (boardSize / 2 - BOARD_CONFIG.PADDING) / BOARD_CONFIG.MAX_EXTENT
}

/**
 * Derived board constants - calculated once from BOARD_CONFIG
 */
export const BOARD_SIZE = BOARD_CONFIG.BOARD_SIZE
export const BOARD_CENTER_X = BOARD_SIZE / 2
export const BOARD_CENTER_Y = BOARD_SIZE / 2
export const BOARD_SCALE_FACTOR = calculateScaleFactor(BOARD_SIZE)
