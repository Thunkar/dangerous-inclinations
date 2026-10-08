/**
 * The turn, in the words the cheatsheet, the printed card and the in-game
 * rules dialog all read (`site/turn.ts` puts them in order with their
 * numbers). Each step has a title, a blurb (the step in full, for the
 * cheatsheet and the dialog) and a terse line (the card has one line for it).
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
        'Destroyed? This turn you come back: At your home sector, full hull and fuel, repaired and reloaded, coasting. Nobody can touch you until your next turn ends. Likewise, you cannot fire at, scan or seize from anyone.',
      terse: 'Destroyed? Home, full hull and fuel. Turn over.',
    },
    clear: {
      title: 'Clear',
      blurb: 'All the energy on your subsystems goes back to the supply.',
      terse: 'Energy goes back to the supply',
    },
    actions: {
      title: 'Actions',
      blurb:
        'Any order: power shields, a rack or a sensor, rotate, move, fire, scan, seize, survey, salvage, mark.',
      terse: 'Power · Rotate · Move · Fire · Scan · Take · Mark',
    },
    missiles: {
      title: 'Missiles',
      blurb:
        "Each of yours launched on an earlier turn rides its orbit, flies {steps} steps and attacks if it reaches its target's sector. A new one flew when you launched it.",
      terse: 'Older ones ride the orbit, fly {steps}, hit on its sector',
    },
    heatCheck: {
      title: 'Heat check',
      blurb:
        "Every point of energy on your loadout is 1 heat. At 0, repair one subsystem. Over {maxHeat} is hull damage and doesn't accumulate. Dissipate {dissipation} (+{radiator} a radiator), carry the rest.",
      terse:
        'Energy converts to heat. Over {maxHeat}, your ship takes damage. Dissipate {dissipation} (+{radiator} per radiator)',
    },
    docking: {
      title: 'Dock',
      blurb:
        'Arrived on a station? Repair everything, full hull, reload, and one action: load your crates or sell one item. Each station buys from you once.',
      terse: 'Repair, rearm, load or sell',
    },
    missions: {
      title: 'Missions',
      blurb: 'Flip what you completed, then pass.',
      terse: 'Reveal completed.',
    },
    /** Not part of anyone's turn: once a round, after the last seat has played. */
    stations: {
      title: 'Stations',
      blurb:
        "Once a round, after the last seat's turn: every station moves {drift} sectors, carrying whoever is moored, and every wreck drifts with its ring.",
      terse: 'Once a round, after the last seat: every station +{drift}, wrecks drift',
    },
  },

  /** The one rule of the opening round, and of a ship's first turn back from Home. */
  quiet: 'During the first round you can only move: no weapon fires, nobody scans and nobody seizes.',
} as const
