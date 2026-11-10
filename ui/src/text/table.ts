/**
 * Every word around the board at the table (`components/table/`, and the
 * banner over the board), part by part as the table reads left to right:
 * the header bar, the rivals' cards, the turn log, the dice, your own status
 * and ship, your points, and the transport along the foot. The turn being
 * built (the action panel, the sequence, the route planner) keeps its words
 * elsewhere.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine or the view: the
 * words around a slot are free to change, and a slot may move or be dropped
 * but keeps its name. A word that only joins a list (", ", " and ") is kept
 * here too, so a list reads the way the sentence around it does.
 */

export const TABLE_TEXT = {
  header: {
    title: 'Dangerous Inclinations',
    turn: 'Turn {turn}',
    finalRound: 'FINAL ROUND',
    finalRoundTip:
      'Someone reached {points} points. The round is played out, then highest score wins (hull, then fuel, break ties).',
    toAct: '{name} to act',
    nobody: 'Nobody',
    watching: 'Watching',
    watchingSeat: "Watching · {name}'s seat",
    watchingSeatTip: 'Nothing here can be played.',
    watchingTip: 'Everything shown here is public information.',
    skip: 'skip',
    skipTip: 'Skip to the end of this turn',
  },

  rivals: 'Rivals',

  /** The banner over the board when a turn starts playing. */
  banner: {
    yours: 'Your turn',
    theirs: "{name}'s turn",
    somebody: 'Somebody',
  },

  opponent: {
    find: 'Find {name} on the board',
    findDestroyed: 'Nothing on the board to find',
    ping: 'Ping {name}',
    acting: 'acting',
    lost: 'lost',
    respawned: 'respawned, untouchable until their turn ends',
    respawnedTip:
      'Respawned at Home · no shot, missile or scan reaches it until its next turn is over, and on that turn it fires at nobody and scans nobody',
    points: '{points} of {toWin} points',
    hull: 'Hull',
    heat: 'Heat',
    fuel: 'fuel',
    fuelTip: 'Fuel is public: everyone can count it.',
    cargoTip: 'Cargo aboard. The hold has no limit. Destinations are private.',
    /** A fixed subsystem's badge when it is broken. */
    fixedBroken: '{slot} · broken',
  },

  escortedBy: {
    label: 'Escorted by',
    /** `{names}` is the escorts' names joined by `and`. */
    tipOne:
      '{names} holds an Escort card on this ship: paid the next time it delivers, sells or files at a station, and handed back if it is destroyed first.',
    tipMany:
      '{names} hold Escort cards on this ship: paid the next time it delivers, sells or files at a station, and handed back if it is destroyed first.',
    and: ' and ',
  },

  soldAt: {
    label: 'Sold at',
    /** `{names}` is the stations' names joined by `comma`. */
    tipOne: '{names} buys nothing more from {who}.',
    tipMany: '{names} buy nothing more from {who}.',
    you: 'you',
    comma: ', ',
  },

  log: {
    title: 'Turn log',
    empty: 'Nothing has happened yet.',
    turn: 'Turn {turn}',
  },

  dice: 'Dice',

  status: {
    facingTip: 'Prograde burns move you outward, retrograde inward',
    facing: {
      prograde: '↗ prograde',
      retrograde: '↙ retrograde',
    },
    destroyed: 'DESTROYED',
    destroyedTip: 'Off the board. You return to Home on your next turn.',
    untouchable: 'UNTOUCHABLE',
    untouchableTip:
      'Back from Home: this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody.',
    cargoTip: 'Cargo aboard',
    hull: 'Hull',
    heat: 'Heat',
    /** The heat track's tooltip, its sentences in this order. */
    heatTip: {
      planned: '{energy} energy on your subsystems.',
      check: 'Dissipates {dissipation}, carries {carried}.',
      damage: '−{damage} hull.',
      redline: 'Over {max} costs hull.',
    },
    redline: 'REDLINE',
    damage: '−{damage} hull',
    fuel: 'Fuel',
    fuelTip: 'Fuel is public.',
    missilesTip: '{slot}: {left} of {max} missiles. Private until you fire.',
  },

  loadout: {
    nothingUp: 'Nothing up until your next turn.',
    /** `{tiles}` is each tile's `upTile`, joined by `separator`. */
    up: 'Up until your next turn: {tiles}.',
    upTile: '{name} {energy}',
    scans: ' (scans)',
    fires: ' (fires)',
    separator: ' · ',
    tip: {
      passive: 'Passive: it works without energy.',
      firesAnyway:
        'It fires this turn, and its energy stays on until your next turn, so it is up anyway.',
      scansAnyway:
        'It scans this turn, and its energy stays on until your next turn, so every shot after the scan has the wider range.',
      powered:
        'Power {energy}/{max} · powered, it works until your next turn: {effect}. Every point of energy is heat at your check, and powering does not turn it face-up.',
      poweredFrom: 'Powered from the Systems step',
      takes: 'Takes {energy} energy when it acts, and every point is heat at your check',
      takesFrom: 'Powered by the step that uses it: nothing to set',
      broken: 'BROKEN · it takes no energy until repaired',
    },
    /** What a powered subsystem does until its owner's next turn (`site/numbers.ts`). */
    powered: {
      shields:
        'shields absorb {points} damage an energy ({plasma} of plasma{lasers}), and every point absorbed is heat',
      notLasers: ', not lasers',
      rack: 'a rack rolls at {intercepts} missiles a turn, and answering is {heat} heat',
      sensor: 'a sensor makes your criticals {crit}–{top}',
    },
  },

  missions: {
    points: 'Points {points}/{toWin}',
    none: 'No missions yet.',
  },

  transport: {
    turn: '{count} turn',
    turns: '{count} turns',
    /** A tick's tooltip and label. */
    tickOne: "Replay {name}'s turn (round {turn}, {lines} event)",
    tickMany: "Replay {name}'s turn (round {turn}, {lines} events)",
    speed: 'Speed',
    readingPace: 'Turns play at reading pace',
    faster: 'Turns play {speed} times faster',
    option: '{speed}x',
  },

  /** The tooltips on the board's missiles, flying and planned. */
  board: {
    missile:
      "{owner}'s missile → {target} · {left} flight(s) left. Rides its orbit, then flies up to {steps} steps toward the target (rings first). The turn it is launched it flies at once, from where it was launched, with no ride. {moves} flights max.",
    plannedSalvo: 'Planned salvo of {count} at {target} · each flies up to {steps} steps this turn',
    plannedMissile: 'Planned missile at {target} · flies up to {steps} steps this turn',
  },

  /** The chat plate, under the log at the table and beside the setup screens. */
  talk: {
    title: 'Table talk',
    /** The round a line was said in. */
    turn: 'T{turn}',
    thinking: 'thinking',
    empty: 'Nobody has said anything yet.',
    sayPlaceholder: 'Say something…',
    message: 'Table talk message',
    send: 'Send',
    enter: 'Enter sends',
  },
} as const
