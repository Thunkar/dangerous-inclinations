/**
 * The corvette's material vocabulary, shared by anything built in the same
 * yard: the ship model and the orbital stations it docks at.
 *
 * These are the colours the hull reads in, taken from the table's inks rather
 * than a second palette: a warm pale paint, the table's ink for recesses,
 * bare steel, copper plumbing (the one physical colour, like the accretion
 * disc), the fuel teal for anything live and the poster red for a warning.
 * Keeping them in one place is what makes a station look like it came off the
 * same drawings as the ships, rather than merely near them.
 */
export const HULL_INK = {
  /** Structural paint: the ship's default hull colour, a warm primer. */
  paint: '#d6cfbd',
  /** Shadowed recesses, panel gaps, undersides: the table's ink. */
  dark: '#1e2024',
  /** Bare structure: frames, spars, truss. */
  steel: '#6e7174',
  /** Seals and soft mounts. */
  rubber: '#111214',
  /** Plumbing: coolant and feed lines. */
  copper: '#b78759',
  /** Anything energised: coils, windows, approach lighting. The fuel teal. */
  cyan: '#3fb0c8',
  /** Thrust. */
  glow: '#bff4ff',
  /** Warnings and beacons: the poster red. */
  warn: '#d21b33',
  /** The yard's stripe, where no seat colour is given. */
  accent: '#d21b33',
} as const
