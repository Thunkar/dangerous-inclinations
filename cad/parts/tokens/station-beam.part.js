import { part } from 'fluidcad/core'
import { buildStationBeam } from '../../pieces/station.ts'

export const piece = part('Station beam (flat on its underside)', () => buildStationBeam())
