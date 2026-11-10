/**
 * Why the engine refuses an action, one line a reason (`game/refusals.ts`).
 * The referee's errors, the table's plan and an agent's notes all say them,
 * so a player reads the same words wherever a turn is refused. Only strings
 * live here. A `{name}` is a slot the caller fills: `{slot}` with the
 * subsystem's name (the table names it by its slot), `{name}` with a
 * player's, and the rest with numbers and ids from the engine. The words
 * around a slot are free to change, and a slot may move or be dropped but
 * keeps its name.
 */
export const REFUSALS = {
  /** Words a reason is filled with. */
  words: {
    outward: 'outward',
    inward: 'inward',
  },

  /** The turn as a whole. */
  unknownAction: 'Unknown or disallowed action: {type}',
  noData: 'The {type} action carries no data',
  unsequenced: 'Every action in the sequence needs its place in it ({count} without one)',
  duplicateSequence: 'Two actions share a place in the sequence',
  brokenSequence: 'The sequence runs 1, 2, 3 without a gap: expected {expected}, found {found}',
  twoMoves: 'One move a turn: a coast, a burn or a jump',
  twoRepairs: 'One repair a turn',
  twoSales: 'One sale a visit',
  markTwice: 'Each Escort marker goes on a different ship: {name} is named twice',
  seizeTwice: 'Each seizure takes a different item: {item} from {name} is named twice',
  surveyTwice: 'One survey a turn',
  salvageTwice: 'One wreck a turn',

  /** Subsystems. */
  noSubsystem: 'No subsystem {id} aboard',
  notPowerable: '{slot} is powered by the action that uses it, not by powering it',
  broken: '{slot} is broken',
  used: '{slot} has already done its one thing this turn',
  wholeCubes: '{slot} is powered with a whole number of cubes',
  tooFewCubes: '{slot} needs at least {min} cubes to work',
  tooManyCubes: '{slot} holds at most {max} cubes',

  /** Rotating. */
  unknownFacing: 'A ship faces prograde or retrograde, not {facing}',
  alreadyFacing: 'The ship already faces {facing}',
  thrustersBroken: 'Maneuvering thrusters are broken: no rotation',
  thrustersUsed: 'The thrusters turn the ship once a turn',

  /** Moving. */
  scoopBroken: 'Fuel scoop is broken: no scooping',
  scoopUsed: 'The fuel scoop works once a turn',
  enginesBrokenBurn: 'Engines are broken: no burn',
  enginesBrokenJump: 'Engines are broken: no jump',
  enginesBrokenRecoil: 'Engines are broken: nothing to cancel the recoil with',
  enginesUsed: 'The engines act once a turn: a burn, a jump or a recoil compensation, not two',
  wholePhasing: 'Phasing is a whole number of sectors',
  phasing: 'Phasing must be between {min} and +{max} from this ring',
  burnOffRings: 'A {intensity} burn {direction} from ring {ring} would leave the rings',
  burnFuel: 'Not enough fuel for a {intensity} burn: {mass} needed, {fuel} in the tank by then',
  noLane: 'No transfer lane from here to that destination',
  jumpFacing: 'A jump is a burn out of the well: face prograde (rotate first)',
  jumpPhasing: 'Phasing a jump stays inside the arrival arc ({min} to +{max} from here)',
  jumpFuel: 'Not enough fuel for the jump: {mass} needed, {fuel} in the tank by then',

  /** A turn that reaches nobody. */
  openingNoFire: 'No weapon fires in the first round',
  backNoFire: 'Back from Home: no weapon of yours fires this turn',
  openingNoScan: 'Nobody scans in the first round',
  backNoScan: 'Back from Home: you scan nobody this turn',
  openingNoSeize: 'Nobody seizes in the first round',
  backNoSeize: 'Back from Home: you seize nothing this turn',

  /** Who an action names. */
  noPlayer: 'No player {id} at the table',
  selfTarget: 'You cannot name your own ship',
  offBoard: '{name} is not on the board',
  untouchable: '{name} cannot be touched until its turn back is over',

  /** Firing. */
  mooredNoFire: 'A moored ship fires at nobody: burn off the berth first',
  notWeapon: '{slot} is not a weapon',
  noMissiles: '{slot}: no missiles left aboard',
  emptySalvo: '{slot}: a salvo launches a whole number of missiles, at least one',
  tooManyMissiles: '{slot}: {count} missiles planned, {ammo} aboard',
  notSalvo: '{slot} fires once: only a missiles subsystem launches a salvo',
  mooredTarget: '{name} is moored: nobody fires at a ship at a berth',
  outOfRange: '{slot}: {name} is out of range from where you fire',
  noCriticalSlot: 'A critical names a slot on {name}: {critical} is not one',
  recoilFuel: 'Not enough fuel to compensate the recoil: {mass} needed, {fuel} in the tank by then',
  recoilOffRings: 'Railgun recoil would push you off the rings: compensate or rotate first',

  /** Scanning. */
  noSensor: 'No sensor array aboard',
  mooredScan: '{name} is moored: nobody scans a ship at a berth',
  scanRange:
    'Scan: {name} must be on your ring, up to {range} sectors ahead or in your sector. Rotate first to face them',
  peekNotSlot: 'Scan: {peek} is not a slot on their loadout',

  /** Repairs and sales. */
  notBroken: '{slot} is not broken',
  repairHot: 'Carrying {heat} heat: a repair needs the ship cold at its heat check',
  badSale: 'A sale names an item aboard by its id, "fuel", "load" or "none", not {sale}',

  /** Piracy. */
  seizeNoCard: 'Seize: no Piracy card is free to take an item',
  mooredNoSeize: 'A moored ship seizes nothing: burn off the berth first',
  seizeAway: 'Seize: {name} is not in your sector at this point',
  seizeMoored: '{name} is moored: nothing changes hands at a berth',
  seizeNoItem: 'Seize: {name} carries no item {item}',
  seizeRefused: 'Seize: {item} cannot be taken from {name} here',

  /** Escort. */
  markNone: 'Mark: no Escort marker in hand',
  mooredNoMark: 'A moored ship marks nobody: burn off the berth first',
  markAlready: 'Mark: {name} already carries an Escort marker',
  markRing: 'Mark: {name} is not on your ring at this point',
  markMoored: '{name} is moored: a berth takes no marker',
  markEmpty: 'Mark: {name} carries nothing at this point',
  markRefused: 'Mark: {name} cannot take your marker from where you are',

  /** Survey and Salvage. */
  surveyNoCard: 'Survey: no Survey card wants data',
  surveyRing: 'Survey: you are not on Black Hole Ring {ring} at this point',
  salvageNoCard: 'Salvage: no Salvage card wants a black box',
  wreckGone: 'Salvage: no wreck {wreck} on the board',
  wreckAway: 'Salvage: the wreck is not in your sector at this point',

  /**
   * Taken by the engine, but they may come to nothing: an agent hears them,
   * the table shows the last one as an issue, since its step can only miss.
   */
  seizeAfterShot:
    'Seize: a shot before it is at {name}; if it destroys them, there is nothing left to take',
  markAfterShot:
    'Mark: a shot before it is at {name}; if it destroys them, the marker stays in your hand',
  salvageIfKill:
    'Salvage: no wreck in your sector yet; it takes one only if a shot before it destroys {names}',
  salvageNothing:
    'Salvage: no wreck in your sector at this point, and no shot before it at a ship there',
} as const
