/**
 * Every word in the turn column (`components/table/ActionPanel.tsx` and
 * `components/table/actions/`), top to bottom: the panel's states, the
 * loadout, orientation, the move, the route planner, the systems, the
 * repair, the dock and the four "you may" steps, the sequence and the end of
 * the turn; then what the plan preview (`plan/preview.ts`) says of a step
 * still missing a choice.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine or the plan: the
 * words around a slot are free to change, and a slot may move or be dropped
 * but keeps its name. A word that changes with a count has a `one` and a
 * `many` form.
 */

export const ACTIONS = {
  /** Small words more than one control says. */
  words: {
    /** A number said as a word, by value; past the end it is the figure. */
    numbers: ['no', 'one', 'two', 'three', 'four', 'five'],
    outward: 'outward',
    inward: 'inward',
    rings: { one: '{rings} ring {direction}', many: '{rings} rings {direction}' },
    /** A burn intensity as a label. */
    intensityLabel: { soft: 'Soft', medium: 'Medium', hard: 'Hard' },
    /** An item a pirate takes, by kind. */
    item: { crate: 'crate', loot: 'loot', data: 'data' },
    /** Where a step offered before or after the move goes, on its chip and in its tooltip. */
    when: { before: 'now', after: 'after the move' },
    whenTitle: {
      before: 'A step in your sequence, before your move and your shots.',
      after: 'A step in your sequence, right after your move.',
    },
    /** A phasing figure with its sign. */
    plus: '+{value}',
  },

  panel: {
    title: {
      ended: 'Game over',
      watching: 'Watching',
      yours: 'Your turn',
      table: 'The table',
    },
    winner: '{winner} wins.',
    ended: 'The game has ended.',
    watching: 'Nothing here can be played.',
    sittingOut:
      'Your ship is lost. You return to Home this turn with a full hull and tank and drift; nobody can touch you until your next turn is over.',
    animating: 'Watching the turn play out…',
    waiting: 'Waiting for {name} to act.',
    nextPlayer: 'the next player',
    continue: 'Continue',
    resetTip: 'Clear the plan and start again',
    reset: 'reset',
    /** Between the server's reasons for refusing a turn. */
    errorsJoin: ' · ',
    loadout: 'Loadout · energy this turn',
    steps: {
      orientation: 'Orientation',
      move: 'Move · one per turn',
      systems: 'Systems',
      sequence: 'Sequence',
    },
    /** After the first thing standing in the way, when there are more. */
    moreIssues: ' · +{count} more',
    endTurn: 'End turn',
  },

  orientation: {
    tip: 'Flip facing: {energy} energy on the thrusters, {energy} heat at your check.',
    rotating: 'rotating',
    rotate: 'rotate',
    /** After the facing now, the facing the rotation leaves. */
    turnsTo: ' → {facing}',
  },

  move: {
    coast: 'Coast',
    coastTip: 'Ride the ring: you drift its velocity in sectors, and nothing heats up.',
    mooredTip:
      'Moored: you hold this berth and ride the station when it advances. Burn to cast off.',
    burn: 'Burn',
    burnTip: 'Change ring with the engines. Prograde burns outward, retrograde inward.',
    jump: 'Jump',
    jumpTip: 'Take the transfer lane to {well}.',
    moored:
      'The station carries you {drift} sectors at the end of the round, and holding the berth repairs nothing more: the dock happened on arrival.',
    drift: 'Drift',
    driftTip: 'Ride the ring and nothing more: no energy, no heat.',
    scoop: 'Scoop +{fuel} fuel',
    scoopBroken: 'No scoop: it is broken.',
    scoopTip:
      "Recover fuel equal to this ring's velocity ({fuel}). Puts {energy} energy on the scoop. A berth is as good a place to skim from as any.",
    intensityTip: '{rings} · {energy} energy on the engines · {fuel} fuel',
    burnCost: '{rings} · {energy} energy · {fuel} fuel',
    phase: 'phase {value}',
    jumpCost:
      'Engines at {energy}, {fuel} fuel{compressor}. Phasing never lands you outside the arrival arc.',
    compressor: " (the compressor pays {saved} of the jump's {fuel} fuel, never the phasing)",
  },

  routePlanner: {
    title: 'Route planner',
    plot: 'plot a route…',
    taken: 'step 1 taken',
    /** The destination's mark, the diamond the board draws it as. */
    mark: '◆',
    summary: ' · {turns} turns · {fuel} fuel',
    noRouteShort: ' · no route',
    station: '{planet} station',
    meet: 'meet it',
    meetTip: 'Arrive where the station will be. It advances {drift} sectors a round.',
    sector: 'S{sector}',
    sectorTip: 'Go to the sector it is on now. The station will have moved on.',
    picking: 'click a sector on the board',
    cancel: 'cancel',
    pickTip: 'The planner lays out the turns it takes and offers you the first.',
    pick: 'pick a destination',
    repickTip: 'Pick a different destination',
    repickLabel: 'pick a different destination',
    repick: 'change',
    clearTip: 'Forget this destination',
    clearLabel: 'forget this destination',
    arriveWith: 'arrive with',
    less: '−',
    lessTip: 'one less fuel on arrival',
    reserve: '{fuel} fuel',
    more: '+',
    moreTip: 'one more fuel on arrival',
    noRouteReserve: 'No route there within {turns} turns that arrives with {fuel} fuel.',
    noRoute: 'No route there within {turns} turns on the fuel aboard.',
    columns: { route: 'route', turns: 'turns', fuel: 'fuel' },
    itinerary: 'itinerary',
    rotateFirst: 'rotate first',
    hidden: { one: '+{count} more turn', many: '+{count} more turns' },
    arrive: 'arrive {place}',
    thisTurn: 'THIS TURN',
    stepTaken: "step 1 is this turn's move",
    takeTip:
      "Set this turn's move to the first turn of the route ({step}), the rotation and the cubes it needs included. Nothing else about the turn changes.",
    take: "take step 1 as this turn's move",
  },

  /**
   * A route read out loud (`utils/route.ts`), the same at the table, in the
   * route planner tool and on the board: a place, and each step of a route.
   */
  route: {
    place: '{well} R{ring} S{sector}',
    coast: 'coast',
    coastScoop: 'coast + scoop',
    jump: 'jump → {well}',
    burn: '{intensity} burn {direction}',
    intensities: { soft: 'soft', medium: 'medium', hard: 'hard' },
    /** A burn facing prograde climbs out; facing retrograde it drops in. */
    out: 'out',
    in: 'in',
    /** A burn or a jump phased by `{phase}` sectors ("+2"). */
    phased: '{leg} {phase}',
    rotateFirst: '{leg} (rotate first)',
    /** A route the engine gave no label. */
    unnamed: 'route {n}',
  },

  systems: {
    broken: 'Broken: it does nothing until repaired.',
    noMissiles: 'No missiles left: the magazine refills at a station.',
    backNoFire: 'Back from Home: nothing of yours fires on this turn.',
    openingNoFire: 'The first round reaches nobody: nothing fires.',
    mooredNoFire: 'Moored: a ship at a berth fires at nobody. Burn off the berth first.',
    empty: 'Nothing aboard fires, powers or scans.',
    quietBack:
      'Back from Home: this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody.',
    quietOpening: 'The first round reaches nobody: no weapon fires and nobody scans.',
    groups: { weapons: 'Weapons', defence: 'Defence', sensor: 'Sensor' },
    backNoScan: 'Back from Home: you scan nobody on this turn.',
    openingNoScan: 'The first round reaches nobody: nobody scans.',
    caption: {
      broken: 'broken',
      missiles: '{damage} dmg each · {ammo} left',
      pierces: '{damage} dmg · ignores shields',
      weapon: '{damage} dmg · {energy} energy',
      shieldsUp: 'absorbs {points} · {energy} energy',
      shields: 'absorbs {points} an energy ({plasma} of plasma)',
      rack: 'rolls at {count} missiles',
      sensor: 'crits {from}–{top} while up',
    },
    fire: {
      queuedTip: 'In the sequence below: pick the target there, or take it back with its ×.',
      queued: 'Firing',
      blocked: 'No shot: {reason}',
      tip: '{verb}: {damage} damage{pierces}. Puts {energy} energy on it, heat at your check{up}.',
      salvo: 'Launch a salvo',
      shot: 'Fire',
      pierces: ', ignores shields',
      up: ', and it is up until your next turn',
      label: 'Fire',
    },
    power: {
      firesTip:
        'It fires this turn and keeps that energy until your next turn, so it is up anyway: each subsystem does one thing a turn.',
      scansTip:
        'It scans this turn and keeps that energy until your next turn, so every shot after the scan has the wider critical range.',
      up: 'Up',
      off: 'Off',
      on: 'On',
      brokenTip: 'Broken: it takes no energy until repaired.',
      offTip: 'Leave it off: no energy, no heat.',
      onTip:
        'Power it at {energy}: {effect}, until your next turn. {energy} heat at your check, and powering does not turn it face-up.',
      label: 'Power {slot}',
    },
    scan: {
      queuedTip:
        'In the sequence below: pick the ship and the slot there, or take it back with its ×.',
      queued: 'Scanning',
      blocked: 'No scan: {reason}',
      tip: 'Scan a ship on your ring up to {range} sectors ahead, or in your sector, and look at one of their face-down subsystems. Puts {energy} energy on the sensor, up until your next turn.',
      label: 'Scan',
    },
  },

  repair: {
    label: 'Repair · one a turn, and only cold',
    hot: 'This turn makes heat. A repair needs no energy on any subsystem: a plain coast, no scoop, no shot, no scan, nothing powered.',
    tip: '{slot} · repaired at your heat check',
  },

  dock: {
    soldHere: 'At the dock · {station} buys nothing more from you',
    label: 'At the dock · load or sell one item',
    notSale: 'Not a sale',
    points: { one: '{points} point', many: '{points} points' },
    isDefault: ' · the default',
    chipPoints: ' · {points}',
    keepTip: 'Keep {station} for later',
    keep: 'Do nothing',
    sale: {
      load: { one: 'Load {count} crate', many: 'Load {count} crates' },
      fuel: 'Tanker fuel',
      loot: 'Piracy loot',
      deliver: 'Deliver crate to {planet}',
      crate: 'Crate',
      intercept: 'Intercept data',
      salvage: 'Salvage black box',
      survey: 'Survey data',
    },
  },

  seize: {
    label: 'Piracy · you may take {items}',
    items: { one: 'one item', many: '{count} items' },
    tip: "{when} Sell it at any station. {name}'s card goes back to undone.",
    chip: 'Take {item} from {name} · {when}',
  },

  survey: {
    label: 'Survey · you may take the data',
    tip: '{when} File it at any station.',
    chip: 'Take the data · {when}',
  },

  salvage: {
    label: 'Salvage · you may take a black box',
    killTip: 'Right after your shot. Nothing is taken if {name} survives. File it at any station.',
    kill: 'Salvage {name} · if it dies',
    wreckTip: '{when} File it at any station.',
    wreck: 'Salvage wreck {n} · {when}',
    theWreck: 'Salvage the wreck · {when}',
  },

  mark: {
    label: 'Escort · you may place {markers}',
    markers: { one: 'your marker', many: '{count} markers' },
    tip: '{when} Done the next time {name} sells or pumps fuel with you in its well; back to you if either ship is destroyed first.',
    chip: 'Mark {name} · {when}',
  },

  sequence: {
    power: '{n}. Power {slot} at {energy}',
    powerNote: 'first, and it works until your next turn',
    step: '{n}. {title}',
    from: 'from {place} · {facing}',
    title: {
      rotate: 'Rotate',
      coastScoop: 'Coast, scoop fuel',
      coast: 'Coast',
      burn: '{intensity} burn{phase}',
      burnPhase: ', phase {value}',
      jump: 'Jump to {well}',
      fire: 'Fire {slot}{count}{target}',
      fireCount: ' ×{count}',
      fireTarget: ' at {name}',
      scan: 'Scan{target}',
      scanTarget: ' {name}',
      seize: 'Seize {item} from {name}',
      cargo: 'cargo',
      survey: 'Survey: take the data',
      salvageKill: "Salvage {name}'s wreck, if it dies",
      salvage: 'Salvage the wreck',
      mark: 'Mark {name}',
    },
    fire: {
      nothingInRange: 'nothing in range',
      pickTarget: 'pick a target',
      tooFar: ' · too far to catch',
      countTip: 'How many rounds go up in this one launch, all at that ship and that slot.',
      count: '×{count}',
      beforeTip: 'Nobody is in range after your move, but someone is from where it starts.',
      before: 'Fire before the move',
      wasted:
        'This one runs out of fuel before it catches them: {moves} moves of {steps} steps, and they keep drifting.',
      crit: {
        launchSensed:
          'Your sensor has energy on it by this launch: a missile that lands now criticals on {from}–{top}. One still flying rolls on a later turn, with the sensor you have up then.',
        launchSensor:
          'Criticals on {base}. Power the sensor, or scan before this launch, and a missile that lands now is {sensor}–{top}.',
        shotSensed:
          'Your sensor has energy on it by this shot (powered, or it scanned earlier in the turn): criticals on {from}–{top}.',
        shotSensor:
          'Criticals on {base}. Power the sensor, or scan before this shot, and it is {sensor}–{top}.',
        bare: 'Criticals on {base}.',
      },
      critRange: 'crit {from}–{top}',
      critBare: 'crit {from}',
      critTargetTip: 'Name the slot a critical hit would break: click it on their loadout',
      critTarget: 'crit: {slot}',
      recoilTip: 'Absorb the recoil: {fuel} fuel and engine heat, and no burn this turn.',
      recoil: 'compensate recoil',
    },
    scan: {
      allKnown:
        'You already know every subsystem on that loadout. The scan still takes their transmission.',
      known:
        'You already know that subsystem: the scan will look at the first face-down one instead.',
      nobody: 'nobody up to {range} sectors ahead',
      pickTarget: 'pick a target',
      peekTip: 'Choose which face-down subsystem to look at: click it on their loadout',
      peek: 'peek: {slot}',
      peekChoose: 'peek: choose a slot',
    },
    seizeAfterShot:
      'A shot before this one is at the same ship: if it destroys them, there is nothing left to take. Move this step up to take the item first.',
    markAfterShot:
      'A shot before this one is at the same ship: if it destroys them, the marker stays in your hand. Move this step up to mark them first.',
  },

  /**
   * A step still missing a choice. Everything the engine would refuse it says
   * in its own words (`engine/src/text/refusals.ts`).
   */
  issues: {
    pickTarget: '{slot}: pick a target',
    scanPick: 'Scan: pick a target on your ring, up to {range} sectors ahead',
    scanPeek: 'Scan: choose which subsystem to look at',
  },
} as const
