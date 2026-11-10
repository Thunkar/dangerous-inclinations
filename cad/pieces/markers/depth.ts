// The marker depth test piece: the crate token's two marks at four depths,
// 0.4, 0.6, 0.8 and 1.0 mm left to right (one to four notches): Deliver's
// crate debossed in the top and the loot skull, mirrored, in the bed face
// over its bridges, each at the crate token's size and thickness. The depth
// whose bed-face skull prints clean and whose marks both read by shadow goes
// into spec.ts as MARKER.depth.
import { subtract } from 'fluidcad/core'
import { block, type Solid } from '../../lib/solids.ts'
import { CRATE } from './crate.ts'
import { cutGlyph, placed } from './glyphs.ts'
import { LOOT } from './item.ts'

export const DEPTHS = [0.4, 0.6, 0.8, 1.0]
const CELL = 20
/** Room along one edge for the notches that number the cells. */
const LABEL = 2.4

export function buildMarkerDepth(): Solid {
  const t = CRATE.thickness
  const [w, h] = [DEPTHS.length * CELL + 2, CELL + LABEL]
  let plate = block([0, 0, 0], [w, h, t])
  DEPTHS.forEach((d, i) => {
    const centre: [number, number] = [1 + CELL * (i + 0.5), LABEL + CELL / 2]
    plate = cutGlyph(plate, placed('crate', CRATE.mark, centre), t - d, t + 1)
    plate = cutGlyph(plate, placed(LOOT.glyph, LOOT.size, centre, { mirror: true }), -1, d)
    for (let k = 0; k <= i; k++) {
      const x = centre[0] - 2.25 + k * 1.5
      plate = subtract(plate, block([x, 0.6, t - 0.4], [x + 0.8, 1.6, t + 1]))
    }
  })
  return plate
}
