import { part } from 'fluidcad/core'
import { buildStationPlugs } from '../../pieces/station.ts'

export const piece = part('Station plugs (one a berth, glued in behind its magnet)', () =>
  buildStationPlugs()
)
