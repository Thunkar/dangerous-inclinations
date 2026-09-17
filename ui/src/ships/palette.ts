/**
 * The corvette's material vocabulary, shared by anything built in the same
 * yard: the ship model and the orbital stations it docks at.
 *
 * These are the colours the hull reads in — a pale structural paint, a dark
 * recess, bare steel, copper plumbing, cyan for anything live and red for a
 * warning. Keeping them in one place is what makes a station look like it came
 * off the same drawings as the ships, rather than merely near them.
 */
export const HULL_INK = {
  /** Structural paint: the ship's default hull colour. */
  paint: '#aab4b2',
  /** Shadowed recesses, panel gaps, undersides. */
  dark: '#242e33',
  /** Bare structure: frames, spars, truss. */
  steel: '#647776',
  /** Seals and soft mounts. */
  rubber: '#11191d',
  /** Plumbing: coolant and feed lines. */
  copper: '#b78759',
  /** Anything energised — coils, windows, approach lighting. */
  cyan: '#76dcf3',
  /** Thrust. */
  glow: '#98e8ff',
  /** Warnings and beacons. */
  warn: '#d95b4a',
  /** The yard's hazard orange, used for bands and stencils. */
  accent: '#d3683d',
} as const
