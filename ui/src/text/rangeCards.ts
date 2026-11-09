/**
 * Every word on the printed range cards (`site/ranges/`), and the block above
 * them on the cheatsheet page. One card per weapon and one for the sensor's
 * scan: its reach drawn on the black hole's rings, its numbers, and its one
 * line in the black bar. The subsystems' names are the engine's.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name.
 */
import type { RangeCardType } from '../site/ranges/reach'

export const RANGE_CARDS = {
  // -------------------------------------------------------------------------
  // The card, top to bottom
  // -------------------------------------------------------------------------
  /** Where the subsystem may be mounted, by the engine's slot type. */
  slots: { forward: 'Bow', side: 'Side', either: 'Bow or side' },
  /** Beside the two numerals. */
  damage: 'Damage',
  energy: 'Energy',
  /** The key, bottom left. */
  portMounts: 'P1 P2 fire out',
  starboardMounts: 'S1 S2 fire in',
  wellwide: 'Anywhere in the well',
  firstFlight: 'Steps of the first flight',
  /** The card's one line, in the black bar. */
  lines: {
    railgun:
      'Recoil pushes you a ring inward facing prograde, outward facing retrograde. Compensating costs {fuel} fuel.',
    laser: 'Ignores shields.',
    plasma_cannon: 'Each shield energy point stops {points} points of damage.',
    ballistic_rack:
      'Can intercept up to {intercepts} missiles during the turn of an opponent: {roll}+ shoots one down.',
    disruptor:
      'No damage. A hit breaks an enemy subsystem of your choice. Any shield with energy left this turn stops it.',
    missiles:
      'A salvo flies {steps} steps on launch. After each of your turns it flies {steps} steps + orbital drift. They disappear after 3 turns or when hitting the target',
    sensor_array: 'Peek at one face-down slot. While powered, you crit on {crit}–10.',
  } satisfies Record<RangeCardType, string>,

  // -------------------------------------------------------------------------
  // The section on the cheatsheet page
  // -------------------------------------------------------------------------
  section: {
    kicker: 'At the table',
    title: 'Range cards',
    lede: 'What every weapon reaches, drawn on the black hole’s rings: one card for each, and one for the sensor’s scan. {width}×{height}mm, the size of a mission card.',
    back: 'Back',
    cards: 'Weapons',
    print: 'Print',
    flips: { long: 'Long-edge flip', short: 'Short-edge flip' },
    printNote:
      '{pages} A4 pages, nine cards to a page, fronts then backs. Print both sides in colour at actual size, flipping on the {edge} edge, and cut along the marks.',
    edges: { long: 'long', short: 'short' },
  },
} as const
