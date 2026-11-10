import { part } from 'fluidcad/core'
import { buildMissileToken } from '../../pieces/missile.ts'

export const piece = part('Missile token, a salvo of 1 (print 3 a player, in their colour)', () =>
  buildMissileToken()
)
