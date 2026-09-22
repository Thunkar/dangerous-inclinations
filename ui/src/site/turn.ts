/**
 * The turn, in seven steps.
 *
 * RULES.md §A Turn is the statement of them; this is that list in the forms
 * the cheatsheet, the printed card and the in-game rules dialog need, so the
 * three cannot disagree about what order a turn runs in or what a step is
 * called. Every number is the engine's.
 */
import {
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  PLANETS,
  STATION_RING,
  SUBSYSTEM_CONFIGS,
  ringVelocity,
} from '@dangerous-inclinations/engine'

const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0
const MISSILE_STEPS = SUBSYSTEM_CONFIGS.missiles.weaponStats?.fuelPerTurn ?? 0
/** A station rides its ring like a ship, and advances once a round. */
export const STATION_DRIFT = ringVelocity(PLANETS[0].id, STATION_RING)

export interface TurnStep {
  title: string
  /** The step in full, for the cheatsheet and the rules dialog. */
  blurb: string
  /** The step on the printed card, which has one line for it. */
  terse: string
}

export const TURN_STEPS: TurnStep[] = [
  {
    title: 'Respawn',
    blurb:
      'Destroyed? This turn you come back: Home, full hull and fuel, drifting. Nobody can touch you until your next turn ends, and on it you fire at nobody.',
    terse: 'destroyed? Home, full hull and fuel. Turn over',
  },
  {
    title: 'Clear',
    blurb: 'All the energy on your tiles goes back to the supply.',
    terse: 'all energy back to the supply',
  },
  {
    title: 'Actions',
    blurb:
      'Any order: power shields, a rack or a sensor, rotate, one move, fire, scan. Each tile does one thing.',
    terse: 'power · rotate · move · fire · scan',
  },
  {
    title: 'Missiles',
    blurb: `Each of yours rides its orbit, flies ${MISSILE_STEPS} steps and hits if it reaches its target's sector.`,
    terse: `ride the orbit, fly ${MISSILE_STEPS}, hit on the sector`,
  },
  {
    title: 'Docking',
    blurb: 'Arrived on a station? Load, deliver, repair everything, full hull, reload.',
    terse: 'arrived? cargo, repairs, hull, missiles',
  },
  {
    title: 'Heat check',
    blurb: `Every point of energy on your loadout is 1 heat. Over ${MAX_HEAT} is hull damage and the track stops at ${MAX_HEAT}. Dissipate ${DEFAULT_DISSIPATION_CAPACITY} (+${RADIATOR_DISSIPATION} a radiator), carry the rest. At 0, repair one tile.`,
    terse: `energy is heat. Over ${MAX_HEAT}: hull. Dissipate ${DEFAULT_DISSIPATION_CAPACITY}`,
  },
  {
    title: 'Missions',
    blurb: `Flip what you completed and pass. After the last seat, stations move ${STATION_DRIFT}.`,
    terse: `flip, pass. Last seat: stations +${STATION_DRIFT}`,
  },
]

/** The one rule of the opening round, and of a ship's first turn back from Home. */
export const QUIET_TURN = 'The first round reaches nobody: no weapon fires and nobody scans.'
