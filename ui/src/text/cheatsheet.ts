/**
 * Every word on the cheatsheet (`/card`), top to bottom: the page head, the
 * contents, the nine sections in order, and the block above the printed
 * card. The turn's steps are in `turn.ts`, the mission cards' words in the
 * engine (`engine/src/text/missionCards.ts`) and the card's faces in
 * `printedCard.ts`.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine: the words around
 * a slot are free to change, and a slot may move or be dropped but keeps its
 * name. A word set differently inside a sentence is marked with a tag, `<b>`
 * for bold and the few others named where they are used (`<red>`, `<nb>` for
 * a range that must not break across lines).
 */

export const CHEATSHEET = {
  // -------------------------------------------------------------------------
  // The head of the page
  // -------------------------------------------------------------------------
  page: {
    kicker: 'Cheatsheet',
    /** `<red>` is set in red. */
    title: 'How to <red>play</red>',
    lede: 'A first game, in order. Read 01 to 03 before you start and the rest as it comes up. The rulebook has the details and wins any disagreement.',
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
    windows: 'Orbital windows',
    card: 'The card',
  },

  // -------------------------------------------------------------------------
  // 01 · The goal
  // -------------------------------------------------------------------------
  goal: {
    kicker: 'The goal',
    title: '{points} points end the round',
    lede: 'Score your secret mission cards. When anyone reaches {points}, finish the round; the highest score wins, then the most hull, then the most fuel.',
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
      detail: 'Dealt {dealt} from a shuffled pile, keep any {kept}; two of a kind are two jobs.',
    },
  },

  // -------------------------------------------------------------------------
  // 02 · Setting up
  // -------------------------------------------------------------------------
  setup: {
    kicker: 'Before the first turn',
    title: 'Build the ship',
    lede: 'Make it yours, keep your eye on the missions',
    forward: 'Forward · {slots}',
    /** Printed on the back of a face-down forward tile. */
    forwardBack: 'Fwd',
    side: 'Side · {slots}',
    /** Printed on the back of a face-down side tile. */
    sideBack: 'S{n}',
    fixed: 'Mandatory on every ship',
  },

  // -------------------------------------------------------------------------
  // 03 · The turn (the steps themselves are in turn.ts)
  // -------------------------------------------------------------------------
  turn: {
    kicker: 'Your turn',
    title: 'Seven steps, then the stations',
    lede: 'You choose the order of your actions; the rest is fixed.',
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
    lede: 'Every turn your ring carries you forward. Your one move is what you do about it.',
    /** The two stamped figures under each move. */
    fuel: 'fuel',
    energy: 'energy',
    coast: {
      title: 'Coast',
      text: 'Drift only. Run the <b>scoop</b> ({scoopEnergy} energy) to gain fuel equal to your ring’s speed.',
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
      over: 'Over {maxHeat} heat at your check is hull damage. Dissipate {dissipation} (+{radiator} a radiator) and carry the rest.',
      cold: 'If you have 0 heat at your check, repair one broken subsystem.',
    },
    energyTitle: 'Energy an action puts on its subsystem',
    /** The ten cells, in order. */
    energy: {
      rotate: 'Rotate',
      burn: 'Burn',
      jump: 'Jump',
      scoop: 'Scoop',
      railgun: 'Railgun',
      laser: 'Laser',
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
      stops: 'the track stops',
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
        '±{rings} ring, ±{sectors} sector, either side. With energy on it, shoots down {intercepts} missiles a turn on {on}+.',
      missiles:
        'Any ship in your well. Launch any number at one ship: {aboard} aboard, {steps} steps a turn for {turns} turns.',
    },
    /** A gun that fits either slot. */
    eitherSlot: 'forward or side',
    slotLine: '{slot} · {energy} energy',
    damage: 'damage',
    missilesTitle: 'Missiles in flight',
    missile: {
      label:
        'Launched, then the ship moves on: the missile flies from where it was dropped with no ride on its first turn, rides its ring then flies on its second, and reaches the target on turn {hitTurn}',
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
        'The turn you launch it, a missile flies {steps} steps from the sector you dropped it on, whether you fired before your move or after it. At the end of every turn after that it rides its orbit, then flies {steps}. On the target’s sector it attacks like a weapon ({damage} damage), unless a rack with energy on it shoots it down on {on}+. It lasts {turns} turns.',
    },
    /** The two columns of points at the foot of the section. */
    hits: [
      '<b>Shields absorb first</b>: {shieldEnergy} energy stop 1 damage. Lasers ignore them.',
      'The rest is hull. At 0 the ship is destroyed (see 08).',
    ],
    rules: [
      '<b>A critical breaks the slot you named</b>, shields or not, and its energy goes onto its owner’s heat.',
      'In your own sector every weapon reaches. Nothing fires across wells.',
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
      shields: 'Shields, when they absorb damage.',
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
        text: 'Leave a wreck. Crates go back to their station, data is lost, Escort markers on you go back to their owners and your missiles in flight are removed. Your Destroy holder scores {destroyPoints}.',
      },
      {
        when: 'Your next turn',
        title: 'Back at Home',
        text: 'Full hull and fuel, heat 0, drifting. That is the turn.',
      },
      {
        when: 'The turn after',
        title: 'A quiet turn',
        text: 'Move as usual, fire at nobody, scan nobody. Nobody can touch you until it ends.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 09 · Orbital windows
  // -------------------------------------------------------------------------
  windows: {
    kicker: 'When to travel',
    title: 'Orbital windows',
    lede: 'The stations, the lanes and the rings all turn at fixed speeds, so some turns are simply better for a trip than others. All of it is read off one number: the station clock.',
    /** Where a rule of thumb stands while the route planner is still working. */
    working: 'Asking the route planner',
    /** A delivery route, "Alpha → Gamma". */
    route: '{from} → {to}',

    clock: {
      title: 'The station clock',
      steps:
        'Every station starts on sector {sector} of its planet’s ring {ring} and steps <b>{drift} sectors clockwise</b> at the end of every round. All three step together, so <b>every station is always on the same sector</b>.',
      reads:
        'That sector is the clock. It only ever reads <b>{readings}</b>, and it comes round every {rounds} rounds.',
      /** `<nb>` keeps a range on one line. */
      planets:
        'Every planet is laid out the same: you arrive from the black hole on ring {arriveRing} at sectors <nb>{arriveSectors}</nb>, and leave for it from ring {leaveRing} at sectors <nb>{leaveSectors}</nb>. So the same windows hold for {planets}.',
      caption:
        'Any planet from above, sector 0 at the top and clockwise the way ships drift. The red squares are the only {places} places a station can be.',
      diagram: {
        label:
          'A planet seen from above. The station rides ring {ring} and steps {drift} sectors clockwise every round, so it only ever sits on sector {readings}. Ships arrive from the black hole on ring {arriveRing} sectors {arriveSectors} and leave from ring {leaveRing} sectors {leaveSectors}.',
        planet: 'PLANET',
        arrive: 'arrive',
        leave: 'leave',
        foot: 'ring {stationRing}: stations · ring {laneRing}: lanes · +{drift} a round',
      },
    },

    lanes: {
      title: 'Black hole ring {ring}',
      arcs: 'The black hole’s outer ring is all lanes, one way, {sectors} sectors each. Solid arcs are where you <b>jump out</b> to a planet; open arcs are where you <b>land</b> coming back.',
      circuit:
        'Every landing arc is followed clockwise by the next planet’s jump arc, so the short way round the map is <b>{circuit}</b> (the red hops). Going the other way means crossing most of the ring, and the Deliver deck prints only the {routes} routes that ride the circuit.',
      table: {
        planet: 'To reach',
        arc: 'Jump from ring {ring}',
        mouth: 'Lane mouth',
      },
      caption:
        'Sector 0 at the top, clockwise. The lane mouth is the first sector of a jump arc: the timings below count from reaching it.',
      diagram: {
        label:
          "Black hole ring {ring} is six lane arcs, clockwise: {arcs}. Every arrival arc is followed clockwise by the next planet's departure arc, so {circuit} is the short way round.",
        out: 'out to',
        in: 'in from',
        hole: 'BLACK HOLE',
        ring: 'RING {ring}',
      },
    },

    approach: {
      title: 'Hint 1 · Getting to a station',
      rule: 'Reach the lane mouth when the clock shows {readings}',
      reason: 'Docked {turns} turns later. {late}',
      drift:
        'You drift through a jump arc at {sectors} sector{plural} a turn, so you have a few turns on it to wait for a better clock before you jump.',
      /** Added to "sector" when the drift is more than one. */
      plural: 's',
      strip: 'Clock when you reach the lane mouth → turns until docked',
    },

    /** A round late, from the best reading. */
    late: 'A round late the clock reads {reading} and it takes {turns}{worst}.',
    lateWorst: '; on {readings} it takes {turns}',

    /** What a fuel compressor does to a table. */
    compressor: {
      nothing: 'A fuel compressor changes nothing here.',
      saves: 'A fuel compressor {by} on {readings}.',
      aTurn: 'saves a turn',
      turns: 'saves turns',
    },

    tanker: {
      title: 'Hint 2 · Tanker: arrive with {fuel}',
      rule: 'Leave the black hole with a full tank, reach the mouth on {readings}',
      reason: 'You dock with {fuel} aboard in {turns} turns.',
      others: ' On the other clocks it takes {turns}.',
      cost: 'Keeping {fuel} aboard costs turns: a full tank has only {spare} to spare, and a jump alone is {jump} fuel ({compressed} with a compressor), so the routes that spend freely are out. The route planner finds the rest: set <b>Arrive with {fuel}</b>.',
      plain: 'Without a compressor',
      compressed: 'With a compressor',
    },

    leg: {
      title: 'Hint 3 · Delivery: the second leg',
      rule: 'Ride the circuit, and leave the pickup station on {readings}',
      reason: '{routes}: {turns} turns, station to station, whenever you leave.',
      moored:
        'Moored, you ride the station round, so waiting for the clock costs nothing but turns.',
      compressed: ' With a compressor, leaving on {readings} cuts the leg to {turns} turns.',
      caption: "The Deliver deck's {routes} routes: each one leg of the circuit.",
      strip: 'Clock when you leave → turns to the next station',
      stripCompressed: 'With a compressor',
      diagram: {
        label:
          'The planets in a ring: {circuit}. Each delivery leg the deck prints takes {turns} turns, station to station.',
        foot: 'turns, station to station',
      },
    },

    /** The strip of turns under each hint, read aloud. */
    strip: {
      reading: 'on {reading}, {turns}',
      noRoute: 'no route',
      label: '{label}: {readings}. Quickest on {best}.',
      working: '{label}: still being worked out.',
      turns: 'TURNS',
    },

    foot: 'Worked out on this page by the game’s own route planner: the fewest turns from a full tank of {fullTank} with a working scoop, the stations stepping once a round. Hints 1 and 2 count from reaching a lane mouth on black hole ring {ring}; hint 3 from moored at the pickup station. Only turns are kept down, not fuel. Every planet is built the same and the three circuit legs are one leg turned round, so {planet} and {route} are worked out and hold for all of them.',
  },

  // -------------------------------------------------------------------------
  // Above the printed card
  // -------------------------------------------------------------------------
  card: {
    kicker: 'For the table',
    title: 'One card for every seat',
    lede: 'Two faces of a {width}×{height}mm card: your turn on the front, the fight on the back.',
    print: 'Print faces',
    printNote: 'One A4 sheet at true size.',
  },
} as const
