import { part } from 'fluidcad/core'
import { buildStationStem } from '../../pieces/station.ts'

export const piece = part('Station stem (upright on its foot)', () => buildStationStem())
