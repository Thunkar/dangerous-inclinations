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
      text: 'Primary + either secondary completed. Ties: hull, then fuel.',
    },
    turn: {
      title: 'The turn',
      aside: 'in order',
      quiet: 'Round 1, and your first turn back: nobody fires, scans or seizes',
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
      burn: { move: 'Burn', and: '1 of each a ring. Prograde out' },
      jump: {
        move: 'Jump',
        /** The fuel cell: the jump's fuel, then the compressor's in red. */
        fuel: '{fuel}<red>/{compressed}</red>',
        and: 'No drift. <red>{compressed}</red> fuel with a compressor',
      },
      rotate: { move: 'Rotate', and: 'Flip facing' },
      phase: 'phase',
      phaseNote: 'additional fuel',
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
        hit: ['hit', 'Shields absorb first and generate heat, the rest is hull damage'],
        critical: [
          'critical',
          'Breaks the named slot face-up, through shields. Its energy converts to heat',
        ],
        moored: ['moored', 'Neither fires nor is fired at, missiles too. Scans reach it'],
      },
    },
    weapons: {
      title: 'Weapons',
      aside: 'once a turn',
      columns: { subsystem: 'subsystem', energy: 'energy', damage: 'dmg', reaches: 'reaches' },
      /** The cell of a figure that is nothing: a gun that deals no damage, a move that costs no fuel. */
      noDamage: '–',
      reach: {
        railgun: 'same ring, 1–{sectors} ahead. Recoils against facing',
        laser: '±{rings} rings ±{sectors}, one side. <red>Ignores shields</red>',
        plasma_cannon:
          '±{rings} ring ±{sectors}, one side. <red>Every shield energy stops {points}</red>',
        ballistic_rack: '±{rings} ring ±{sectors} either side, or 1 along your ring',
        disruptor:
          '±{rings} ring ±{sectors} either side, or 1 along your ring. Breaks the named slot. <red>A powered shield stops it</red>',
        missiles:
          'inside your well, a salvo is one action. {aboard}\u00a0aboard, fly {steps} a turn from launch, {turns} turns',
      },
    },
    powered: {
      title: 'Powered',
      aside: 'works until your next turn',
      columns: { subsystem: 'subsystem', energy: 'energy', effect: 'effect' },
      shields: 'each energy stops {points} damage and comes off',
      ballistic_rack: 'shoots down {missiles} missiles a turn on {on}+, for {heat} heat',
      sensor_array: "shots after it's enabled crit on {crit}+. Scan: your ring, within {sectors}",
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
      text: 'Using a subsystem turns it face-up, powering it does not. A radiator shows above {heat} heat.',
    },
  },
} as const
