/**
 * The board's ink and the board's light, in the form three.js wants them.
 *
 * The table is the press at night (`design/tokens.ts`): an ink ground, cream
 * print and one red. Every colour here is one from `tokens.ts` or is named
 * below with the reason it is not; the only translation is that the flat board
 * writes its faint lines as `rgba(...)` while a WebGL material takes a solid
 * colour and a separate opacity. `EDGE_HUE` is the hue of `TABLE.plateEdge`
 * and `TABLE.line`: the cream every printed line on the table is drawn in.
 *
 * The lighting constants live here too, because a planet is lit twice: once by
 * the scene's lights (which model the plate) and once inside its own shader
 * (which models its terminator). Both read the same key direction and the same
 * two colours from this file, so a planet's shadow always falls the way the
 * board's does. One near-white key with a breath of cold in it, an ink fill,
 * and one orange lamp at the black hole, the colour of its disc: the same
 * restraint as the rest of the table. The lights may be cool, because space
 * is; the plate they fall on is warm ink, picked warm enough to stay ink.
 */
import { Color, LinearSRGBColorSpace } from 'three'
import { TABLE } from '../../../design/tokens'
import { ACCRETION_ORANGE } from '../geometry'

/** The hue behind `TABLE.plateEdge` (0.14 alpha) and `TABLE.line` (0.09 alpha). */
export const EDGE_HUE = TABLE.ink

export const BOARD_INK = {
  /**
   * Plate under a well: the theme's plate one step lighter, so the key light
   * can model the slope of the funnel, and pulled a little warm, because the
   * cool key pushes a neutral grey toward navy and the plate is ink, not sky.
   */
  plate: '#211f1d',
  plateEdge: EDGE_HUE,
  plateEdgeOpacity: 0.12,
  ring: EDGE_HUE,
  ringOpacity: 0.17,
  ringDash: 0.2,
  tick: EDGE_HUE,
  tickOpacity: 0.24,
  label: TABLE.ink,
  labelOpacity: 0.8,
  caption: TABLE.inkSoft,
  zero: TABLE.accent,
  name: TABLE.ink,
  /** Outline behind laid-flat type, so a number never dissolves into a ribbon. */
  labelOutline: TABLE.felt,
  /** Outline behind a floating number: the bar's black, a step under the felt. */
  floatOutline: TABLE.bar,
} as const

/**
 * A colour for a shader that writes straight to the canvas.
 *
 * `new Color('#f04a5e')` converts to the linear working space, which is what a
 * lit material wants. A raw additive glow does not go through that pipeline
 * (whatever it writes is what the screen shows) so a theme colour handed to one
 * unconverted comes out a hue or two too saturated. This keeps the numbers as
 * the theme wrote them.
 */
export function inkColor(hex: string): Color {
  return new Color().setStyle(hex, LinearSRGBColorSpace)
}

/**
 * The key light, as a direction *toward* the star. Matches the scene's
 * directional light so the shaded planets and the lit plate agree.
 */
export const KEY_DIRECTION: readonly [number, number, number] = [0.42, 0.79, 0.44]

/**
 * The key the *bodies* are shaded by: the same bearing as the scene's, dropped
 * to about twenty degrees of elevation. A light almost overhead models the
 * slope of a plate beautifully and leaves a sphere with no terminator at all,
 * and the terminator is most of what makes a planet look like a world. Same
 * bearing, so a planet's night side is on the same side as the plate's shadow.
 */
export const BODY_KEY_DIRECTION: readonly [number, number, number] = [0.644, 0.375, 0.667]

export const SCENE_LIGHT = {
  /** Star light: white with a breath of cold, so the cream print stays the warm thing. */
  key: '#e1e6ee',
  keyIntensity: 3.1,
  /** Bounce from the sky: a cold ink, the only thing lighting the night side. */
  fill: '#262a33',
  /** The hemisphere's lower half: the ink under the board, lighting nothing. */
  ground: '#060708',
  /** A dim back light from the far side, so a hull has an edge against black. */
  rim: '#5d6573',
  rimIntensity: 0.85,
  rimDirection: [-0.72, 0.28, -0.6] as readonly [number, number, number],
  /** The one lamp on the table, at the bottom of the funnel: the disc's orange. */
  lamp: ACCRETION_ORANGE,
} as const

/**
 * The sky: the felt, one cloud colour a step off it, one colder lobe. Ink, not
 * blue: the table around the board is near-black and the sky must meet it.
 */
export const SKY_INK = {
  base: TABLE.felt,
  cloud: '#1f1d21',
  cold: '#151b1e',
  /** A little extra light along the board's own plane. */
  horizon: '#141312',
} as const

/** Star colours, coolest first; the red ones are rare on purpose. */
export const STAR_TINTS: readonly string[] = [
  '#c8d2de',
  '#e2e6ec',
  '#f4f1ea',
  '#ffffff',
  TABLE.ink,
  '#f2b3aa',
]

/**
 * The accretion disc's temperature ramp: near-white at the inner edge, a hot
 * orange through the body of it, a dim ember at the outside. This is the one
 * place on the table that is drawn as physics rather than printed: the disc is
 * the colour hot gas is, not an ink, and it means nothing in the rules. Its
 * light (the pit's glow and `SCENE_LIGHT.lamp`) is the same orange.
 */
export const DISC_INK = {
  hot: '#fff3dd',
  warm: ACCRETION_ORANGE,
  ember: '#7a3410',
  /** The hard line at the silhouette of the horizon. */
  rim: ACCRETION_ORANGE,
  /** The light that went round: the photon ring is hotter than the disc. */
  photon: '#ffd79a',
  /** The glow pooling in the pit. */
  pool: '#ff9a3c',
  /** The inside of the horizon: darker than the felt, the blackest thing on the table. */
  void: '#000000',
} as const

/**
 * A planet's atmosphere and weather. The clouds are cream bleached nearly
 * white, and the limb goes toward the same warm white where the star grazes it.
 */
export const AIR_INK = {
  cloud: '#f3efe6',
  day: '#fff1dc',
} as const

/**
 * Each planet's three-stop ramp, derived from its printed colour: a deep shade
 * for the low ground and the night, the printed colour itself for the body of
 * the surface, and a pale one for cloud tops, crater rims and highlands.
 */
export function bodyRamp(hex: string): { deep: Color; mid: Color; high: Color } {
  const mid = new Color(hex)
  return {
    deep: mid.clone().multiplyScalar(0.34),
    mid: mid.clone(),
    high: mid.clone().lerp(new Color(AIR_INK.day), 0.3),
  }
}

/**
 * What the effects are drawn in. Danger and heat are the table's red, a
 * critical is the white-hot cream, a shield is the teal the table uses for
 * what protects, a miss is faint print, and a good thing is the table's green.
 */
export const FX_INK = {
  damage: TABLE.danger,
  crit: DISC_INK.hot,
  heat: TABLE.heat,
  shield: TABLE.teal,
  miss: TABLE.inkFaint,
  good: TABLE.success,
  /** A burning engine: fuel's teal. */
  plume: TABLE.fuel,
  /** The core of a jump's flash: white-hot, like the inside of the disc. */
  core: DISC_INK.hot,
} as const
