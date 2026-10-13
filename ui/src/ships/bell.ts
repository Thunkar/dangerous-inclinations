/**
 * The yard's de Laval bell as numbers, in the bell's own units (scale 1).
 * Shared by the game's model (`parts.ts`) and the printed one (`cad/`).
 * Pure data: no three.js, nothing that renders.
 */

/** The de Laval bell's outside, throat to lip, as [radius, distance aft]. */
export const BELL_PROFILE: [number, number][] = [
  [0.175, 0.33],
  [0.275, 0.5],
  [0.355, 0.7],
  [0.415, 0.9],
  [0.455, 1.1],
  [0.465, 1.22],
]
/** Its wall: the chamber, converging to the throat, then the bell and back in. */
export const BELL_WALL = [
  [0.3, -0.12],
  [0.3, 0.08],
  [0.17, 0.28],
  [0.17, 0.33],
  [0.27, 0.5],
  [0.35, 0.7],
  [0.41, 0.9],
  [0.45, 1.1],
  [0.46, 1.25],
  [0.44, 1.25],
  [0.43, 1.1],
  [0.39, 0.9],
  [0.33, 0.7],
  [0.25, 0.5],
  [0.15, 0.33],
  [0.15, 0.28],
]
/** A full-size bell reaches this far aft of where it is hung. */
export const BELL_LENGTH = 1.25
