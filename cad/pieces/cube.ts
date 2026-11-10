// An energy or heat cube, printed: CUBE.size on a side, every edge
// chamfered at 45 degrees (CUBE.chamfer). Built as the common of three
// octagonal prisms, one along each axis, so every face is flat.
import { common } from 'fluidcad/core'
import { CUBE } from '../spec.ts'
import { move, prism, turn, type Point, type Solid } from '../lib/solids.ts'

export function buildCube(): Solid {
  const [s, c] = [CUBE.size, CUBE.chamfer]
  const h = s / 2
  const octagon: Point[] = [
    [-h + c, -h],
    [h - c, -h],
    [h, -h + c],
    [h, h - c],
    [h - c, h],
    [-h + c, h],
    [-h, h - c],
    [-h, -h + c],
  ]
  // Each prism centred on the origin along its axis.
  const along = () => move(prism(octagon, s), 0, 0, -h)
  const cube = common(common(along(), turn(along(), 'x', 90)), turn(along(), 'y', 90))
  return move(cube, 0, 0, h)
}
