/**
 * The plain values the player card draws with: the inks, the point
 * in millimetres, circle geometry and what each face of
 * the d10 does. The drawn pieces are in `pictos.tsx`.
 */
import { INK, RED } from '../diagram'
import { N } from './numbers'

export { INK, RED }
export const PAPER = '#fff'
/** A type size in points, as millimetres. */
export const pt = (n: number) => n * 0.3528

/** A point on a circle, the angle in degrees clockwise from +x (screen space). */
export function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  const t = (a * Math.PI) / 180
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)]
}

/** An svg arc from angle `a0` to `a1`, sweeping clockwise when `a1 > a0`. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(3)} ${y1.toFixed(3)}`
}

export type FaceKind = 'miss' | 'hit' | 'crit' | 'sensor'

/** What a face of the d10 does, read off the engine's roll table. */
export function faceKind(face: number): FaceKind {
  if (face <= N.miss) return 'miss'
  if (face >= N.crit) return 'crit'
  return face >= N.sensorCrit ? 'sensor' : 'hit'
}
