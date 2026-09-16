/**
 * The board's ink and the board's light, in the form three.js wants them.
 *
 * Every colour here is one from `theme.ts`; the only translation is that the
 * SVG board writes its faint lines as `rgba(...)` while a WebGL material takes
 * a solid colour and a separate opacity. `EDGE_HUE` is the hue of
 * `TABLE.plateEdge` and `TABLE.line` — the cool blue-grey every printed line
 * on the table is drawn in.
 *
 * The lighting constants live here too, because a planet is lit twice: once by
 * the scene's lights (which model the plate) and once inside its own shader
 * (which models its terminator). Both read the same key direction and the same
 * two colours from this file, so a planet's shadow always falls the way the
 * board's does. One cool key, one navy fill, one amber lamp at the black hole —
 * the same restraint as the rest of the table.
 */
import { Color, LinearSRGBColorSpace } from 'three'
import { TABLE } from '../../../design/tokens'

/** The hue behind `TABLE.plateEdge` (0.20 alpha) and `TABLE.line` (0.12 alpha). */
export const EDGE_HUE = '#84968e'

export const BOARD_INK = {
  /**
   * Plate under a well: the theme's sunken instrument plate, one step lighter
   * so the key light can model the slope of the funnel.
   */
  plate: '#1b2426',
  plateEdge: EDGE_HUE,
  ring: EDGE_HUE,
  ringOpacity: 0.22,
  ringDash: 0.2,
  tick: EDGE_HUE,
  tickOpacity: 0.34,
  label: TABLE.ink,
  labelOpacity: 0.8,
  caption: TABLE.inkSoft,
  zero: TABLE.accent,
  name: TABLE.ink,
  /** Outline behind laid-flat type, so a number never dissolves into a ribbon. */
  labelOutline: TABLE.felt,
} as const

/**
 * A colour for a shader that writes straight to the canvas.
 *
 * `new Color('#ffb445')` converts to the linear working space, which is what a
 * lit material wants. A raw additive glow does not go through that pipeline —
 * whatever it writes is what the screen shows — so a theme colour handed to one
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
  /** Cool white star light. */
  key: '#c6dcf5',
  keyIntensity: 3.1,
  /** Navy bounce from the sky: the only thing lighting the night side. */
  fill: '#25384f',
  /** A dim back light from the far side, so a hull has an edge against black. */
  rim: '#4c6c92',
  rimIntensity: 0.85,
  rimDirection: [-0.72, 0.28, -0.6] as readonly [number, number, number],
  /** The one warm lamp on the table, at the bottom of the funnel. */
  lamp: TABLE.accent,
} as const

/** The sky: felt, one navy cloud colour, one colder lobe. Nothing brighter. */
export const SKY_INK = {
  base: TABLE.felt,
  cloud: '#1b2f4c',
  cold: '#14303f',
  /** A little extra light along the board's own plane. */
  horizon: '#0a1220',
} as const

/** Star colours, coolest first; the amber ones are rare on purpose. */
export const STAR_TINTS: readonly string[] = [
  '#a9c6f2',
  '#cfe0f5',
  '#e8f0fb',
  '#ffffff',
  '#ffe6c4',
  '#ffbd8e',
]

/**
 * The accretion disc's temperature ramp: near-white at the inner edge, the
 * theme's amber through the body of it, a dim ember at the outside. One hue,
 * three stops — a second hue here would put a colour on the table that means
 * nothing in the rules.
 */
export const DISC_INK = {
  hot: '#fff3dd',
  warm: TABLE.accent,
  ember: '#7a3410',
  /** The hard line at the silhouette of the horizon. */
  rim: TABLE.accent,
  /** The light that went round: the photon ring is hotter than the disc. */
  photon: '#ffd79a',
  /** The glow pooling in the pit. */
  pool: '#ff9a3c',
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
    high: mid.clone().lerp(new Color('#ffffff'), 0.3),
  }
}
