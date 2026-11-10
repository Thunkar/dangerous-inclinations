import { part } from 'fluidcad/core'
import { buildCaddy } from '../../pieces/holder.ts'

export const piece = part("Holder B: player caddy (print 6, one in each player's colour)", () =>
  buildCaddy()
)
