/**
 * Every word of the explainer film (`dev-explainer.tsx`, shot by
 * `cad/scripts/table/film.mjs`), in the order it appears. Each topic is a
 * slide that teaches the rule with a diagram, then a demonstration on the
 * printed table with one caption at a time. Worded as the cheatsheet words
 * the same rules (`cheatsheet.ts`, `turn.ts`), shorter, because nobody stops
 * a film to read.
 *
 * Only strings live here. A `{name}` is a slot the film fills with a number
 * from the engine or the game it plays.
 */

export const EXPLAINER = {
  hero: {
    kicker: 'A tabletop game for {min}–{max} players',
    title: ['Dangerous', 'Inclinations'],
    motto: 'Burn. Jump. Fire.',
    line: 'Ships orbit a black hole and three planets.',
  },

  slides: {
    goal: {
      n: '01',
      kicker: 'The goal',
      title: 'Score {points} points',
      primaries: 'Primaries · {points} points',
      primariesDeal: 'Dealt {dealt}, keep {kept}',
      secondaries: 'Secondaries · {points} point',
      secondariesDeal: 'Dealt {dealt}, keep {kept}',
      sum: 'Your hand is worth {held}. {points} wins.',
      end: 'When anyone reaches {points}, finish the round. Highest score wins.',
    },
    build: {
      n: '02',
      kicker: 'Before the first turn',
      title: 'Build your ship',
      forward: 'Forward slot · pick 1',
      side: 'Side slots · pick 4',
      fixed: 'Every ship has',
      missions: 'Build for your missions',
      needs: ['Destroy needs a weapon that deals damage', 'Intercept needs a sensor array'],
      hidden: 'Your subsystems start face-down. Nobody knows your build.',
      example: 'This ship',
    },
    turn: {
      n: '03',
      kicker: 'In game',
      title: 'Your turn',
      lede: 'Your actions in any order. The rest is fixed.',
      steps: [
        { title: 'Clear', text: 'Last turn’s energy goes back' },
        { title: 'Actions', text: 'Power, rotate, move, fire, scan…' },
        { title: 'Missiles', text: 'Yours in flight move and strike' },
        { title: 'Heat check', text: 'Every cube on your ship is heat' },
        { title: 'Dock', text: 'If you arrived at a station' },
        { title: 'Missions', text: 'Flip what you completed' },
      ],
      round: 'Once a round, after the last player: the stations move.',
    },
    orbits: {
      n: '04',
      kicker: 'Getting somewhere',
      title: 'Orbits',
      lede: 'Every ring turns. Inner rings are faster.',
      speed: '{speed} a turn',
      ring: 'Ring {ring}',
    },
    moves: {
      n: '04',
      kicker: 'Getting somewhere',
      title: 'One move a turn',
      coast: {
        title: 'Coast',
        cost: 'Free',
        text: 'Drift your ring’s speed. Run the scoop for fuel.',
      },
      burn: {
        title: 'Burn',
        cost: '1 fuel, 1 energy a ring',
        text: 'Drift, then cross 1–3 rings. Facing prograde out, retrograde in.',
      },
      phasing: {
        title: 'Phasing',
        text: 'A burn lands where the drift takes you, or short or long of it for 1 fuel a sector.',
        free: 'Free',
        fuel: 'fuel',
        drift: 'drift {speed}',
      },
      jump: {
        title: 'Jump',
        cost: '{fuel} fuel ({compressed} with a compressor)',
        text: 'From the black hole’s outer ring to a planet. Lanes run one way.',
      },
    },
    heat: {
      n: '05',
      kicker: 'Energy and heat',
      title: 'Every action costs energy',
      lede: 'Each action puts cubes on the subsystem it uses.',
      stays:
        'The cubes stay until your next turn, so shields, a rack or a sensor work through everyone else’s turn.',
      check: 'At your heat check every cube on your ship is 1 heat.',
    },
    heatCheck: {
      n: '05',
      kicker: 'Energy and heat',
      title: 'The heat check',
      lede: 'The cubes on your ship, plus the heat on your track.',
      dissipate:
        'Dissipate {dissipation} (+{radiator} for each radiator). Carry the rest into your next turn.',
      over: 'Over {maxHeat}: each point over is 1 hull damage, and your heat stops at {maxHeat}.',
      absorbed:
        'Shields absorb a point a cube: the cube is spent for that turn and the point goes on your heat track.',
      rack: 'A rack that rolls at missiles puts {heat} on your heat track, however many it rolls at.',
    },
    fight: {
      n: '06',
      kicker: 'Combat',
      title: 'Roll one d10',
      lede: 'Each weapon fires once a turn. Name a slot on the target, then roll.',
      faces: ['{top} misses', '{from}–{to} hit', '{face} critical'],
      critical: 'A critical also breaks the slot you named, shields or not.',
      shields: 'Shields absorb damage, a point a cube. Not lasers.',
      zero: 'At 0 hull the ship is destroyed.',
    },
    missiles: {
      n: '06',
      kicker: 'Combat',
      title: 'Missiles',
      rows: [
        'One action launches a salvo: any number of your missiles at one ship in your well.',
        'It flies {steps} steps at once, rings first, and attacks if it reaches the target’s sector: {damage} damage on a hit.',
        'After each of your turns it flies {steps} more and rides its orbit, in either order. It lasts {turns} turns.',
        'A rack with energy on it rolls at each missile that reaches it: {on}+ shoots it down. That is {heat} heat, however many.',
      ],
    },
    secrets: {
      n: '07',
      kicker: 'Hidden information',
      title: 'Secret until used',
      lede: 'A subsystem turns face-up the first time it does its job.',
      rows: [
        'A weapon, when it fires',
        'Shields, when they absorb',
        'A radiator, when your heat passes {heat}',
        'A compressor, when it saves you fuel',
      ],
      public: 'Energy cubes are public: everyone sees what you powered.',
    },
    stations: {
      n: '09',
      kicker: 'Stations',
      title: 'Dock and trade',
      rows: [
        'Arrive on a station: repair everything, full hull, reload',
        'Then one thing: load the crates waiting, or sell one item',
        'Each station buys from you once',
        'Moored ships cannot be fired at',
      ],
      move: 'Once a round the stations move {drift} sectors, carrying moored ships.',
    },
    death: {
      n: '08',
      kicker: 'Destruction',
      title: 'Nobody is out',
      steps: [
        { when: 'At 0 hull', title: 'Off the board', text: 'Leave a wreck. Your cargo is lost.' },
        { when: 'Your next turn', title: 'Back at Home', text: 'Full hull and fuel, repaired.' },
        {
          when: 'The turn after',
          title: 'A quiet turn',
          text: 'Move, but no firing. Nobody can touch you.',
        },
      ],
    },
  },

  /** The demonstrations' captions, one at a time in the lower third. */
  captions: {
    hand: 'Your three missions lie face-down in front of you',
    bays: 'Each subsystem goes face-down in its bay',
    clear: '1 · Clear: last turn’s cubes go back to the supply',
    coast: 'Coast: Gamma’s ring 1 drifts {sectors} sectors',
    scoop: 'The scoop gains the ring’s speed in fuel: +{fuel}',
    fuelDie: 'The tank was empty: the fuel die goes back on its stand at {fuel}',
    rotate: 'Facing prograde burns out. Rotate to face prograde: +1 energy',
    drift: 'Burn: first drift {sectors} sectors…',
    burnOut: '…then cross out to ring {ring}: 1 fuel',
    phase: 'Phasing: land {sectors} sectors further, 1 fuel each',
    jump: 'Jump: down the lane to Gamma',
    rotateIn: 'Facing retrograde burns in. Rotate to face retrograde: +1 energy',
    driftIn: 'Burn: first drift {sectors} sector (ring {ring} is slow)…',
    burnIn: '…then cross in {rings} rings: a hard burn, {fuel} fuel',
    compressor: 'A jump is {fuel} fuel. With a compressor: {compressed}',
    cubes: 'Shields +2, rack +2, scoop +3: 7 cubes on the ship',
    check: 'Heat check: 7 heat, dissipate 5 + 2 for the radiator',
    radiator: 'Dissipating heat turns the radiator face-up',
    fire: 'The rack fires at the orange ship',
    hit: 'A {roll}: hit for {damage}. Orange is at 0 hull',
    wreck: 'Destroyed: a wreck goes on its sector',
    critical: 'Second rack at purple: a {roll}, critical',
    broken: 'The critical breaks purple’s missiles',
    racks: 'Both racks fired: both turn face-up',
    launch: 'Purple launches a salvo of {count} at orange',
    flies: 'It flies {steps} steps at once',
    rides: 'Purple’s next turn: the salvo rides its orbit and flies {steps} more',
    reaches: 'It reaches orange: orange’s rack rolls at each missile',
    shotDown: 'All {count} shot down on {on}+. Orange puts {heat} on its heat track',
    home: 'Orange’s next turn: back at its Home, full hull',
    dock: 'Burn onto Gamma’s station and dock',
    repair: 'Docked: full hull',
    sell: 'Sell one item: the Survey data. Gamma has bought once',
    card: 'Survey is done: flip it, +1 point',
    stations: 'End of the round: the station moves 4, carrying the ship',
  },

  /**
   * What the voice says over each moment: the rule in a sentence or two.
   * The captions stay short; this is where the explanation is.
   */
  narration: {
    title:
      'Dangerous Inclinations. A tabletop game of orbits, heat and hidden weapons, for three to six players.',
    goal: 'You play for secret mission cards. You are dealt three primaries, worth two points, and keep one. Then three secondaries, worth one point, and keep two. When anyone reaches three points, the round plays out, and the highest score wins.',
    hand: 'Your missions lie face-down in front of you until you complete them.',
    build:
      'Before the first turn, build your ship. Choose one subsystem for the forward slot and four for the side slots. Every ship also has engines, thrusters and a fuel scoop. Build for your missions: Destroy needs a weapon, and Intercept needs a sensor.',
    bays: 'Each subsystem goes face-down into its bay on your ship’s base. Nobody knows what you are carrying.',
    turn: 'Every turn runs the same way. Clear last turn’s energy, take your actions in any order, let your missiles fly, then check your heat. If you arrived at a station, you dock. Last, flip any mission you completed.',
    clear: 'First, clear. The energy cubes from your last turn go back to the supply.',
    orbits:
      'Everything orbits. Each ring carries you a set number of sectors every turn, and the inner rings are the fastest.',
    moves:
      'You make one move a turn. Coast, and you drift your ring’s speed for free. Burn, and you drift, then cross one to three rings: facing prograde takes you out, facing retrograde takes you in. A burn can also land a few sectors short or long, for one fuel each. Or jump down a lane, from the black hole to a planet.',
    burnOut:
      'Here the ship turns to face prograde, drifts eight sectors, and burns out one ring. Then it pays two more fuel to land two sectors further on.',
    jump: 'From the black hole’s outer ring, a jump follows a one-way lane to a planet. It costs three fuel, or one with a compressor.',
    burnIn:
      'Now facing retrograde, a burn takes the ship inward. It drifts one sector on the slow outer ring, then burns hard across three rings.',
    scoop: 'Coasting with the scoop running gains fuel equal to your ring’s speed. Six, here.',
    fuelDie: 'The tank was empty, so the fuel die goes back on its stand.',
    heat: 'Every action puts energy cubes on the subsystem that does it, and they stay there until your next turn. That is how shields, racks and sensors keep working while others play.',
    cubes: 'This turn: shields, a rack and the scoop. Seven cubes.',
    heatCheck:
      'At your heat check, every cube is one point of heat. You dissipate five, plus two for each radiator, and carry the rest. Over ten, every point over is hull damage. Damage your shields absorb, and a rack firing at missiles, also go on your heat track.',
    check:
      'Seven heat. Dissipate five, plus two for the radiator, and nothing carries over. Dissipating that heat gives the radiator away.',
    fight:
      'To shoot, name a slot on your target and roll a ten-sided die. A one misses, two to nine hits, and a ten is a critical: it also breaks the slot you named.',
    fire: 'The rack fires at the orange ship and rolls a six: a hit for two. Orange is at zero hull. Destroyed, it leaves a wreck.',
    critical:
      'The second rack fires at purple and rolls a ten. A critical: purple’s missiles are broken.',
    missiles:
      'Missiles fly in salvos. One action launches any number at a ship in your well. The salvo flies three steps at once, then flies three more and rides its orbit each turn, in either order. A powered rack can shoot them down on a two or better.',
    launch: 'Purple launches a salvo of four at orange. It flies three steps straight away.',
    intercept:
      'On purple’s next turn, it rides its orbit and catches orange. But orange’s rack shoots down all four.',
    secrets:
      'Your subsystems stay secret until they do their job: a weapon when it fires, shields when they absorb. But energy cubes are public, so everyone can see what you have powered.',
    racks: 'Both racks fired, so both come out of their bays and onto the ship.',
    death:
      'Nobody is ever out. A destroyed ship leaves a wreck and loses its cargo. On its next turn it is back at Home, with full hull and fuel. The turn after, it moves, but cannot fire, and nobody can touch it.',
    respawn: 'Orange returns to its Home marker.',
    stations:
      'Stations orbit each planet. Arrive on one and you dock: repair everything, then load your crates or sell one item. Each station buys from you only once, and docked ships cannot be shot. Once a round, the stations move four sectors.',
    dock: 'The ship burns onto Gamma’s station and docks.',
    sell: 'It sells its Survey data, and keeps Gamma’s chip to show the sale. Docking also restored its hull.',
    card: 'Survey is complete. Flip the card: one point.',
    stationsMove:
      'At the end of the round, the station moves on, carrying the docked ship with it.',
    end: 'Dangerous Inclinations. Burn. Jump. Fire.',
  },

  roll: { miss: 'miss', hit: 'hit', critical: 'critical' },
  ledger: {
    cubes: 'cubes on the ship',
    carried: 'carried in',
    atCheck: 'heat at the check',
    dissipate: 'dissipates',
    radiator: 'radiator',
    next: 'into your next turn',
  },
} as const
