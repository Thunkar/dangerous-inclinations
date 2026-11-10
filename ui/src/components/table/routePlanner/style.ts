/**
 * What every part of the route planner shares: its words and the board's
 * colours it repeats (`RoutePlanner.tsx` says how the plate reads).
 */
import { TABLE } from '../../../design/tokens'
import { ACTIONS } from '../../../text/actions'

export const T = ACTIONS.routePlanner

/** The board draws routes and their destination in the energy colour; so do we. */
export const ROUTE = TABLE.energy
export const ROUTE_FAINT = TABLE.inkFaint
/** Behind red type: the pick in progress, the step taken. */
export const RED_TINT = TABLE.accentWash
export const HOVER_TINT = TABLE.hover
