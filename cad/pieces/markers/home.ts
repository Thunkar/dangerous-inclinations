// The Home marker: one per player, in their colour, beside their ship token
// in the sector they deployed on (black hole ring 2, 3 or 4) for the whole
// game. A flat tile, a house in plan, Destroy's hull debossed in it pointing
// at the roof. Ring 2's sector floor (17.6 across the ring) takes the tile
// (8 deep) and the ship token (7.5 wide) side by side with 0.3 and 0.9 to
// spare at the walls; rings 3 and 4 are wider.
import { MARKER } from '../../spec.ts'
import type { Point, Solid } from '../../lib/solids.ts'
import { chamferedSlab } from './common.ts'
import { cutGlyph, placed } from './glyphs.ts'

export const HOME = { wide: 9, eaves: 4.3, ridge: 8, thickness: 3, chamfer: 0.6, mark: 4.8 }

export function buildHomeMarker(): Solid {
  const { wide, eaves, ridge, thickness: t, chamfer, mark } = HOME
  const [x, y0] = [wide / 2, -3.5]
  const house: Point[] = [
    [-x, y0],
    [x, y0],
    [x, y0 + eaves],
    [0, y0 + ridge],
    [-x, y0 + eaves],
  ]
  return cutGlyph(
    chamferedSlab(house, t, chamfer),
    placed('hull', mark, [0, -0.1]),
    t - MARKER.depth,
    t + 1
  )
}
