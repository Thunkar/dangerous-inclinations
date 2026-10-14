/**
 * The corvette's shape as numbers, in hull units (+X bow, +Y dorsal, Z across,
 * port -Z), at length = beam = armor = engineSize 1. One table for both the
 * game's model (`model.ts`, `config.ts`) and the printed one (`cad/`), so the
 * two cannot drift. Pure data: no three.js, nothing that renders.
 */

/** A loft station: x, half height, half width (the clipped section of `loft.ts`). */
export type Station = readonly [number, number, number]

export const CORVETTE = {
  /** Bow to the bells' exit, the length the print scale is set by. */
  length: 8.5,

  /** The armoured core, aft to fore. */
  core: [
    [-3.25, 0.71, 1.04],
    [-2.6, 0.84, 1.14],
    [1.95, 0.84, 1.14],
    [2.55, 0.76, 1.0],
    [3.04, 0.56, 0.8],
  ] as readonly Station[],

  /**
   * Where the corvette stands when printed belly down (game y): the underside
   * of the bow collar (its mount at y 0, the collar's lower half 0.93 down),
   * which the flank bays' ventral shoulders reach to within 0.025, so both
   * rest on the bed; the keel plating below it is cut away by the print.
   */
  bed: -0.93,

  /** The flank mounts' x (fore, aft), their distance off the centreline, and the bow mount's x. */
  mounts: { fore: 1.58, aft: -0.64, flank: 1.08, bow: 3.05 },

  /**
   * The deck and keel armour: tiles laid as [centre x, length, share of the
   * full step], a port and a starboard plate to each, with seams between.
   */
  armor: {
    tiles: [
      [-2.12, 0.93, 1],
      [-0.98, 1.25, 1],
      [0.43, 1.43, 1],
      [1.68, 0.91, 0.42],
    ] as readonly (readonly [number, number, number])[],
    seam: 0.035,
    relief: 0.8,
    /** Deck and keel plating across, before the seams. */
    deckWidth: 1.64,
    keelWidth: 1.6,
    /** The core's deck and keel surfaces the plates sit on. */
    deckY: 0.8,
    keelY: -0.79,
  },

  /** The command citadel on the deck, lifted by `lift`. */
  citadel: {
    stations: [
      [1.25, 0.08, 0.58],
      [1.55, 0.3, 0.62],
      [2.6, 0.3, 0.49],
      [3.1, 0.08, 0.42],
    ] as readonly Station[],
    lift: 0.93,
  },

  /** The afterbody joins the core to the drive block; x of its two forward stations. */
  afterbody: {
    joins: [
      [-2.8, 0.91, 1.16],
      [-2.35, 0.84, 1.14],
    ] as readonly Station[],
  },

  /**
   * The drive: its origin's x, the block's section by cluster size (half
   * height and half width before the 0.08 / 0.03 the block adds), the block
   * held from origin - 0.78 to origin - 0.22, the thrust plate and the shroud
   * behind it (both in the drive's own x, from the origin).
   */
  drive: {
    origin: -3.13,
    sternHeight: { 1: 1.16, 3: 1.1, 5: 1.28 } as Record<1 | 3 | 5, number>,
    sternWidth: { 1: 1.12, 3: 1.5, 5: 1.5 } as Record<1 | 3 | 5, number>,
    blockAdds: [0.08, 0.03] as const,
    block: [-0.78, -0.22] as const,
    thrustPlate: -0.825,
    shroud: { fore: -0.8, aft: -1.52, skin: 0.14 },
  },

  /** The bells on the thrust plate: [y, z, scale] by cluster size (the bell itself is `parts.ts`). */
  bells: {
    1: [[0, 0, 1.6]],
    3: [
      [0, 0, 1.15],
      [0, -0.99, 0.79],
      [0, 0.99, 0.79],
    ],
    5: [
      [0, 0, 1.15],
      [0, -0.99, 0.79],
      [0, 0.99, 0.79],
      [-0.83, 0, 0.6],
      [0.83, 0, 0.6],
    ],
  } as Record<1 | 3 | 5, readonly (readonly [number, number, number])[]>,

  /**
   * The fixed fuel scoop on the ventral bow: plate size and centre. It reaches
   * down to the keel plane (0.01 short, so it does not flicker against the
   * bow collar lying on it), so the bow has a flat bottom too.
   */
  scoop: { size: [1.2, 0.51, 1.2], at: [2.58, -0.815, 0] } as const,
}
