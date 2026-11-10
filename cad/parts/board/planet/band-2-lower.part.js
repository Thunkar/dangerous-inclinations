import { part } from 'fluidcad/core'
import { buildBody } from '../../../pieces/body.ts'

export const piece = part('Band 2, lower piece (print 3)', () => buildBody('band', 2, 'lower'))
