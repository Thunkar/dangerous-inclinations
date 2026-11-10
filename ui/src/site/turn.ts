/**
 * The turn, in seven steps, and the one step that ends a round.
 *
 * RULES.md §A Turn is the statement of them; this is that list in the forms
 * the cheatsheet, the printed card and the in-game rules dialog need, so the
 * three cannot disagree about what order a turn runs in or what a step is
 * called. Every number is the engine's; the words are in `text/turn.ts`.
 */
import {
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  STATION_DRIFT,
  fill,
  getMissileStats,
} from '@dangerous-inclinations/engine'
import { RADIATOR_DISSIPATION } from './numbers'
import { TURN } from '../text/turn'

export interface TurnStep {
  title: string
  /** The step in full, for the cheatsheet and the rules dialog. */
  blurb: string
  /** The step on the printed card, which has one line for it. */
  terse: string
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
    terse: fill(T.missiles.terse, { steps: getMissileStats().stepsPerMove }),
  },
  {
    title: T.heatCheck.title,
    blurb: fill(T.heatCheck.blurb, HEAT),
    terse: fill(T.heatCheck.terse, HEAT),
  },
  T.docking,
  T.missions,
  {
    title: T.stations.title,
    blurb: fill(T.stations.blurb, { drift: STATION_DRIFT }),
    terse: fill(T.stations.terse, { drift: STATION_DRIFT }),
    roundEnd: true,
  },
]

/** The one rule of the opening round, and of a ship's first turn back from Home. */
export const QUIET_TURN = TURN.quiet
