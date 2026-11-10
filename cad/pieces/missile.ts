// The missile token for the board: a dart in plan, nose +x, the game's
// missile (`ui/src/ships/missile.ts`) seen from above with its fins swept,
// small enough that a salvo's four lie abreast in the smallest sector (the
// black hole's ring 1). Each player prints their own in their colour, so the
// token says whose it is. Built as the ship token is: a slab with its nose,
// flanks and fins' leading edges chamfered and the rest square.
import { LENGTH as GAME_LENGTH } from '../../ui/src/ships/missile.ts'
import { slab, type Plan } from './token.ts'
import type { Point, Solid } from '../lib/solids.ts'

export const MISSILE = { length: 11, thickness: 3, chamfer: 0.5 }

/** The port half traced from the game's missile, in its units (GAME_LENGTH long, centred), tail to nose. */
const PORT: Point[] = [
  [-13, 1.6],
  [-11.6, 2.2],
  [-11.6, 4.5],
  [-9.4, 4.5],
  [-5, 3],
  [7, 3],
  [12.6, 0.4],
]
/** Chamfered port sides: the fin's leading edge, the flank and the nose. */
const CHAMFERED = [3, 4, 5]

export function missilePlan(): Plan {
  const k = MISSILE.length / GAME_LENGTH
  const port = PORT.map(([x, y]): Point => [x * k, y * k])
  const pts: Point[] = [...port, ...[...port].reverse().map(([x, y]): Point => [x, -y])]
  const n = port.length
  // Side i on port, its mirror at 2n - 2 - i; the nose's and the tail's flats square.
  const chamfered = pts.map((_, i) =>
    CHAMFERED.includes(i < n - 1 ? i : i >= n && i < 2 * n - 1 ? 2 * n - 2 - i : -1)
  )
  return { pts, chamfered }
}

export function buildMissileToken(): Solid {
  return slab(missilePlan(), MISSILE.thickness, MISSILE.chamfer)
}
