/**
 * The table: the press's black, cream and red (`press.ts`), set as a screen.
 *
 * The printed matter is cream paper and black ink. The table is the same inks
 * at night: an ink ground, cream print, and one red, which is both what you
 * can act on and what hurts. Every text colour here reads at 4.5:1 or better
 * on `felt` and `plate`. Corners are square and nothing glows; a panel is a
 * flat plate with a hairline edge.
 *
 * Two reds, on purpose: `accentBlock` is the poster red, for solid fills with
 * `onAccent` type on them (End turn, the turn header, the mark); `accent` is
 * the same red lifted until it reads as text or a thin line on the ink.
 */
export const TABLE = {
  /** The table surface. */
  felt: '#121417',
  feltLight: '#16181c',

  /** The app bar: a step blacker than the table, ruled off in red. */
  bar: '#0a0b0d',

  /** Instrument plates. */
  plate: '#1a1d21',
  plateHi: '#23272c',
  plateSunk: '#15171b',
  plateEdge: 'rgba(236,228,208,0.14)',
  line: 'rgba(236,228,208,0.09)',
  /** A plate under the pointer: the print showing through a little more. */
  hover: 'rgba(236,228,208,0.05)',
  /** An empty cell of a track or an energy row, and its outline. */
  unlit: 'rgba(236,228,208,0.09)',
  unlitEdge: 'rgba(236,228,208,0.24)',
  /** A face-down slot: flat cream hatching on `faceDown`, no shading. */
  hatch: 'rgba(236,228,208,0.07)',
  /** Black laid over a block: the diagonal band on the red, a scrim. */
  shade: 'rgba(0,0,0,0.22)',
  scrim: 'rgba(0,0,0,0.6)',

  /** Text: cream print on the ink. */
  ink: '#ece4d0',
  inkSoft: '#b4ab98',
  inkFaint: '#8f887a',

  /** Red as type or a line on the ink (5:1). */
  accent: '#f04a5e',
  /** The poster red, pressed flat: blocks only, `onAccent` on top. */
  accentBlock: '#d21b33',
  accentDim: '#a8182b',
  accentGlow: 'rgba(210,27,51,0.35)',
  /** Type on a red block. */
  onAccent: '#f1ece0',
  /** A tint of the red behind a line of red type (an alert, a warning row). */
  accentWash: 'rgba(240,74,94,0.10)',

  /**
   * The option you picked: a cream block with ink type. Red is kept for the
   * one thing that ends the turn, so a choice made is cream, not red.
   */
  selected: '#ece4d0',
  onSelected: '#121417',

  /** Data colours, from the press's inks. */
  hull: '#ece4d0',
  heat: '#ff4a5c',
  energy: '#ece4d0',
  fuel: '#3fb0c8',
  teal: '#3fb0c8',
  danger: '#ff4a5c',
  success: '#5fae7a',
  faceDown: '#2a2d31',
  /**
   * The press's violet and ochre (`press.ts`), lifted to read on the ink: the
   * mission families, the lanes of the planets printed in them (with `teal`),
   * and the railgun's slug. Combat is the red and trade the teal above.
   */
  violet: '#b48cf0',
  ochre: '#dc9a3a',
  /** Tints of the data colours, behind a line of their own type. */
  fuelWash: 'rgba(63,176,200,0.12)',
  successWash: 'rgba(95,174,122,0.12)',
} as const
