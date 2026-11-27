/**
 * The size and the frame the player card and the subsystems card share, in
 * millimetres.
 *
 * Both are cut 102x152, the size of a 4x6in photo sleeve. Every face has a
 * band of solid ink at its edge, and on the printed page the band runs
 * `FRAME_BLEED_MM` past the cut: a cut that misses its line, inward or
 * outward, lands on ink, never on a sliver of paper. A back's band is wider
 * than a front's, since a duplex printer shifts the backs off their fronts
 * and the cut follows the fronts.
 *
 * What is printed fills the inside of the band and may join it: a solid
 * block of the same ink runs into the band and reads as one piece with it.
 * Words, marks and drawings keep `CLEAR_MM` of paper off the band. Front and
 * back need not line up through the paper, so each face is laid out inside
 * its own band.
 */
import type { CSSProperties } from 'react'
import { PRESS } from '../../design/press'
import type { Face } from '../card/sheet'

/** The card as it is cut. */
export const CARD_WIDTH_MM = 102
export const CARD_HEIGHT_MM = 152

/** The band of ink inside the cut, on each face. */
export const FRAME_MM: Record<Face, number> = { front: 3, back: 4.5 }
/** How far the band runs past the cut on the printed page. */
export const FRAME_BLEED_MM = 3
/** Where a crop mark starts, off its corner: clear of the bleed. */
export const MARK_FROM_MM = FRAME_BLEED_MM + 0.5
/** The least paper between the band and a word, a mark or a drawing. */
export const CLEAR_MM = 1

/** What is inside a face's band. */
export const INSIDE_MM: Record<Face, { width: number; height: number }> = {
  front: inside('front'),
  back: inside('back'),
}
function inside(face: Face) {
  return {
    width: CARD_WIDTH_MM - 2 * FRAME_MM[face],
    height: CARD_HEIGHT_MM - 2 * FRAME_MM[face],
  }
}

/** A face's frame: its band of ink, and what is printed filling the inside up to it. */
export function frameStyle(face: Face): CSSProperties {
  return {
    width: `${CARD_WIDTH_MM}mm`,
    height: `${CARD_HEIGHT_MM}mm`,
    boxSizing: 'border-box',
    border: `${FRAME_MM[face]}mm solid ${PRESS.ink}`,
  }
}
