import { part } from 'fluidcad/core'
import { buildCube } from '../../pieces/cube.ts'

export const piece = part('Energy or heat cube (24 energy and 12 heat a player)', () => buildCube())
