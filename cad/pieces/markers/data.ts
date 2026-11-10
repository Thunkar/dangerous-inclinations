// The data token: a neutral octagon (a square with its corners clipped, a
// cartridge more than a coin), Intercept's dish and signal on the front and
// the loot skull on the back (item.ts), the crate's back exactly. About
// twelve a table. 17 across with 3 mm clips, so the skull at the crate's
// size (its teeth 0.61 apart, over FDM.minFeature) keeps its bone tips 0.4
// inside the clipped corners' chamfer.
import { clippedRect } from './common.ts'
import { buildItem } from './item.ts'

export const DATA = { size: 17, clip: 3, thickness: 3.6, chamfer: 0.7, mark: 12.5 }

export function buildDataToken() {
  return buildItem({
    outline: clippedRect(DATA.size, DATA.size, DATA.clip),
    thickness: DATA.thickness,
    chamfer: DATA.chamfer,
    front: 'intercept',
    frontSize: DATA.mark,
  })
}
