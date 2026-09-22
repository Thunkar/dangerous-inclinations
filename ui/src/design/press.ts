/**
 * The press: the paper and inks of everything in the game that is printed.
 *
 * The table is a dark instrument panel (`tokens.ts`). What would come out of
 * a box is not: the mission cards, the player card, and the site around the
 * video game are one flat constructivist sheet, cream paper and black ink with
 * one strong red, the way a two-colour poster was pulled. Teal, violet and
 * ochre are the other card families' inks and appear only where a family does.
 *
 * Flat means flat: no gradient, no shadow, no rounded corner, no glow. A shape
 * is a solid fill or a black rule.
 */
import type { MissionFamily } from '@dangerous-inclinations/engine'

export const PRESS = {
  paper: '#e9dfc7',
  /** A second sheet, for a band that has to read as separate from the page. */
  paperDeep: '#ddd0b0',
  ink: '#14161a',
  /** Secondary text on paper; still 6.5:1. */
  inkSoft: 'rgba(20,22,26,0.74)',
  /** Rules and hairlines only: too pale for text. */
  inkFaint: 'rgba(20,22,26,0.28)',
  /** Paper printed on black, for text on an ink block. */
  paperSoft: 'rgba(233,223,199,0.72)',
  /** The red of the posters. Large type and solid blocks. */
  red: '#d21b33',
  /** The same red pressed harder, for red text under 18px (5:1 on paper). */
  redText: '#b01328',
  teal: '#0e7c94',
  /** Intel's ink, pressed as hard as the red: the same contrast on paper and under black. */
  violet: '#8a4fb8',
  ochre: '#c07a14',
} as const

/**
 * A mission family as it prints. The table's screen colours are mixed for a
 * dark felt and have no bite on cream: the same hues, pressed harder.
 */
export const FAMILY_INK: Record<MissionFamily, string> = {
  combat: PRESS.red,
  trade: PRESS.teal,
  intel: PRESS.violet,
  secondary: PRESS.ochre,
}

/**
 * The poster face: a condensed grotesque, set in capitals. Bundled
 * (`@fontsource-variable/oswald`), because the table tools are meant to work
 * on a phone with the signal gone, and a narrow fallback keeps the shape if it
 * has not loaded yet.
 */
export const FONT_DISPLAY =
  '"Oswald Variable", Oswald, "Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif'

/** The angle of the one diagonal every printed thing carries (the cards' band). */
export const BAND_ANGLE = 32
