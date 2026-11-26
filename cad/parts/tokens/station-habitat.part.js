import { part } from 'fluidcad/core'
import { buildStationHabitat } from '../../pieces/station.ts'

export const piece = part('Station habitat (flat on its ring)', () => buildStationHabitat())
