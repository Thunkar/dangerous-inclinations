/**
 * The thinnest line printed matter draws. A colour laser prints a line under
 * about 0.15mm weak and soft, so every stroke on a printed card is at least
 * this wide at the size it prints, and solid: a tint or a near-black is
 * screened into dots, and a thin line of dots prints blurred.
 */
import { createContext, useContext } from 'react'

export const HAIRLINE_MM = 0.15

/**
 * How much larger or smaller than drawn a face prints: 1 by default, the
 * face's zoom on the player card and the subsystems card.
 */
export const PrintScale = createContext(1)

/** The hairline in a drawing's millimetres, for the scale the drawing prints at. */
export function useHairline(): number {
  return HAIRLINE_MM / useContext(PrintScale)
}
