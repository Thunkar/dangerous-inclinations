// The crate token: a neutral hexagon (the isometric crate of the Deliver
// glyph seen end on), Deliver's crate on the front and the loot skull on the
// back (item.ts). About six a table.
import { regular } from './common.ts'
import { buildItem } from './item.ts'

/** Across the flats; the crate glyph is the same hexagon, point up. */
export const CRATE = { flats: 18, thickness: 4, chamfer: 0.8, mark: 12 }

export function buildCrateToken() {
  return buildItem({
    outline: regular(6, CRATE.flats / 2 / Math.cos(Math.PI / 6), 90),
    thickness: CRATE.thickness,
    chamfer: CRATE.chamfer,
    front: 'crate',
    frontSize: CRATE.mark,
  })
}
