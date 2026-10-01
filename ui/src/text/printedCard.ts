/**
 * Every word on the printed card (`site/card/`), face by face and top to
 * bottom. The turn's seven steps are in `turn.ts` (their terse lines).
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name. `<b>` is bold, `<red>` is
 * set in red. `\u00a0` is a space the line never breaks at.
 */

export const PRINTED_CARD = {
  /** The black strip across the top of both faces. */
  head: 'Dangerous Inclinations',

  // -------------------------------------------------------------------------
  // Front: your turn
  // -------------------------------------------------------------------------
  front: {
    face: 'Turn/movement',
    goal: {
      title: '{points} points end the round',
      text: 'Primary {primary} + either secondary {secondary} wins. Ties: hull, then fuel.',
    },
    turn: {
      title: 'The turn',
      aside: 'in order',
      quiet: 'Round 1, and your first turn back: nobody fires or scans',
    },
    movement: {
      title: 'Movement',
      aside: 'along the orbit',
      coast: { title: 'COAST', note: ['Drift only'] },
      drift: "by the ring's speed",
      burn: { title: 'BURN', note: ['Drift, then', '1–{rings} rings'] },
      prograde: 'prograde: out',
      retrograde: 'retrograde: in',
      jump: { title: 'JUMP', note: ['Transfer sectors'] },
      from: 'hole ring {ring}',
      to: 'planet ring {ring}',
      arc: 'same sector of the arc',
    },
    costs: {
      title: 'Costs',
      columns: { move: 'move', fuel: 'fuel', energy: 'energy', and: 'and' },
      coast: {
        move: 'Coast',
        and: 'Scoop ({energy} energy): +fuel equal to ring speed',
      },
      burn: { move: 'Burn', and: '1 of each a ring; prograde out' },
      jump: {
        move: 'Jump',
        /** The fuel cell: the jump's fuel, then the compressor's in red. */
        fuel: '{fuel}<red>/{compressed}</red>',
        and: 'No drift; <red>{compressed}</red> fuel with a compressor',
      },
      rotate: { move: 'Rotate', and: 'Flip facing' },
      phase: 'phase',
      phaseNote: 'fuel to land, from speed {speed}',
    },
  },

  // -------------------------------------------------------------------------
  // Back: the fight
  // -------------------------------------------------------------------------
  back: {
    face: 'Subsystems',
    roll: {
      title: 'The roll',
      aside: 'one d10 a shot',
      /** The notes under the ten faces: the word on the left, the line on the right. */
      notes: {
        name: ['name', 'A slot to be the target in case of a critical hit'],
        roll: [
          'Roll a d10',
          '{miss} miss · {hitFrom}–{hitTo} hit · {crit} crit · <red>{sensorFrom}–{sensorTo} crit with a powered sensor</red>',
        ],
        hit: ['hit', 'Shields absorb first, except lasers'],
        critical: [
          'critical',
          'Breaks the named subsystem through the shields, face-up. Its energy goes onto its owner’s heat',
        ],
        moored: [
          'moored',
          'Neither fires nor is fired at, missiles included; scans still reach it',
        ],
      },
    },
    weapons: {
      title: 'Weapons',
      aside: 'each fires once a turn',
      columns: { subsystem: 'subsystem', energy: 'energy', damage: 'dmg', reaches: 'reaches' },
      reach: {
        railgun: 'same ring, 1–{sectors} ahead; recoils against facing',
        laser: '±{rings} rings ±{sectors}, one side; <red>ignores shields</red>',
        ballistic_rack: '±{rings} ring ±{sectors} either side, or 1 along your ring',
        missiles:
          'anyone in your well; a salvo is one action. {aboard} aboard, fly {steps} a turn for {turns}',
      },
    },
    powered: {
      title: 'Powered',
      aside: 'works until your next turn',
      shields: '{energy} energy stop 1 damage and come off; not lasers',
      ballistic_rack: 'shoots down {missiles} missiles a turn, each on {on}+',
      sensor_array:
        'your shots after it crit on {crit}+; scan: your ring, within {sectors}, see a subsystem',
    },
    passive: {
      title: 'Passive',
      aside: 'nothing to power',
      radiator: '+{dissipation} dissipation; shows above {heat} heat',
      fuel_compressor: 'a jump costs {compressed} fuel, not {fuel}',
    },
    heat: {
      title: 'Heat check',
      aside: 'energy turns to heat',
      /** Two lines. */
      sum: ['carried', '+ energy'],
      cold: '<b>0</b>\u00a0repair 1 subsystem',
      normal: '<b>1–{maxHeat}</b>',
      over: '<b>over {maxHeat}</b>\u00a0excess to hull',
      /** Two lines. */
      dissipate: ['dissipate {dissipation}', '+{radiator} a radiator'],
      arrow: '→',
      carry: 'carry',
    },
    faceDown: {
      title: 'Face-down',
      aside: 'energy is public',
      text: 'Using a subsystem turns it face-up; powering it does not.',
    },
  },
} as const
