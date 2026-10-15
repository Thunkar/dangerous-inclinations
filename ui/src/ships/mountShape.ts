/**
 * The mount every module shares, as numbers: the foot a module stands on and
 * the recess a hull takes it in, in millimetres at the printed scale. One
 * table for the game's model (`model.ts` draws the foot and the recess) and
 * the printed one (`cad/spec.ts`), so the two cannot drift. Pure data: no
 * three.js, nothing that renders.
 */
import { CORVETTE } from './corvetteShape'

/** The corvette, bow to the bells' exit, prints at 80 mm: the scale every piece is printed at. */
export const PRINT_LENGTH = 80
export const MM_PER_UNIT = PRINT_LENGTH / CORVETTE.length

/**
 * The foot, in the mount's frame (x forward, y dorsal): 16 x 9, a big
 * chamfer at the bow end (the pointer) and a small one aft, symmetric dorsal
 * to ventral, so one print of a module fits all four flank mounts and its
 * guns still face the bow. A hull takes it in a recess `recessDepth` deep; the
 * module's tenon is the outline less `clearance`, `recessDepth - clearance`
 * thick, so it seats on the recess's rim with that gap below it.
 */
export const FOOT = {
  halfLength: 8,
  halfHeight: 4.5,
  noseChamfer: 2.5,
  tailChamfer: 1.5,
  recessDepth: 1,
  clearance: 0.1,
}

/**
 * The foot's outline grown by g mm (shrunk for g < 0), anticlockwise: every
 * side moved out by g, which grows the 45-degree chamfers' legs by
 * g (2 - sqrt 2).
 */
export function footOutline(g = 0): [number, number][] {
  const a = FOOT.halfLength + g
  const b = FOOT.halfHeight + g
  const k = g * (2 - Math.SQRT2)
  const n = FOOT.noseChamfer + k
  const c = FOOT.tailChamfer + k
  return [
    [-a + c, -b],
    [a - n, -b],
    [a, -b + n],
    [a, b - n],
    [a - n, b],
    [-a + c, b],
    [-a, b - c],
    [-a, -b + c],
  ]
}

/**
 * Where a mount's face is along the game mount frame's outboard axis, in
 * hull units: the corvette's skin, 0.06 out on a flank and 0.01 in at the
 * bow. It is the same on every hull, because a module is one print for every
 * hull and its seat must be the same distance from the frame.
 */
export function mountFace(forward: boolean): number {
  return forward
    ? CORVETTE.core[CORVETTE.core.length - 1][0] - CORVETTE.mounts.bow
    : CORVETTE.core[2][2] - CORVETTE.mounts.flank
}
