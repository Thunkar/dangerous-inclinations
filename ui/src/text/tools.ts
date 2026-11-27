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
    blurb: 'Each tool does the arithmetic of a turn with the engine that runs the video game.',
  },
  /** The tabs over a tool, read aloud. */
  tabs: 'Tools',
  /** On a phone, the line a tool's blurb folds under. */
  howItWorks: 'How it works',

  route: {
    title: 'Route planner',
    blurb:
      'The game’s own board: set where the ship is and where it is going, on the board or by number, and the engine lays out the turns, the burns, the phasing and the lane. Under it, the orbital windows say when to set off.',
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
    stationsAt: 'Station centres now at (ring {ring}, sector)',
    stationsMove:
      'A station covers its centre and {reach} sector either side. All of them move {drift} sectors a round, together. The route meets the station where it will be, on whichever of its sectors comes first.',
    /** The ship's plate folded to one line: "Black Hole R3 S0 · prograde · 10 fuel". */
    shipSummary: '{place} · {facing} · {fuel} fuel',
    tapSets: 'A tap sets',
    theShip: 'The ship',
    tapStation: 'Tap a station to head for it.',
    /** On a phone, the notes under the route fold under this line. */
    notes: 'How to read the route',
    /** The ship on the board, named as a player would be. */
    shipName: 'your ship',
    theRoute: 'The route',
    /** "Black Hole R3 S0 → Alpha station (docks on S11)". */
    fromTo: '{from} → {to}',
    /** On a phone, where the ship sits in the plate above. */
    onlyTo: '→ {to}',
    onArrival: ' (docks on S{sector})',
    station: '{planet} station',
    alreadyThere: 'The ship is already there.',
    noRoute: 'No route there within {turns} turns on {fuel} fuel.',
    noRouteKeeping: 'No route there within {turns} turns on {fuel} fuel that arrives with {keep}.',
    /** One alternative: "Fastest · 4 turns · 3 fuel". */
    alternative: '{name} · {turns} turns · {fuel} fuel',
    /** On a phone, an alternative's tab: its name, then this under it. */
    alternativeCosts: '{turns} turns · {fuel} fuel',
    /** Before a turn's move, in red. */
    rotate: 'rotate, ',
    legsNote:
      'One line per turn, first turn in black. The figure on the right is the fuel it spends or the scoop brings in. Done moves the ship and the stations on one turn.',
    /** Pressed when the first step is made at the table. */
    done: 'Done',
    undo: 'Undo',
    /** The route kept after a Done: "Following the fastest route, 3 turns left." */
    following: 'Following the {name} route, {turns} turns left. Change any setting to plan again.',
    arrived: 'The ship has arrived: {to}.',
  },

  heat: {
    title: 'Heat check',
    blurb:
      'Your loadout on a mat: each press on a subsystem powers it a step. The check bills the hull for anything over {maxHeat}, dissipates and carries the rest.',
    tap: 'A tap on a subsystem',
    powers: 'Powers it',
    breaks: 'Breaks or fixes it',
    powersNote:
      'With a mouse, right click takes a step off. On a phone, tap past the top to clear it.',
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
    fold: 'fold',
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
