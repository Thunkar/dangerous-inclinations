/**
 * The flat board's inks: the table's cream and red (`design/tokens.ts`) and
 * the press's display face, at the strengths the board prints them.
 *
 * The board is the table at night, not a sheet of paper: an ink ground, cream
 * print, one red. It is flat the way the press is flat, so nothing on it glows,
 * blurs or shades; where a line has to be set off from what it crosses, it is
 * edged in the ground colour, which is a flat outline and not a shadow.
 *
 * Every colour here is a token or a token at an opacity; the planets' inks are
 * the wells' own (`geometry.ts`), shared with the 3D board.
 */
import { TABLE } from '../../../design/tokens'
import { ACCRETION_ORANGE } from '../geometry'

export { FONT_DISPLAY } from '../../../design/press'

/** `#rrggbb` at an opacity, so a token can be printed thinner without a new hex. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** The table's cream at an opacity: every ring, tick and number. */
export function cream(alpha: number): string {
  return withAlpha(TABLE.ink, alpha)
}

export const BOARD = {
  /** The ground a track or a token is edged in. */
  ground: TABLE.felt,
  /** A step blacker than the felt: the well plates, the hole, a badge's hollow. */
  deep: TABLE.bar,
  /** Cream print. */
  ink: TABLE.ink,
  inkSoft: TABLE.inkSoft,
  inkFaint: TABLE.inkFaint,
  /** Red as a line or as type: sector 0, threat, what you may click. */
  red: TABLE.accent,
  /** The hole's rim: its accretion disc, seen from above. */
  disc: ACCRETION_ORANGE,
  /** A shield absorbing: the fuel/teal ink, the table's one cool colour. */
  teal: TABLE.teal,
  good: TABLE.success,
  heat: TABLE.heat,
} as const
