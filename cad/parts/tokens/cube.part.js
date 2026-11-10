import { part } from 'fluidcad/core'
import { buildCube, CUBES } from '../../pieces/cube.ts'

export const piece = part(
  `Energy or heat cube (${CUBES.energy} energy and ${CUBES.heat} heat a player)`,
  () => buildCube()
)
