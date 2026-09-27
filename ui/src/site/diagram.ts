/**
 * What every printed diagram is drawn with: the two inks, how a caption is
 * set, and arrowheads under ids of their own. The drawn pieces are in
 * `DiagramParts.tsx`. The cheatsheet's diagrams and the card's are the same
 * drawings at two sizes, so each piece takes its measurements and the
 * drawings keep their own.
 */
import { useId } from 'react'
import { FONT_DISPLAY, PRESS } from '../design/press'

/** Black ink: the ring a move happens on. */
export const INK = PRESS.ink
/** The red: the move itself. */
export const RED = PRESS.red

/** How a caption is set. */
export interface TagFace {
  size: number
  weight: number
  spacing: string
  font: string
}

/** The cheatsheet's captions. */
export const GUIDE_TAG: TagFace = { size: 13, weight: 600, spacing: '0.08em', font: FONT_DISPLAY }

/** A diagram's two arrowheads: their ids and sizes, and what a line's `markerEnd` takes. */
export interface ArrowHeadSet {
  id: string
  sizes: { red: number; ink: number; refX: number }
  red: string
  ink: string
}

/**
 * Arrowheads under ids of their own. Several diagrams share a page, and an id
 * repeated on a page is one diagram pointing at another's marker. Draw them
 * with `<ArrowHeads>` inside the diagram's `<svg>`.
 */
export function useArrowHeads({
  red,
  ink,
  refX = 6,
}: {
  /** The heads' sizes, in stroke widths. */
  red: number
  ink: number
  refX?: number
}): ArrowHeadSet {
  // useId's characters are not all welcome in a url() reference.
  const id = `head${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return { id, sizes: { red, ink, refX }, red: `url(#${id}-red)`, ink: `url(#${id}-ink)` }
}
