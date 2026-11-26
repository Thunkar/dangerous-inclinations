import { part } from 'fluidcad/core'
import { showStation } from '../../pieces/station.ts'

// The station as it stands, a plug in each slot, to judge the fit; viewer only.
export const view = part('station assembled', () => showStation())
