import { part } from 'fluidcad/core'
import { buildModule, screwFor } from '../../pieces/module.ts'

export const module = part(`jump_drive (M2 screw up to ${screwFor('jump_drive')} mm)`, () =>
  buildModule('jump_drive')
)
