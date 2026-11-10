// The sale chip: each station has six (one per player) in its planet's
// colour; a player who sells there takes one and keeps it on the table by
// their base. A chamfered disc with the planet's Greek letter debossed on top
// (the board numbers' font, lib/glyphs.ts); nothing on the bed face.
import { sketch, plane, extrude, subtract } from 'fluidcad/core'
import { BOARD, MARKER } from '../../spec.ts'
import { outlines, flatten, box, drawPolygons } from '../../lib/glyphs.ts'
import type { Point, Solid } from '../../lib/solids.ts'
import { lathe } from './common.ts'

export const SALE = { diameter: 16, thickness: 2.5, chamfer: 0.5, mark: 10 }
export const PLANET_LETTERS = { alpha: 'α', beta: 'β', gamma: 'γ' } as const
export type Planet = keyof typeof PLANET_LETTERS

export function buildSaleChip(planet: Planet): Solid {
  const { diameter, thickness: t, chamfer: c, mark } = SALE
  const r = diameter / 2
  const chip = lathe([
    [0, 0],
    [r - c, 0],
    [r, c],
    [r, t - c],
    [r - c, t],
    [0, t],
  ])
  // The letter's box, its longer side `mark`, centred on the chip.
  const letter = PLANET_LETTERS[planet]
  const [lo, hi] = box(outlines(BOARD.number.font, letter, 1))
  const size = mark / Math.max(hi[0] - lo[0], hi[1] - lo[1])
  const polys = outlines(BOARD.number.font, letter, size).map(contour => flatten(contour))
  const [cx, cy] = [((lo[0] + hi[0]) / 2) * size, ((lo[1] + hi[1]) / 2) * size]
  sketch(plane('xy', { offset: t - MARKER.depth }), () =>
    drawPolygons(polys, ([x, y]): Point => [x - cx, y - cy])
  )
  return subtract(chip, extrude(MARKER.depth + 1).new())
}
