/**
 * Every word on the screens around a game (`components/screens/`), screen by
 * screen in the order a player meets them: the lobby list, the lobby, the
 * shipyard, deployment, the end of the game, then the recordings and their
 * replay.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine or the game being
 * shown: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name. A word that only joins a list (" and ") is
 * kept here too, so a list reads the way the sentence around it does.
 */

export const SCREENS = {
  lobbyBrowser: {
    title: 'Dangerous Inclinations',
    lede: 'Orbital manoeuvre, heat management and hidden objectives for {min}–{max} players.',
    panel: 'Tables',
    rename: 'Change your name',
    recordings: 'Watch a recorded game',
    refresh: 'Refresh',
    newTable: 'New table',
    sittingAs: 'Sitting as {name}',
    empty: 'No tables yet. Make one and add a bot or two.',
    seats: '{current}/{max} seats',
    rejoin: 'Rejoin',
    inPlay: 'in play',
    sitDown: 'Sit down',
    /** A table's name when its maker leaves the field empty. */
    defaultTableName: "{name}'s table",
    unreachable: 'Could not reach the server',
    createFailed: 'Could not create the table',
    joinFailed: 'Could not sit down at that table',
    create: {
      title: 'New table',
      name: 'Table name',
      players: '{count} players',
      password: 'Password (optional)',
      cancel: 'Cancel',
      create: 'Create',
    },
    join: {
      title: 'Join {name}',
      password: 'Password',
      cancel: 'Cancel',
      sitDown: 'Sit down',
    },
    name: {
      title: 'Your name',
      cancel: 'Cancel',
      save: 'Save',
    },
  },

  lobby: {
    finding: 'Finding the table…',
    seats: 'Seats',
    emptySeat: 'empty seat',
    you: ' (you)',
    host: ' · host',
    removeBot: 'Remove this bot',
    addBot: 'Seat a bot here',
    leave: 'Leave',
    /** The start button's tooltip when nothing stops the deal. */
    startHint: 'Deal the missions and begin',
    start: 'Start',
  },

  shipyard: {
    spectator: 'You are watching this table; there is no ship to fit out.',
    title: 'Shipyard',
    tableTalk: 'Table talk',
    aside: 'Vessel configuration',
    tabs: {
      label: 'Ship configuration',
      missions: 'Missions',
      systems: 'Systems',
      appearance: 'Appearance',
    },
    primary: {
      title: 'Primary mission',
      hint: 'Worth {points} of the {toWin} points to win. Fit a ship that can fly it.',
    },
    secondary: {
      title: 'Secondary missions',
      hint: 'Worth {points} each, any two, two of a kind included: the second is your spare.',
    },
    waitingForDeal: 'Waiting for the mission deal…',
    /** One card the loadout cannot fly, "Destroy Ana needs a weapon.". */
    needs: '{mission} needs {requirements}.',
    and: ' and ',
    stats: {
      dissipation: 'Dissipation',
      perTurn: '{value}/turn',
      fuel: 'Reaction mass',
      systems: 'Systems',
    },
    storage: 'Browser storage is unavailable. Keep this page open until you submit.',
    /** What still stands between the draft and the Ready button, first one first. */
    blocked: {
      primary: 'Take one primary mission.',
      secondaries: 'Take {count} of your own, {left} to go.',
      /** `{parts}` is the subsystems missing, each a `part`, joined by `and`. */
      fit: 'Fit {parts}, or take a different primary mission.',
      part: 'a {label}',
    },
    submitted: 'Ship submitted. Waiting for the other players.',
    ready: 'All systems fitted. Missions ready.',
    saved: 'Your design is saved with this game.',
    counts: '{filled}/{slots} systems · {missions}/{maxMissions} missions · Appearance is cosmetic',
    submit: 'Ready',
    saving: 'Saving…',
    closeTalk: 'Close table talk',
    /** What each module does, said once when it is chosen and on its tile. */
    notes: {
      railgun: 'Bow gun, {damage} damage up to {range} sectors ahead. For Sir Isaac Newton fans.',
      sensor_array:
        'Scans a rival subsystem on your ring up to {range} sectors ahead; crits on {crit}+. We know what you did. From really far away.',
      missiles: 'Salvo any number at one ship in the well; {ammo} aboard. {ammo} times the fun.',
      laser:
        'Side gun, {damage} damage, ignores shields. Warning: do not point at cats. Or people in ships.',
      shields:
        "Absorbs {points} damage a cube, {plasma} of plasma, never lasers, and every point absorbed is heat; powered at all, it stops a disruptor. For people who don't like to be touched.",
      radiator:
        'Passive: +{dissipation} heat dissipation at every check. Keep away from direct sunlight.',
      fuel_compressor:
        'Passive: a jump costs {compressed} fuel instead of {fuel}. The cheapest way to go on vacation.',
      ballistic_rack:
        '{damage} damage close in; powered, it rolls at up to {intercepts} incoming missiles a turn, for {heat} heat. Definitely passive-aggressive.',
      plasma_cannon:
        'Side gun, {damage} damage within {rings} ring and {sectors} sector, one side; shields stop it {plasma} points a cube. Hot stuff.',
      disruptor:
        "Either slot, {energy} cubes, the rack's reach, no damage: a hit breaks the subsystem you name, unless any shield is powered. Have you tried turning it off and on again?",
    },
    /** The Systems tab (`ships/ShipControls.tsx`): role and preset, the mounts, the refit. */
    systems: {
      profile: '01 / Mission profile (presets)',
      role: 'Role',
      preset: 'Preset',
      /** The role is the plan you came with: one for each two-point card. */
      roles: { hunter: 'Hunter', interceptor: 'Interceptor', hauler: 'Hauler' },
      /** What each preset carries, what it is for, and the card that asks for it. */
      presets: {
        gunship: 'Railgun, laser and rack: shots through shields, and point defence',
        lancer: 'Railgun, two plasma and a laser, no shields: run a carrier down, for Piracy',
        corsair: 'Missile bow and three lasers, no shields: finish wrecks from range, for Salvage',
        warden: 'Disruptor bow and two plasma: strip a wall, break what is behind, for Escort',
        raider: 'Shields, disruptor and plasma: strip a wall, then break what is behind it',
        watcher: 'Two shields and a laser: keep the data you scanned, for Survey',
        picket: 'Two launchers and shields: hits from across the well, for Salvage',
        sentry: 'Laser, rack and shields: ride beside a carrier, for Escort',
        freighter: 'Two shields and a laser: the safe cargo run',
        convoy: 'Two racks and shields: point defence, for Piracy or Escort',
        smuggler: 'Two launchers and shields: hits from across the well, for Salvage',
        ghost: 'Disruptor, laser and plasma, no shields: break a pursuer, for Tanker',
      },
      ownLoadout: 'Loadout of your own: pick a preset to start from, or leave it.',
      mounts: '02 / Attachment points',
      /** A mount's button for a screen reader: "Bow: Railgun". */
      mountAria: '{mount}: {module}',
      emptyMount: 'Empty mount',
      refit: 'Refit {mount}',
      remove: 'Remove module',
      fit: 'Fit {module}',
      choose: 'Choose a compatible system for this mount.',
      passive: 'Passive · no energy required',
      energy: 'Energy {min}–{max} · its cubes are heat at every check',
      builtIn: 'Built into every hull: main drive, maneuvering thrusters, and fuel scoop.',
    },
    /** The Appearance tab: hull, paint and livery. */
    appearance: {
      hull: '01 / Hull',
      hullNote: 'Every hull carries the same five mounts and flies the same.',
      hullGroup: 'Hull',
      paint: '02 / Paint',
      hullPaint: 'Hull',
      trimPaint: 'Trim and panels',
      /** A swatch for a screen reader: "Hull: #d6cfbd". */
      swatch: '{label}: {paint}',
      anyColour: '{label}: any colour',
      livery: '03 / Livery',
      liveryNote: "Sprayed in your seat's colour, the same as your token on the board.",
      liveryGroup: 'Livery',
      liveries: {
        band: 'Band',
        split: 'Split',
        chevron: 'Chevron',
        stern: 'Stern',
        spine: 'Spine',
      },
      reset: 'Reset appearance',
    },
  },

  deployment: {
    spectator: 'Watching the table: no ship to place.',
    title: 'Place your ship',
    subtitle:
      '{placed} of {seats} placed · Black Hole Ring {rings}, {gap}+ sectors from every ship already placed',
    ring: {
      title: 'Ring and sector',
      rule: 'Black Hole Ring {rings}, at least {gap} sectors from every ship already placed. That position becomes your Home.',
      chip: 'Ring {ring} · drifts {drift}',
      /** A sector cell that is not legal. */
      tooClose: 'closer than {gap} sectors to a placed ship',
    },
    order: {
      title: 'Turn order · last seat places first',
      you: ' (you)',
      placing: 'placing',
      waiting: 'waiting',
    },
    missions: {
      title: 'Your missions',
      hint: 'They should decide which ring and sector Home goes in.',
    },
    placed: 'Your ship is placed. Waiting for the others.',
    waitingFor: 'Waiting for {name} to place.',
    nextPlayer: 'the next player',
    yourTurn:
      'Place your ship on Black Hole Ring {rings}, at least {gap} sectors from every ship already placed. That position becomes your Home.',
  },

  gameEnd: {
    wins: '{name} wins',
    over: 'The game is over',
    score: '{points} of {toWin} points.',
    noWinner: 'No winner was declared.',
    you: ' (you)',
    standing: '{points} / {toWin} points · hull {hull}/{maxHull}',
    nothing: 'Nothing completed.',
    back: 'Back to the lobby',
  },

  recordings: {
    title: 'Watch a finished game',
    panel: 'Games played to the end',
    back: 'Back',
    loading: 'Looking through the shelf…',
    empty: 'Nothing recorded yet. Play a game to the end, or run the simulator.',
    /** A row's tooltip. */
    open: 'Watch this game back, from any seat',
    simulated: 'Simulated game',
    table: 'Table game',
    turn: '{count} turn',
    turns: '{count} turns',
    won: '{turns} · won',
    unfinished: '{turns} · unfinished',
  },

  replay: {
    failed: 'Failed to load recording: {error}',
    back: 'Back',
    loading: 'Loading recording…',
  },

  /** The transport under a recording. */
  recordingTable: {
    seat: 'seat',
    spectator: 'Spectator (public only)',
    start: 'Back to the start',
    previous: 'Previous turn',
    pause: 'Pause',
    play: 'Play',
    next: 'Next turn',
    end: 'Jump to the end',
    beforeFirst: 'Before the first turn',
    step: 'Step {step} of {steps} · turn {turn}',
    /** A recorded step whose turn number is missing. */
    unknownTurn: '?',
    speed: '{ms}ms',
  },
} as const
