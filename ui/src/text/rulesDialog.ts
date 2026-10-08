/**
 * Every word in the in-game rules dialog (`components/table/RulesDialog.tsx`),
 * top to bottom: the button, the quick reference rows in order, then the
 * headed sections under them. The turn's steps are in `turn.ts`.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name. A row can be added,
 * removed or moved freely as long as it only uses the slots listed on
 * `quick`. `<red>` is set in red and `<link>` is the link.
 */

export const RULES_DIALOG = {
  /** The button in the top bar, and the tooltip over it. */
  button: 'Rules',
  tooltip: 'Quick reference',
  title: 'Quick reference',

  /**
   * The quick reference, one row a line: the label, then the rule. The
   * slots every row may use: halfShield, fullShield, rackEnergy,
   * sensorEnergy, maxHeat, dissipation, radiator, shieldPoints, plasmaPoints,
   * intercepts, interceptHeat, hull, fuel, sectors, soft, medium, hard, mostPhase,
   * jumpEnergy, jumpFuel, compressedFuel, miss, hitFrom, hitTo, crit,
   * sensorCrit, salvoEnergy, scanRange, tankerFuel, homeRings, deploymentGap,
   * primaryOffers, primaries, secondaryOffers, secondaries, handPoints,
   * pointsToWin.
   */
  quick: [
    [
      'Energy',
      'every action puts energy on the subsystem it uses; it stays there until your next turn, when you clear your loadout',
    ],
    [
      'Power',
      'an action too: shields ({halfShield} or {fullShield}), a ballistic rack ({rackEnergy}) or a sensor array ({sensorEnergy}) work until your next turn. Each subsystem does one thing a turn: power it or use it',
    ],
    ['Heat', 'every point of energy on your loadout is 1 heat at your check'],
    ['Heat track', '{maxHeat} · above it is hull damage; heat does not reset'],
    ['Dissipation', 'dissipate {dissipation} (+{radiator} per radiator) at every check'],
    [
      'Shields',
      'power at {halfShield} or {fullShield}; each energy absorbs {shieldPoints} damage ({plasmaPoints} of plasma) and comes off; every point absorbed is heat on your track, paid at your next check; power them every turn you want them up; lasers ignore them; any powered shield stops a disruptor whole',
    ],
    [
      'Ballistic rack',
      'with energy on it (powered, or it fired) it rolls at {intercepts} missiles a turn, the same number its energy could have thrown; answering puts {interceptHeat} heat on your track, however many it rolls at',
    ],
    [
      'Critical',
      "names any slot; breaks it through shields, and dumps its energy as heat (a subsystem holds its energy until its owner's next turn)",
    ],
    ['Repair', 'a station, on arrival, fixes everything; or one subsystem a turn at 0 heat'],
    ['Hull', '{hull}'],
    ['Fuel', '{fuel}'],
    ['Sectors per ring', '{sectors}'],
    ['Burn', 'soft {soft} / medium {medium} / hard {hard} rings · same in fuel and engine energy'],
    ['Phasing', '−(velocity−1) to +{mostPhase} sectors, 1 fuel each'],
    [
      'Jump',
      'facing prograde, engines {jumpEnergy}, {jumpFuel} fuel ({compressedFuel} with a compressor), no drift',
    ],
    ['Hit roll', '{miss} miss, {hitFrom}–{hitTo} hit, {crit} crit ({sensorCrit}–10 with sensors)'],
    [
      'Salvo',
      "one action launches any number of a subsystem's missiles at one ship, all naming the same slot, for the subsystem's {salvoEnergy} energy once, and they fly at once; a rack with energy on it rolls at {intercepts} of them a turn, so it takes a second rack to answer a second launcher",
    ],
    [
      'Scan',
      'same ring, within {scanRange} sectors, sensor aboard and unbroken; the scan puts {sensorEnergy} energy on it, so every shot after it has the wider range',
    ],
    [
      'Docking',
      'on arrival only, after the heat check: full hull, repair all, reload missiles, and one thing: load the crates waiting for you, or sell one item (a crate, data, loot or the Tanker fuel). Each station buys from you once per game. You choose; by default the sale worth the most points, else the load. You stay moored until you burn away',
    ],
    [
      'Berth',
      'moored from the moment you dock until you leave the sector, so on the turn you arrive you may still fire after the move; a moored ship neither fires nor is fired at, missiles included; scans still reach it',
    ],
    [
      'Wrecks',
      'left where a ship dies, drift with the stations; salvage is an action: on a wreck\'s sector, take its black box (data)',
    ],
    [
      'Survey',
      'survey is an action in your sequence: while on Black Hole Ring 1, take the data. File it at any station',
    ],
    [
      'Piracy',
      'seize is an action in your sequence: while you share a sector with an undocked ship carrying cargo, and you are not moored, you may take one item of your choice. Seize before you fire at it. Sell it at any station. Their card goes back to undone',
    ],
    [
      'Tanker',
      'arrive at a station with {tankerFuel} or more fuel and pump {tankerFuel} in as your sale there: the card is done',
    ],
    [
      'Escort',
      'mark is an action in your sequence: while on the same ring as an undocked rival carrying cargo, and not moored, you may put your marker on it (a ship carries one marker). Mark before you fire at it. Done the next time that ship delivers, sells or files anything, or pumps fuel, with you in its well; your marker comes back if either ship is destroyed first',
    ],
    [
      'Salvage',
      'salvage is an action in your sequence: while on a wreck\'s sector (moored or not), take its black box, one wreck a turn. A ship destroyed earlier in your turn has already left its wreck. It is data, filed at any station',
    ],
    [
      'Deployment',
      'Black Hole Ring {homeRings}, at least {deploymentGap} sectors from every ship already placed (if no sector qualifies, the farthest one); that position is your Home',
    ],
    [
      'Missions',
      'Primaries (2 pts): Destroy · Deliver · Intercept. Secondaries (1 pt): Survey · Piracy · Tanker · Escort · Salvage',
    ],
    [
      'Keeping cards',
      '{primaryOffers} primaries keep {primaries}, {secondaryOffers} secondaries keep any {secondaries}, rest to a shared discard; Intercept needs a sensor array, Destroy needs a weapon that deals damage (not a disruptor alone)',
    ],
    [
      'Hand',
      '{primaries} primary of {primaryOffers} dealt, {secondaries} of {secondaryOffers} secondaries dealt. {handPoints} points held, {pointsToWin} win: the primary and either secondary',
    ],
    [
      'Win',
      '{pointsToWin} points trigger the final round; when it ends, highest score wins (hull, then fuel, then the earlier seat, break ties). Your primary and either secondary is a win; two secondaries are not',
    ],
  ],

  turn: {
    title: 'Turn cheat sheet',
    /** A step's name, set in bold before its blurb. */
    step: '{title}.',
  },

  rings: {
    title: 'Ring velocity',
    blackHole: 'Black Hole',
    planets: 'Planets',
    windows:
      'When to set off for a station, read off the station clock: <link>orbital windows</link>.',
  },

  hidden: {
    title: 'Hidden information',
    /** Three paragraphs, one line apart. */
    public:
      'Public: positions, facing, hull, heat, fuel, the energy on every slot, Home markers, cargo counts, face-up subsystems and the missiles left in a face-up missiles subsystem, completed missions, wrecks and Escort markers.',
    private:
      'Private: what a face-down subsystem is, the ammo in a face-down missiles subsystem, missions in hand, where your cargo is going.',
    tell: '<red>Energy is the tell.</red> Using a subsystem turns it face-up, so energy on a face-down slot between turns means it was powered, not used: {halfShield} can only be a half shield, and {fullShield} is a full shield, a ballistic rack or a sensor array. That is a deduction, not a reveal: the subsystem stays face-down and only a scan makes sure. A gun is dark until it fires, which is why a silent slot is the dangerous one.',
  },

  reveals: {
    title: 'Reveals',
    text: 'A subsystem flips face-up the first time it does something: a weapon fires (or a ballistic rack rolls at a missile), and a missiles subsystem then shows what is left; shields absorb damage or stop a disruptor; a sensor array scans; a radiator when your heat goes above {dissipation} at a heat check; a compressor when a jump costs {compressedFuel} fuel instead of {jumpFuel}; any subsystem when a critical breaks it. Powering a subsystem does not turn it over: a wall you never needed, a rack nothing came at and a sensor you never scanned with are still secrets at the end of the game.',
  },
} as const
