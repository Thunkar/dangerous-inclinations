/**
 * How an agent writes its turn (`agentIntentGuide`, agent/digest.ts): the
 * intent JSON the builder accepts, one line of the guide a key, in the order
 * they are printed. Only strings live here. A `{name}` is a slot the guide
 * fills from the engine's constants. A line with a slot is split into its
 * `code`, printed as it stands (its JSON braces would read as slots), and the
 * `note` after it, which is filled.
 */
export const AGENT_INTENT = {
  heading: 'INTENT FORMAT (JSON). Everything optional; omitted = nothing powered and a coast.',
  open: '{',
  power: {
    code: '  "power": { "side-2": 2, "forward-0": 2 },    ',
    note: '// shields {shieldMin}|{shieldMax}, rack {rack}, sensor {sensor}: up until your next turn; not named = off',
  },
  rotate: {
    code: '  "rotate": false,                             ',
    note: '// flip facing ({thrusters} cube on the thrusters, {thrusters} heat), once a turn: true = before a coast or a burn naming no facing, AFTER a burn naming the facing you have or a jump while prograde (turn to scan or fire along the ring you arrive on); or "before" | "after"',
  },
  move: '  "move": { "kind": "coast", "scoop": false }  // or { "kind": "burn", "intensity": "soft|medium|hard", "adjustment": 0, "facing": "prograde|retrograde" }',
  jump: '                                               // or { "kind": "jump", "destinationWellId": "planet-alpha", "adjustment": 0 }',
  fire: '  "fire": [ { "weapon": "forward-0", "target": "<playerId>", "critical": "engines", "compensateRecoil": false, "when": "after" } ],',
  scan: '  "scan": { "target": "<playerId>", "slot": "side-1" },',
  repair:
    '  "repair": "engines",                         // a broken subsystem to fix at the heat check; only lands if the turn makes NO heat',
  sell: '  "sell": "item-4",                            // a cargo id in your hold, "fuel", "load" or "none": what the visit does if this turn arrives at a station; omitted = the sale worth most points, else load',
  escort:
    '  "escort": ["<playerId>"],                    // put an Escort marker on each (one per marker in hand) on your ring, before the move if it qualifies now, else after; omitted = no marker',
  survey: {
    code: '  "survey": true,                              ',
    note: '// Survey: take the data on BH ring {surveyRing}, before the move if you are on it now, else after; omitted = nothing taken',
  },
  salvage:
    '  "salvage": "<wreckId>" | true,               // Salvage: take that wreck\'s black box in your sector, before the move if it is there now, else after; true = the first wreck in your sector, after your shots if none is there yet (your kill\'s); omitted = nothing taken',
  seize:
    '  "seize": [{ "victim": "<playerId>", "cargoId": "<id>" }]  // Piracy: take that item (one per free card) from a ship in your sector, before the move if it is there now, else after; omitted = nothing taken',
  close: '}',
  how: 'A burn, rotation, shot or scan needs no cubes from you: the engine powers its subsystem. Do not also power a rack you fire or a sensor you scan with: a subsystem does one thing a turn, and using it leaves it up. The builder just orders the actions (power, a rotation before the move, then what you take where you start: markers, seizures, the survey, the salvage; the scan if its target is in range where you start, shots marked "before", the move, a rotation after the move, then what you take where the move ends, the scan otherwise, other shots, and last a "salvage": true with no wreck in reach yet), turns you prograde for a jump or to the facing a burn names, and notes anything in the turn the engine will refuse. Preview it before submitting; if the preview reports errors, fix the intent or fall back to a coast.',
} as const
