/**
 * The turn, in the words the rules page and the in-game rules dialog both
 * read (`site/turn.ts` puts them in order with their numbers). Each step has
 * a title and a blurb, the step in full.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name.
 */

export const TURN = {
  steps: {
    respawn: {
      title: 'Respawn',
      blurb:
        'Destroyed? This turn you come back at Home: full hull and fuel, repaired and reloaded, orbiting with your ring. Nobody can touch you until your next turn ends, and on that turn you can’t fire at, scan or seize from anyone.',
    },
    clear: {
      title: 'Clear',
      blurb: 'Take all the energy off your subsystems.',
    },
    actions: {
      title: 'Actions',
      blurb:
        'In any order: power shields, a rack or a sensor, rotate, move, fire, scan, seize, survey, salvage or mark.',
    },
    missiles: {
      title: 'Missiles',
      blurb:
        "Each missile you launched on an earlier turn flies {steps} steps and rides its orbit, in the order you choose. It attacks if its flight ends on its target's sector. A new missile already flew when you launched it.",
    },
    heatCheck: {
      title: 'Heat check',
      blurb:
        'Every point of energy on your loadout is 1 heat. At 0 heat, repair one subsystem. Each point above {maxHeat} is 1 hull damage, and the track drops to {maxHeat}. Then dissipate {dissipation} ({radiator} more per radiator) and carry the rest.',
    },
    docking: {
      title: 'Dock',
      blurb:
        'Arrived on any of a station’s {stationSectors} sectors? Repair everything, refill your hull and reload. Then do one thing: load your crates or sell one item. Each station buys from you once.',
    },
    missions: {
      title: 'Missions',
      blurb: 'Flip what you completed, then pass.',
    },
    /** Not part of anyone's turn: once a round, after the last seat has played. */
    stations: {
      title: 'Stations',
      blurb:
        "Once a round, after the last player's turn, every station moves {drift} sectors and carries its moored ships. Every wreck orbits with its ring.",
    },
  },

  /** The one rule of the opening round, and of a ship's first turn back from Home. */
  quiet: 'In the first round you can only move: no weapon fires, nobody scans and nobody seizes.',
} as const
