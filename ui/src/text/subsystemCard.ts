/**
 * Every word on the printed subsystems card (`site/subsystems/`), and the
 * block above it on the rules page. A tile names its subsystem (the
 * engine's name, but where `names` says otherwise), its slot, what turns it
 * face up and its one sentence; the drawings carry the rest.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'

export const SUBSYSTEM_CARD = {
  // -------------------------------------------------------------------------
  // The title cell, and the key to the marks every tile uses
  // -------------------------------------------------------------------------
  title: {
    title: 'Subsystems',
    sub: 'Weapons, the sensor and systems',
    energy: 'Energy',
    damage: 'Damage',
    fuel: 'Fuel',
    heat: 'Heat',
    roll: 'Intercept',
    crit: 'Critical',
    faceUp: 'Turns face up',
  },

  // -------------------------------------------------------------------------
  // A tile, top to bottom
  // -------------------------------------------------------------------------
  /** A tile's name where it is not the engine's. */
  names: { rotation: 'Thrusters' } as Partial<Record<SubsystemType, string>>,
  /** Where it may be mounted, by the engine's slot type. */
  slots: { forward: 'Bow', side: 'Side', either: 'Bow or side', fixed: 'Fixed' },
  /** What turns it face up (RULES §Hidden information); the fixed three always are. */
  faceUp: {
    railgun: 'fires',
    laser: 'fires',
    plasma_cannon: 'fires',
    ballistic_rack: 'fires or intercepts',
    disruptor: 'fires',
    missiles: 'fires',
    sensor_array: 'scans',
    shields: 'absorbs',
    radiator: 'dissipates',
    fuel_compressor: 'jumps or folds',
    jump_drive: 'folds',
  } as Partial<Record<SubsystemType, string>>,
  /** The one short sentence a tile gets, for what its drawing cannot show. */
  sentences: {
    railgun: 'Your engines can stop the push for {ringFuel} fuel.',
    laser: 'Shields don’t stop it.',
    plasma_cannon: 'Each energy on a shield stops {plasma} of it.',
    ballistic_rack: 'While it has energy, it shoots at incoming missiles.',
    disruptor: 'A hit breaks a slot you name, unless the target’s shields have unspent energy.',
    missiles: 'Launch any number at one ship in your well.',
    sensor_array: 'Scan a ship to see one of its face-down subsystems.',
    shields: 'Unspent energy also stops a disruptor’s hit.',
    radiator: 'You dissipate {radiator} more heat at every check.',
    fuel_compressor: 'Your engines burn {compressed} fuel instead of {jump} on a jump or a fold.',
    jump_drive: 'Never onto a station.',
    engines: 'They do one thing a turn: burn, jump, fold or stop recoil.',
    rotation: 'You burn the way you face, and jump only facing prograde.',
    scoop: 'When you coast, gain fuel equal to your ring’s speed.',
  } satisfies Record<SubsystemType, string>,
  /** On the fans of the laser and the plasma cannon: P and S are the loadout's slot codes. */
  oneSide: ['Rotating', 'swaps P and S'],
  /** The words inside the drawings. */
  pictures: { prograde: 'Prograde', retrograde: 'Retrograde' },

  // -------------------------------------------------------------------------
  // The section on the rules page
  // -------------------------------------------------------------------------
  section: {
    kicker: 'At the table',
    title: 'Subsystems card',
    lede: 'Every subsystem on one card: what each weapon and the sensor reach, drawn on the black hole’s rings, and what the rest do. Weapons on the front, systems on the back. {width}×{height}mm, a 4×6in photo sleeve.',
    front: 'Front',
    back: 'Back',
    print: 'Print',
    modes: { sheet: 'Sheet', duplex: 'Double-sided' },
    flips: { long: 'Long-edge flip', short: 'Short-edge flip' },
    printNote: {
      sheet:
        'One A4 page: the front above the back. Print one-sided in colour at actual size, cut out both faces and glue the back to the front.',
      'duplex-long':
        'Two A4 pages: two fronts, then two backs. Print both sides in colour at actual size, flipping on the long edge, and cut along the marks.',
      'duplex-short':
        'Two A4 pages: two fronts, then two backs. Print both sides in colour at actual size, flipping on the short edge, and cut along the marks.',
    },
  },
} as const
