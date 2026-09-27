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
        'Destroyed? This turn you come back: Home, full hull and fuel, drifting. Nobody can touch you until your next turn ends, and on it you fire at nobody and scan nobody.',
      terse: 'Destroyed? Home, full hull and fuel. Turn over',
    },
    clear: {
      title: 'Clear',
      blurb: 'All the energy on your subsystems goes back to the supply.',
      terse: 'Energy goes back to the supply',
    },
    actions: {
      title: 'Actions',
      blurb: 'Any order: power shields, a rack or a sensor, rotate, move, fire, scan.',
      terse: 'Power · Rotate · Move · Fire · Scan',
    },
    missiles: {
      title: 'Missiles',
      blurb:
        "Each of yours rides its orbit (not on the turn you launched it), flies {steps} steps and hits if it reaches its target's sector.",
      terse: 'Ride the orbit (not on launch), fly {steps}, hit on its sector',
    },
    docking: {
      title: 'Docking',
      blurb:
        'Arrived on a station? Repair everything, full hull, reload, and one job: your crates, your data or your fuel.',
      terse: 'Arrived? Repair, rearm, one job',
    },
    heatCheck: {
      title: 'Heat check',
      blurb:
        'Every point of energy on your loadout is 1 heat. Over {maxHeat} is hull damage and the track stops at {maxHeat}. Dissipate {dissipation} (+{radiator} a radiator), carry the rest. At 0, repair one subsystem.',
      terse:
        'Energy converts to heat. Over {maxHeat}, your ship takes damage. Dissipate {dissipation} (+{radiator} per radiator)',
    },
    missions: {
      title: 'Missions',
      blurb:
        "Take a wreck's black box, seize loot, put down an Escort marker if you choose. Flip what you completed, then pass.",
      terse: 'Black box, loot, Escort marker; flip, pass',
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
  quiet: 'The first round reaches nobody: no weapon fires and nobody scans.',
} as const
