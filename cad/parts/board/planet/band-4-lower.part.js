import { part } from 'fluidcad/core'
import { buildBody } from '../../../pieces/body.ts'

export const piece = part('Band 4, lower piece (print 3)', () => buildBody('band', 4, 'lower'))
