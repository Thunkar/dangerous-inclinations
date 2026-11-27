/**
 * Every word on the rules page (`/rules`), top to bottom: the page head, the
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
    kicker: 'Rules',
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
    card: 'Player card',
  },

  // -------------------------------------------------------------------------
  // 01 · The goal
  // -------------------------------------------------------------------------
  goal: {
    kicker: 'The goal',
    title: '{points} points end the round',
    lede: 'Score your secret mission cards. When anyone reaches {points}, finish the round. The highest score wins. Ties go to the most hull, then the most fuel, then the earlier seat.',
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
    lede: 'Fit it for the missions you kept.',
    forward: 'Forward · {slots}',
    /** Printed on the back of a face-down forward tile. */
    forwardBack: 'Fwd',
    side: 'Side · {slots}',
    /** Printed on the back of a face-down side tile. */
    sideBack: 'S{n}',
    fixed: 'On every ship',
  },

  // -------------------------------------------------------------------------
  // 03 · The turn (the steps themselves are in turn.ts)
  // -------------------------------------------------------------------------
  turn: {
    kicker: 'In game',
    title: 'Your turn',
    lede: 'You choose the order of your actions. The rest of the turn is fixed.',
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
    title: 'Coast, burn, jump or fold',
    lede: 'Every ring orbits at its own speed, and the inner rings are faster.',
    /** The two stamped figures under each move. */
    fuel: 'fuel',
    energy: 'energy',
    coast: {
      title: 'Coast',
      text: 'Orbit at your ring’s speed. With the <b>scoop</b> on, gain that much fuel.',
      diagram: {
        label: "A coast: the ship orbits forward along its ring by the ring's speed",
        ring: 'your ring',
        drift: "orbit = the ring's speed",
      },
    },
    burn: {
      title: 'Burn',
      text: 'Orbit, then cross {rings} rings for 1 fuel and 1 energy each. Facing prograde you burn out, facing retrograde in.',
      diagram: {
        label: 'A burn: orbit first, then change ring; prograde burns outward, retrograde inward',
        outer: 'outer ring',
        inner: 'inner ring',
        drift: 'orbit first',
        prograde: 'prograde: out',
        retrograde: 'retrograde: in',
      },
    },
    jump: {
      title: 'Jump',
      text: 'From a lane’s departure arc to the same sector of its arrival arc. Face prograde. You don’t orbit, and lanes run <b>one way</b>. With a compressor it costs {compressedFuel} fuel.',
      diagram: {
        label:
          "A jump: from a lane's departure arc on the black hole's outer ring to the matching sector of the planet's arrival arc, without orbiting",
        depart: 'depart',
        arrive: 'arrive',
        from: 'black hole ring {ring}',
        to: 'planet ring {ring}',
        note: 'same sector of the arc · no orbit',
      },
    },
    phasing: {
      title: 'Phasing: land short or long (example)',
      label:
        'A soft burn out from ring {from} to ring {to}: the ship orbits {drift} sectors, then lands on ring {to} straight out for free, or up to {most} sectors either side for 1 fuel each',
      ring: 'RING {ring}',
      speed: 'SPEED {speed}',
      free: 'FREE',
      paid: 'FUEL',
      drift: 'ORBIT {sectors}',
      burn: 'BURN OUT',
      caption:
        'A soft burn out from ring {ring}. Each sector short or long costs 1 fuel, up to {most} long, and never back onto your start.',
      jump: 'A jump can land on any sector of the arrival arc, for 1 fuel per sector away from the matching one.',
    },
    fold: {
      title: 'Fold',
      text: 'With a <b>jump drive</b>, put your ship on any sector of your well, or between the black hole and a planet, but never on a station. It costs <b>{fuel} fuel</b> ({compressed} with a compressor), {energy} energy on the drive and {engines} on the engines. It is your move, and you don’t orbit.',
      diagram: {
        label:
          'A fold: the ship leaves its sector and appears on any sector of its own well without orbiting, or crosses between the black hole and a planet; never planet to planet, never onto a station',
        anywhere: 'any sector · no orbit',
        station: 'never a station',
        planets: 'never planet to planet',
      },
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
        'Energy <b>stays on the subsystem until your next turn</b>, so shields, a rack or a sensor you power work through everyone else’s turns.',
      absorbed:
        'Damage your shields absorb is heat too, a point for a point. A rack that rolls at missiles adds {interceptHeat} heat, however many it rolls at.',
      over: 'At your check, each point above {maxHeat} is 1 hull damage, and the track drops to {maxHeat}. Then dissipate {dissipation} ({radiator} more per radiator) and carry the rest.',
      cold: 'Start your turn at 0 heat and power nothing: at your check, you repair one broken subsystem.',
    },
    energyTitle: 'Energy each action puts on its subsystem',
    /** The thirteen cells, in order. */
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
      fold: 'Fold',
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
    lede: 'Each weapon fires once a turn. Roll a d10, and on a critical name a slot on the target.',
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
        '±{rings} ring, ±{sectors} sector, either side. With energy on it, it rolls at up to {intercepts} missiles a turn and shoots each down on {on}+, for {heat} heat however many.',
      missiles:
        'Any ship in your well. Launch any number at one ship: {aboard} aboard, {steps} steps a turn for {turns} turns.',
      plasma_cannon:
        '±{rings} ring, ±{sectors} sector, off one side. <b>Each energy on a shield stops {points} damage.</b>',
      disruptor:
        'An EMP burst: ±{rings} rings, ±{sectors} sectors, either side. <b>No damage</b>: a hit breaks a slot you name, unless a shield still has unspent energy this turn. A critical breaks it anyway.',
    },
    /** A gun that fits either slot. */
    eitherSlot: 'forward or side',
    slotLine: '{slot} · {energy} energy',
    damage: 'damage',
    missilesTitle: 'Missiles in flight',
    missile: {
      label:
        'Launched, the missile flies at once from where you dropped it, and your ship moves on. On its second turn it rides its ring, then flies, and reaches the target on turn {hitTurn}',
      ring: 'RING {ring}',
      speed: 'SPEED {speed}',
      targetDrifts: 'target orbits',
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
        'A missile flies {steps} steps the moment you launch it, from the sector you dropped it on, and hits before your next action. If you move afterwards, it stays behind. On each of your later turns it flies {steps} steps and rides its orbit, in the order you choose. When its flight ends on the target’s sector, it attacks like a weapon ({damage} damage), unless a rack with energy on it shoots it down on {on}+. It lasts {turns} turns.',
    },
    /** The two columns of points at the foot of the section. */
    hits: [
      '<b>Shields absorb first</b>: each energy stops {shieldPoints} damage ({plasmaPoints} of plasma), and the wall is whole again for the next attacker. <b>Every point absorbed is heat</b> on the target’s track. Lasers ignore shields.',
      'At 0 hull the ship is destroyed (see 08).',
      'Every weapon reaches your own sector. Nothing fires from one well into another.',
    ],
    rules: [
      '<b>A critical breaks the slot you name</b>, even through shields, and its energy goes onto its owner’s heat.',
      '<b>A berth is safe</b>: a moored ship can’t fire or be fired at, missiles included, and nobody can scan it.',
    ],
  },

  // -------------------------------------------------------------------------
  // 07 · Secrets
  // -------------------------------------------------------------------------
  secrets: {
    kicker: 'Hidden information',
    title: 'Secret until used',
    lede: 'A subsystem turns face up the first time it does its job.',
    revealsTitle: 'Face up when',
    /** One row each, next to the tiles it names. */
    reveals: {
      weapon: 'A weapon, when it fires.',
      rack: 'A rack, when it fires or rolls at a missile.',
      shields: 'Shields, when they absorb damage or stop a disruptor.',
      sensor: 'A sensor, when it scans.',
      radiator: 'A radiator, when your heat is over {heat} at a check, before you dissipate.',
      compressor: 'A compressor, when it makes a jump or a fold cheaper.',
      jumpDrive: 'A jump drive, when it folds.',
      broken: 'Any subsystem, when a critical breaks it.',
    },
    revealsFoot: 'Powering a subsystem doesn’t turn it face up.',
    energyTitle: 'Read the energy',
    energy: [
      'Energy on every subsystem is <b>public</b>. On a face-down subsystem it means powered, not used.',
      'A face-down gun has no energy on it: firing turns it face up.',
    ],
    scanTitle: 'Scan to be sure',
    scan: [
      'With a sensor, scan a ship on your ring 1–{sectors} sectors ahead, or in your sector, and look at one of its face-down subsystems. If you hold an Intercept on that player, take their data too.',
    ],
  },

  // -------------------------------------------------------------------------
  // 08 · Destruction
  // -------------------------------------------------------------------------
  death: {
    kicker: 'Destruction',
    title: 'Nobody is out',
    lede: 'A destroyed ship comes back. It loses its cargo and a turn.',
    /** The three steps, left to right. */
    steps: [
      {
        when: 'At 0 hull',
        title: 'Off the board',
        text: 'Leave a wreck. Crates go back to their station, and loot and data are lost. Escort markers go back to their owners, and your missiles in flight are removed.',
      },
      {
        when: 'Your next turn',
        title: 'Back at Home',
        text: 'Full hull and fuel, repaired and reloaded, heat 0. You orbit with your ring, and your turn ends.',
      },
      {
        when: 'The turn after',
        title: 'A quiet turn',
        text: 'Move as usual, but you can’t fire, scan or seize. Nobody can touch you until it ends.',
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
    title: 'Player card',
    lede: 'One for each player: your turn on the front, the fight on the back. {width}×{height}mm, a 4×6in photo sleeve.',
    print: 'Print',
    modes: { sheet: 'Sheet', duplex: 'Double-sided' },
    flips: { long: 'Long-edge flip', short: 'Short-edge flip' },
    printNote: {
      sheet:
        'One A4 page: the front above the back. Print one-sided at actual size, cut out both faces and glue the back to the front.',
      'duplex-long':
        'Two A4 pages: two fronts, then two backs. Print both sides at actual size, flipping on the long edge, and cut along the marks.',
      'duplex-short':
        'Two A4 pages: two fronts, then two backs. Print both sides at actual size, flipping on the short edge, and cut along the marks.',
    },
  },
} as const
