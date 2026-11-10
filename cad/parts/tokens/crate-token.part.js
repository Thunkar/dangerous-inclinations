import { part } from 'fluidcad/core'
import { buildCrateToken } from '../../pieces/markers/crate.ts'

export const piece = part('Crate token', () => buildCrateToken())
