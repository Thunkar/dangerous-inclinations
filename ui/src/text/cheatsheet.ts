/**
 * Every word on the cheatsheet (`/card`), top to bottom: the page head, the
 * contents, the eight sections in order, the line to the orbital windows and
 * the block above the printed card. The turn's steps are in `turn.ts`, the
 * mission cards' words in the engine (`engine/src/text/missionCards.ts`), the
 * card's faces in `printedCard.ts` and the orbital windows in `windows.ts`.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine: the words around
 * a slot are free to change, and a slot may move or be dropped but keeps its
 * name. A word set differently inside a sentence is marked with a tag, `<b>`
 * for bold and the others named where they are used (`<red>`).
 */

export const CHEATSHEET = {
  // -------------------------------------------------------------------------
  // The head of the page
  // -------------------------------------------------------------------------
  page: {
    kicker: 'Cheatsheet',
    /** `<red>` is set in red. */
    title: 'How to <red>play</red>',
  },

  /** The tiles under the head, one per section, and the last one for the card. */
  contents: {
    /** Read aloud for the row of tiles. */
    label: 'Sections',
    goal: 'The goal',
    setup: 'Setting up',
    turn: 'The turn',
    move: 'Moving',
    heat: 'Heat',
    fight: 'Fighting',
    secrets: 'Secrets',
    death: 'Destruction',
    card: 'The card',
  },

  // -------------------------------------------------------------------------
  // 01 · The goal
  // -------------------------------------------------------------------------
  goal: {
    kicker: 'The goal',
    title: '{points} points end the round',
    lede: 'Score your secret mission cards. When anyone reaches {points}, finish the round. The highest score wins, then the most hull, then the most fuel, then the earlier seat.',
    /** How the sample cards name their rivals. */
    rivals: {
      'left-1': 'the 1st player to your left',
      'left-2': 'the 2nd player to your left',
    } as Record<string, string>,
    primaries: {
      title: 'Primaries · {points} points',
      detail: 'Dealt {dealt}, keep {kept}',
    },
    secondaries: {
      title: 'Secondaries · {points} point',
      detail: 'Dealt {dealt}, keep {kept}',
    },
  },

  // -------------------------------------------------------------------------
  // 02 · Setting up
  // -------------------------------------------------------------------------
  setup: {
    kicker: 'Before the first turn',
    title: 'Build the ship',
    lede: 'Make it yours, keep an eye on the missions',
    forward: 'Forward · {slots}',
    /** Printed on the back of a face-down forward tile. */
    forwardBack: 'Fwd',
    side: 'Side · {slots}',
    /** Printed on the back of a face-down side tile. */
    sideBack: 'S{n}',
    fixed: 'Included on every ship',
  },

  // -------------------------------------------------------------------------
  // 03 · The turn (the steps themselves are in turn.ts)
  // -------------------------------------------------------------------------
  turn: {
    kicker: 'In game',
    title: 'Your turn',
    lede: 'Freely choose the order of your actions, the rest is fixed.',
    /** Over the first step, the third, and the round's step. */
    respawnNote: 'If destroyed',
    actionsNote: 'Any order',
    roundEndNote: 'Once a round',
    quiet: {
      numeral: 'R1',
      title: 'Round one is quiet',
      text: '{quietTurn} So is your first turn back from Home.',
    },
  },

  // -------------------------------------------------------------------------
  // 04 · Moving
  // -------------------------------------------------------------------------
  move: {
    kicker: 'Getting somewhere',
    title: 'Coast, burn or jump',
    lede: 'Your orbit dictates how fast you move',
    /** The two stamped figures under each move. */
    fuel: 'fuel',
    energy: 'energy',
    coast: {
      title: 'Coast',
      text: 'Drift only. Run the <b>scoop</b> to gain fuel equal to your ring’s speed.',
      diagram: {
        label: "A coast: the ship drifts forward along its ring by the ring's speed",
        ring: 'your ring',
        drift: "drift = the ring's speed",
      },
    },
    burn: {
      title: 'Burn',
      text: 'Drift, then cross {rings} rings, 1 fuel and 1 energy each. Prograde burns out, retrograde in.',
      diagram: {
        label: 'A burn: drift first, then change ring; prograde burns outward, retrograde inward',
        outer: 'outer ring',
        inner: 'inner ring',
        drift: 'drift first',
        prograde: 'prograde: out',
        retrograde: 'retrograde: in',
      },
    },
    jump: {
      title: 'Jump',
      text: 'From a lane’s departure arc to the same sector of its arrival arc, facing prograde, with no drift. Lanes run <b>one way</b>. {compressedFuel} fuel with a compressor.',
      diagram: {
        label:
          "A jump: from a lane's departure arc on the black hole's outer ring to the matching sector of the planet's arrival arc, with no drift",
        depart: 'depart',
        arrive: 'arrive',
        from: 'black hole ring {ring}',
        to: 'planet ring {ring}',
        note: 'same sector of the arc · no drift',
      },
    },
    phasing: {
      title: 'Phasing: land short or long (example)',
      label:
        'A soft burn out from ring {from} to ring {to}: the ship drifts {drift} sectors, then lands on ring {to} straight out for free, or up to {most} sectors either side for 1 fuel each',
      ring: 'RING {ring}',
      speed: 'SPEED {speed}',
      free: 'FREE',
      paid: 'FUEL',
      drift: 'DRIFT {sectors}',
      burn: 'BURN OUT',
      caption:
        'A soft burn out from ring {ring}. Each sector short or long is 1 fuel, up to {most} long and never back onto your start.',
      jump: 'A jump can land on any sector of the arrival arc, 1 fuel for each away from the matching one.',
    },
    planner: 'Plot a route on the board →',
  },

  // -------------------------------------------------------------------------
  // 05 · Heat
  // -------------------------------------------------------------------------
  heat: {
    kicker: 'Energy and heat',
    title: 'Every action costs energy',
    lede: 'At your heat check, every point of energy on your loadout is 1 heat.',
    points: {
      stays:
        'Energy <b>stays on the subsystem until your next turn</b>, so shields, a rack or a sensor you power work through everyone else’s turn.',
      absorbed:
        'Damage your shields absorb is heat too at a 1:1 ratio. A ballistic rack that intercepts missiles is {interceptHeat}: it goes on your track and carried over to your next turn.',
      over: 'Over {maxHeat} heat at your check is hull damage. Dissipate {dissipation} (+{radiator} a radiator) and carry the rest.',
      cold: 'If you have 0 heat at your check, repair one broken subsystem.',
    },
    energyTitle: 'Energy an action puts on its subsystem',
    /** The twelve cells, in order. */
    energy: {
      rotate: 'Rotate',
      burn: 'Burn',
      jump: 'Jump',
      scoop: 'Scoop',
      railgun: 'Railgun',
      laser: 'Laser',
      plasma: 'Plasma',
      disruptor: 'Disruptor',
      salvo: 'Salvo',
      rack: 'Rack',
      sensor: 'Sensor',
      shields: 'Shields',
    },
    /** The worked check, one line of the ledger at a time. */
    ledger: {
      carried: 'carried in',
      spent: 'railgun {railgun} · hard burn {hardBurn} · shields {shields}',
      atCheck: 'at the check',
      hull: 'hull: over {maxHeat}',
      stops: 'redline',
      dissipate: 'dissipate',
      carries: 'into your next turn',
    },
  },

  // -------------------------------------------------------------------------
  // 06 · Fighting
  // -------------------------------------------------------------------------
  fight: {
    kicker: 'Combat',
    title: 'Roll one d10',
    lede: 'Each weapon fires once a turn. Name a slot on the target, then roll.',
    /** Under the ten faces, left to right. */
    roll: {
      miss: '{top} misses',
      hit: '{from}–{to} hit',
      sensor: '{from}–{to}: crit with a powered sensor',
      critical: '{face} critical',
    },
    /** What each gun reaches, in the order the cards are laid out. */
    reach: {
      railgun:
        'Same ring, 1–{sectors} sectors ahead. The recoil pushes you a ring against your facing, unless you spend 1 fuel to hold.',
      laser: '±{rings} rings, ±{sectors} sector, off one side. <b>Ignores shields.</b>',
      ballistic_rack:
        '±{rings} ring, ±{sectors} sector, either side. With energy on it, shoots down {intercepts} missiles a turn on {on}+, for {heat} heat however many.',
      missiles:
        'Any ship in your well. Launch any number at one ship: {aboard} aboard, {steps} steps a turn for {turns} turns.',
      plasma_cannon:
        '±{rings} ring, ±{sectors} sector, off one side. <b>Each shield energy stops {points} damage</b>',
      disruptor:
        'An EMP burst: ±{rings} ring, ±{sectors} sector, either side. <b>No damage</b>: a hit ({from}–{to}) breaks the slot you named, unless any shield has energy on it.',
    },
    /** A gun that fits either slot. */
    eitherSlot: 'forward or side',
    slotLine: '{slot} · {energy} energy',
    damage: 'damage',
    missilesTitle: 'Missiles in flight',
    missile: {
      label:
        'Launched, the missile flies at once from where it was dropped, with no ride, and the ship moves on. On its second turn it rides its ring then flies, and reaches the target on turn {hitTurn}',
      ring: 'RING {ring}',
      speed: 'SPEED {speed}',
      targetDrifts: 'target drifts',
      yourMove: 'your move',
      launch: 'launch',
      hit: 'hit, turn {turn}',
      /** The legend over the drawing. */
      key: {
        turn1: 'turn 1',
        turn2: 'turn 2',
        rides: 'rides its orbit',
        flies: 'flies {steps}, rings first',
      },
      caption:
        'A missile flies {steps} steps the moment you launch it, from the sector you dropped it on, and your move afterwards leaves it there. At the end of every turn after that it rides its orbit, then flies {steps}. On the target’s sector it attacks like a weapon ({damage} damage), unless a rack with energy on it shoots it down on {on}+. A hit on the launch flight lands before the rest of your turn. It lasts {turns} turns.',
    },
    /** The two columns of points at the foot of the section. */
    hits: [
      '<b>Shields absorb first</b>: each energy stops {shieldPoints} damage ({plasmaPoints} of plasma). <b>Every point absorbed is heat</b> on the target’s track. Lasers ignore them.',
      'At 0 the ship is destroyed (see 08).',
      'In your own sector every weapon reaches. Nothing fires across wells.',
    ],
    rules: [
      '<b>A critical breaks the slot you named</b>, shields or not, and its energy goes onto its owner’s heat.',
      '<b>A berth is safe</b>: a moored ship neither fires nor is fired at, missiles included. Scans still reach it.',
    ],
  },

  // -------------------------------------------------------------------------
  // 07 · Secrets
  // -------------------------------------------------------------------------
  secrets: {
    kicker: 'Hidden information',
    title: 'Secret until used',
    lede: 'Subsystems turn face-up the first time they do their job.',
    revealsTitle: 'Turned face-up when',
    /** One row each, next to the tiles it names. */
    reveals: {
      weapon: 'A weapon, when it fires.',
      rack: 'A rack, when it fires or rolls at a missile.',
      shields: 'Shields, when they absorb damage or stop a disruptor.',
      sensor: 'A sensor, when it scans.',
      radiator: 'A radiator, when your heat is over {heat} at a check.',
      compressor: 'A compressor, when a jump costs {fuel} fuel.',
      broken: 'Any subsystem, when a critical breaks it.',
    },
    revealsFoot: 'Powering a subsystem does not turn it face-up.',
    energyTitle: 'Read the energy',
    energy: [
      'Energy on every subsystem is <b>public</b>. On a face-down subsystem it means powered, not used.',
      'A gun is dark until it fires.',
    ],
    scanTitle: 'Scan to be sure',
    scan: [
      'With a sensor, scan a ship on your ring within {sectors} sectors: look at one of its face-down subsystems. Intercept holders take its data.',
    ],
  },

  // -------------------------------------------------------------------------
  // 08 · Destruction
  // -------------------------------------------------------------------------
  death: {
    kicker: 'Destruction',
    title: 'Nobody is out',
    lede: 'A destroyed ship comes back, minus its cargo and a turn.',
    /** The three steps, left to right. */
    steps: [
      {
        when: 'At 0 hull',
        title: 'Off the board',
        text: 'Leave a wreck. Crates go back to their station, loot and data are lost, Escort markers go back to their owners, and your missiles in flight are removed',
      },
      {
        when: 'Your next turn',
        title: 'Back at Home',
        text: 'Full hull and fuel, repaired and reloaded, heat 0, coasting. End the turn.',
      },
      {
        when: 'The turn after',
        title: 'A quiet turn',
        text: 'Move as usual, but you cannot fire, scan or seize. Nobody can touch you until it ends.',
      },
    ],
  },

  /** The line after the last section: the orbital windows are in the route planner. */
  windowsLink: 'When to travel: orbital windows, in the route planner →',

  // -------------------------------------------------------------------------
  // Above the printed card
  // -------------------------------------------------------------------------
  card: {
    kicker: 'For the table',
    title: 'Cheatsheet',
    lede: 'Two faces of a {width}×{height}mm card: your turn on the front, the fight on the back.',
    print: 'Print faces',
    printNote: 'One A4 sheet at true size.',
  },
} as const
