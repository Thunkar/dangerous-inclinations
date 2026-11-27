/**
 * Every word on the printed card (`site/card/`), face by face and top to
 * bottom: the words in its lists and the words set inside its drawings.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name. An array is lines the
 * drawing sets one under the other, broken where the drawing has room.
 */

export const PRINTED_CARD = {
  /** The black strip across the top of both faces. */
  head: 'Dangerous Inclinations',

  // -------------------------------------------------------------------------
  // Front: your turn
  // -------------------------------------------------------------------------
  front: {
    face: 'Your turn',
    /** Beside the cards that make the points: a primary and a secondary, or three secondaries. */
    goal: '{points} points end the round',
    or: 'or',
    turn: 'Turn order',
    steps: {
      destroyed: { title: 'Destroyed?', text: 'Respawn at Home, and your turn ends.' },
      clear: { title: 'Clear', text: 'Take all the energy off your loadout.' },
      actions: {
        title: 'Actions',
        text: 'Act in any order. Each action happens where your ship is at that moment.',
      },
      missiles: { title: 'Missiles', text: 'Older missiles fly {steps} steps and orbit.' },
      heat: { title: 'Heat check', text: 'See the back.' },
      dock: { title: 'Dock', text: 'Just arrived? Repair, reload, then load or sell.' },
      missions: { title: 'Missions', text: 'Flip completed missions, then pass.' },
      roundEnd: { title: 'Round end', text: 'Stations move {drift} sectors and wrecks orbit.' },
    },
    /** The four moves, drawn on the black hole's rings. */
    moves: {
      prograde: 'prograde',
      out: 'out',
      in: 'in',
      coast: { title: 'Coast', line: 'You orbit at your ring’s speed.' },
      /** The scoop's fuel, after the arrow. */
      speed: '+speed',
      burn: { title: 'Burn', line: 'You orbit, then change rings.' },
      jump: { title: 'Jump' },
      fold: { title: 'Fold', line: 'Never onto a station.' },
    },
    quiet:
      'Nobody fires, scans or seizes in round one, or on your first turn back after being destroyed.',
  },

  // -------------------------------------------------------------------------
  // Back: the fight
  // -------------------------------------------------------------------------
  back: {
    face: 'The fight',
    firing: 'Firing',
    /** Over the faces a powered sensor makes critical. */
    with: 'with',
    miss: 'miss',
    hit: {
      title: 'hit',
      shield: ['A shield stops {points} point', 'per energy, or {plasma} of plasma.'],
      wreck: ['At 0 hull your ship', 'becomes a wreck.'],
      hull: '−{hull} hull',
      heat: '+{heat} heat',
      laser: 'lasers ignore shields',
    },
    critical: {
      title: 'critical',
      text: ['Name any slot after', 'the roll: it breaks,', 'even through shields.'],
      heat: '+{heat} heat',
    },
    heat: {
      title: 'Heat check',
      aside: 'step {step}',
      track: ['heat on', 'your track'],
      loadout: ['energy on', 'your loadout'],
      over: 'over {maxHeat}',
      dissipate: '−{dissipation} (−{radiator} more per radiator)',
      carries: 'carries',
      note: 'At 0 heat, repair one broken slot. Shields and racks add heat on other players’ turns too.',
    },
    sees: {
      title: 'What the table sees',
      energy: 'Its energy is public.',
      faceUp: 'Face-up once it acts or breaks.',
      scan: 'A scan sees one.',
      docked: 'A docked ship can’t fire or be fired at.',
    },
  },
} as const
