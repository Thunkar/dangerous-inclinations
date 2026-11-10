/**
 * Every word on the table tools (`/tools`, `site/Tools.tsx` and
 * `site/tools/`), top to bottom: the index and the tabs, then the route
 * planner, the heat check and the dice, and last the words the shared
 * controls read aloud. The orbital windows under the route planner keep
 * their own file (`text/windows.ts`).
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine: the words around
 * a slot are free to change, and a slot may move or be dropped but keeps its
 * name.
 */

export const TOOLS = {
  kicker: 'Table tools',
  index: {
    title: 'The sums, done for you',
    blurb:
      'For a game at a real table. Each tool does the arithmetic of a turn with the engine that runs the video game.',
  },
  /** The tabs over a tool, read aloud. */
  tabs: 'Tools',

  route: {
    title: 'Route planner',
    blurb:
      'The game’s own board: click where the ship is, click where it is going, and the engine lays out the turns, the burns, the phasing and the lane; under it, the orbital windows say when to set off.',
    ship: 'Your ship',
    body: 'Body',
    blackHole: 'Black hole',
    ring: 'Ring',
    sector: 'Sector',
    /** The sector stepper, read aloud: "ship sector", "destination sector". */
    sectorOf: '{place} sector',
    shipPlace: 'ship',
    destinationPlace: 'destination',
    facing: 'Facing',
    prograde: 'Prograde',
    retrograde: 'Retrograde',
    fuel: 'Fuel',
    fuelAloud: 'fuel',
    arriveWith: 'Arrive with',
    arriveWithAloud: 'fuel left on arrival',
    compressor: 'Compressor',
    whereTo: 'Where to',
    aStation: 'A station',
    aSector: 'A sector',
    planet: 'Planet',
    stationsAt: 'Stations now at (ring {ring}, sector)',
    stationsMove:
      'Every station moves {drift} sectors a round, together, so these are the only sectors one can be on; the route meets it where it will be.',
    clickSets: 'A click on the board sets',
    theShip: 'The ship',
    clickStation: 'Click a station to head for it.',
    /** The ship on the board, named as a player would be. */
    shipName: 'your ship',
    theRoute: 'The route',
    /** "B3 S0 → Alpha station (S12 on arrival)". */
    fromTo: '{from} → {to}',
    onArrival: ' (S{sector} on arrival)',
    station: '{planet} station',
    alreadyThere: 'The ship is already there.',
    noRoute: 'No route there within {turns} turns on {fuel} fuel.',
    noRouteKeeping: 'No route there within {turns} turns on {fuel} fuel that arrives with {keep}.',
    /** One alternative: "Fastest · 4 turns · 3 fuel". */
    alternative: '{name} · {turns} turns · {fuel} fuel',
    /** Before a turn's move, in red. */
    rotate: 'rotate, ',
    legsNote:
      'One line per turn, first turn in black. The figure on the right is the fuel it spends or the scoop brings in.',
  },

  heat: {
    title: 'Heat check',
    blurb:
      'Your loadout on a mat: click a subsystem to power it, right click to take it off. The check bills the hull for anything over {maxHeat}, dissipates and carries the rest.',
    tap: 'A tap on a subsystem',
    powers: 'Powers it',
    breaks: 'Breaks or fixes it',
    powersNote: 'Right click takes a step off. On a phone, tap past the top to clear it.',
    breaksNote: 'A break dumps its energy onto the heat track.',

    /** A slot's card: the slot's name, the subsystem, what its energy is for. */
    fixed: 'Fixed',
    /** "Port fore: Laser, 2 energy", read aloud. */
    slotAloud: '{slot}: {name}, {state}',
    brokenAloud: 'broken',
    energyAloud: '{energy} energy',
    off: 'off',
    /** An engines energy level, one use per burn it pays for: "medium burn, jump". */
    burn: '{burn} burn',
    jump: 'jump',
    rotate: 'rotate',
    scoop: 'scoop',
    absorbs: 'absorbs {points}',
    salvo: 'salvo',
    scan: 'scan, crits {crit}+',
    rack: 'fire, intercept',
    fire: 'fire',
    radiator: '+{dissipation} dissipate',
    compressor: 'jump: {fuel} fuel',
    broken: 'Broken',
    /** The slot's subsystem picker, read aloud. */
    chooseAloud: '{slot} subsystem',

    /** The bar under the mat. */
    checkedOnTrack: 'Checked: on the track',
    staysOn: 'Energy stays on until your turn',
    energy: 'Energy',
    atCheck: 'At the check',
    hull: 'Hull',
    nextTurn: 'Next turn',

    track: 'The heat track',
    trackAloud: 'heat on the track',
    absorbPoint: 'Shields absorb {points}',
    absorbPlasma: 'Shields absorb plasma',
    rackAnswers: 'Rack answers missiles',
    turnEnds: 'Their turn ends',
    /** The energy that comes back to the shields when that turn ends. */
    back: '{energy} back',
    shieldsRule:
      "A hit on your shields: each energy stops {points} damage ({plasma} of plasma) and is set aside until that player's turn ends, and every point stopped goes on the track. A rack that rolls at missiles puts {interceptHeat} on the track, once a turn however many.",

    check: 'The check',
    /** The check's ledger, line by line. */
    onTrack: 'on the track',
    onSubsystems: 'energy on your subsystems',
    total: 'at the check',
    coldRepair: 'cold: repair one broken subsystem',
    cold: 'cold',
    overTop: 'hull: everything over {maxHeat}',
    stopsAtTop: 'the track stops at the top',
    dissipate: 'dissipate',
    dissipateWith: 'dissipate ({radiators})',
    oneRadiator: '{count} radiator',
    radiators: '{count} radiators',
    intoNextTurn: 'into your next turn',

    startTurn: 'Start my turn',
    runCheck: 'Heat check',
    reset: 'Reset',
    clearsNote: 'Your turn clears the loadout: every subsystem back to off.',
    staysNote:
      'The check leaves your energy on: shields and racks stay up through the other turns.',
  },

  dice: {
    title: 'Dice',
    blurb:
      'A d10, or a fistful of them for a salvo and the rack that answers it, read for hits and criticals.',
    dice: 'Dice',
    diceAloud: 'dice',
    sensor: 'Sensor powered',
    rollAloud: 'Roll {count} d10',
    roll: 'Roll',
    crits: '{count} crit',
    hits: '{count} hit',
    misses: '{count} miss',
    /** Which faces do what: "1–2 miss · 3–8 hit · 9–10 crit · …". */
    faces:
      '{missTop} miss · {hitFrom}–{hitTo} hit · {crit} crit · a rack downs a missile on {intercept}+',
    /** The crit faces when they are more than the top one. */
    range: '{from}–{to}',
  },

  /** A stepper's buttons, read aloud: "increase fuel". */
  controls: {
    decrease: 'decrease',
    increase: 'increase',
    step: '{verb} {what}',
  },
} as const
