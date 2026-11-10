import { part } from 'fluidcad/core'
import { buildBody } from '../../../pieces/body.ts'

export const piece = part(
  "Assembly peg (print 3: lines a planet's pieces up while they are glued, then comes out)",
  () => buildBody('peg')
)
