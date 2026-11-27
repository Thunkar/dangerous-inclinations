/**
 * The turn, in seven steps, and the one step that ends a round.
 *
 * RULES.md §A Turn is the statement of them; this is that list in the form
 * the cheatsheet and the in-game rules dialog need, so the two cannot
 * disagree about what order a turn runs in or what a step is
 * called. Every number is the engine's; the words are in `text/turn.ts`.
 */
import {
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  STATION_DRIFT,
  fill,
  getMissileStats,
} from '@dangerous-inclinations/engine'
import { RADIATOR_DISSIPATION, STATION_SECTORS } from './numbers'
import { TURN } from '../text/turn'

export interface TurnStep {
  title: string
  /** The step in full, for the cheatsheet and the rules dialog. */
  blurb: string
  /** Not part of anyone's turn: it happens once a round, after the last seat has played. */
  roundEnd?: true
}

const T = TURN.steps
const HEAT = {
  maxHeat: MAX_HEAT,
  dissipation: DEFAULT_DISSIPATION_CAPACITY,
  radiator: RADIATOR_DISSIPATION,
}

export const TURN_STEPS: TurnStep[] = [
  T.respawn,
  T.clear,
  T.actions,
  {
    title: T.missiles.title,
    blurb: fill(T.missiles.blurb, { steps: getMissileStats().stepsPerMove }),
  },
  {
    title: T.heatCheck.title,
    blurb: fill(T.heatCheck.blurb, HEAT),
  },
  {
    title: T.docking.title,
    blurb: fill(T.docking.blurb, { stationSectors: STATION_SECTORS }),
  },
  T.missions,
  {
    title: T.stations.title,
    blurb: fill(T.stations.blurb, { drift: STATION_DRIFT }),
    roundEnd: true,
  },
]

/** The one rule of the opening round, and of a ship's first turn back from Home. */
export const QUIET_TURN = TURN.quiet
