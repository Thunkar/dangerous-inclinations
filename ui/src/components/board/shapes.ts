/**
 * Outlines both boards draw, in board units: the flat board turns them into
 * SVG paths, the 3D board extrudes them into plates.
 */

export type Outline = readonly (readonly [number, number])[]

/** The ship's wedge at 0.6, split along a jagged crack: the bow of a wreck. */
export const WRECK_BOW: Outline = [
  [9, 0],
  [1.5, 2.5],
  [2.6, 0.8],
  [0.9, -0.6],
  [2, -2.33],
]

/** The stern of the same wedge, on the other side of the crack. */
export const WRECK_STERN: Outline = [
  [1.5, 2.5],
  [-5.4, 4.8],
  [-5.4, -4.8],
  [2, -2.33],
  [0.9, -0.6],
  [2.6, 0.8],
]

/** An outline as a closed SVG path. */
export function outlinePath(outline: Outline): string {
  return `${outline.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')} Z`
}
