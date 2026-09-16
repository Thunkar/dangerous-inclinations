/**
 * One clock for every shader on the board.
 *
 * Animated materials share a single uniform object rather than each keeping
 * its own: one `useFrame` advances it, nothing re-renders, and every ribbon on
 * the table stays in phase. React state never sees it.
 */
import { useFrame } from '@react-three/fiber'

/** Seconds since the scene mounted. Shared by reference with every material. */
export const sceneTime = { value: 0 }

/** Mount once inside the canvas; it is the only thing that writes `sceneTime`. */
export function SceneClock() {
  useFrame((_, delta) => {
    sceneTime.value += delta
  })
  return null
}
