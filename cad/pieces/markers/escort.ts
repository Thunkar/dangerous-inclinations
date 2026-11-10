// The Escort marker: up to two per player (one per Escort card), in their
// colour, put face-up on the table beside the base of the rival it escorts.
// The Escort glyph's shield with its hull cut through as a stencil: it reads
// as the escort card's mark, the colour says whose.
import type { Solid } from '../../lib/solids.ts'
import { chamferedSlab } from './common.ts'
import { cutGlyph, placed } from './glyphs.ts'

export const ESCORT = { tall: 20, thickness: 3, chamfer: 0.6 }

export function buildEscortMarker(): Solid {
  const { tall, thickness: t, chamfer } = ESCORT
  const [rim, hull] = placed('escort', tall)
  return cutGlyph(chamferedSlab(rim.outer, t, chamfer), [hull], -1, t + 1)
}
