import { part } from 'fluidcad/core'
import { buildHalf } from '../../pieces/dice/d10.ts'

export const piece = part('D10 odd pole (1 3 5 7 9), cut face down', () => buildHalf(true))
