/**
 * Every word in the in-game rules dialog (`components/table/RulesDialog.tsx`),
 * top to bottom: the button, the quick reference rows in order, then the
 * headed sections under them. The turn's steps are in `turn.ts`.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name. A row can be added,
 * removed or moved freely as long as it only uses the slots listed on
 * `quick`. `<red>` is set in red, `<link>` is the link, and `{_}` is a space
 * set as a run of its own, which keeps the dialog drawing exactly as it did
 * (a plain space reads the same).
 */

export const RULES_DIALOG = {
  /** The button in the top bar, and the tooltip over it. */
  button: 'Rules',
  tooltip: 'Quick reference',
  title: 'Quick reference',

  /**
   * The quick reference, one row a line: the label, then the rule. The
   * slots every row may use: halfShield, fullShield, rackEnergy,
   * sensorEnergy, maxHeat, dissipation, radiator, shieldEnergy, shieldHeat,
   * intercepts, hull, fuel, sectors, soft, medium, hard, mostPhase,
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
      'power at {halfShield} or {fullShield}; {shieldEnergy} energy a point absorbed, {shieldHeat} heat a point; power them every turn you want them up; lasers ignore them',
    ],
    [
      'Ballistic rack',
      'with energy on it (powered, or it fired) it rolls at {intercepts} missiles a turn, the same number its energy could have thrown',
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
      'engines {jumpEnergy}, {jumpFuel} fuel ({compressedFuel} with a compressor), no drift',
    ],
    ['Hit roll', '{miss} miss, {hitFrom}–{hitTo} hit, {crit} crit ({sensorCrit}–10 with sensors)'],
    [
      'Salvo',
      "one action launches any number of a subsystem's missiles at one ship, all naming the same slot, for the subsystem's {salvoEnergy} energy once; a rack with energy on it rolls at {intercepts} of them a turn, so it takes a second rack to answer a second launcher",
    ],
    [
      'Scan',
      'same ring, within {scanRange} sectors, sensor aboard and unbroken; the scan puts {sensorEnergy} energy on it, so every shot after it has the wider range',
    ],
    [
      'Docking',
      'on arrival only: full hull, repair all, reload missiles, and one job: your crates (deliver, then load), your data (file it all) or your fuel. You choose; by default the job worth the most points, ties to crates, then data. You stay moored until you burn away',
    ],
    [
      'Berth',
      'a moored ship neither fires nor is fired at, missiles included; scans still reach it',
    ],
    [
      'Wrecks',
      'left where a ship dies, drift with the stations; a Salvage takes the black box (data)',
    ],
    ['Survey', 'end a turn on Black Hole Ring 1 (take the data) then dock at any station'],
    [
      'Piracy',
      'end a turn in the same sector as an undocked ship carrying a crate or data, with your hold empty: it is yours. The loot fills your hold and sells at any station, and their card goes back to undone',
    ],
    [
      'Tanker',
      "arrive at a station with {tankerFuel} or more fuel and make the fuel that visit's job: pump it in and the card is done",
    ],
    [
      'Escort',
      'end a turn, not moored, in the same sector as an undocked rival carrying a crate or data, and you may put your marker on it (a ship carries one marker). Done the next time that ship delivers, sells or files anything, or pumps fuel; the marker comes back if it is destroyed first',
    ],
    [
      'Salvage',
      'end a turn on a wreck (moored or not) and take its black box: data, filed at any station',
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
      '{primaryOffers} primaries keep {primaries}, {secondaryOffers} secondaries keep any {secondaries}, rest to a shared discard; Intercept needs a sensor array, Destroy needs a weapon',
    ],
    [
      'Hand',
      '{primaries} primary of {primaryOffers} dealt, {secondaries} of {secondaryOffers} secondaries dealt. {handPoints} points held, {pointsToWin} win: the primary and either secondary',
    ],
    [
      'Win',
      '{pointsToWin} points trigger the final round; when it ends, highest score wins (hull, then fuel, break ties). Your primary and either secondary is a win; two secondaries are not',
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
      'When to set off for a station, read off the station clock:{_}<link>orbital windows</link>.',
  },

  hidden: {
    title: 'Hidden information',
    /** Three paragraphs, one line apart. */
    public:
      'Public: positions, facing, hull, heat, fuel, the energy on every slot, Home markers, cargo counts, face-up subsystems and the missiles left in a face-up missiles subsystem, completed missions, wrecks and Escort markers.',
    private:
      'Private: what a face-down subsystem is, the ammo in a face-down missiles subsystem, missions in hand, where your cargo is going.',
    tell: '<red>Energy is the tell.</red>{_}Using a subsystem turns it face-up, so energy on a face-down slot between turns means it was powered, not used: {halfShield} is a half shield, a ballistic rack or a sensor array, and{_}{fullShield} can only be a full shield. That is a deduction, not a reveal: the subsystem stays face-down and only a scan makes sure. A gun is dark until it fires, which is why a silent slot is the dangerous one.',
  },

  reveals: {
    title: 'Reveals',
    text: 'A subsystem flips face-up the first time it does something: a weapon fires (or a ballistic rack rolls at a missile), and a missiles subsystem then shows what is left; shields absorb damage; a sensor array scans; a radiator when your heat goes above {dissipation} at a heat check; a compressor when a jump costs {compressedFuel} fuel instead of{_}{jumpFuel}; any subsystem when a critical breaks it. Powering a subsystem does not turn it over: a wall you never needed, a rack nothing came at and a sensor you never scanned with are still secrets at the end of the game.',
  },
} as const
