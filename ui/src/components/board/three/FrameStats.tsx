/**
 * A frame-time probe for the dev harness.
 *
 * It answers one question — what does this scene cost, with the composer on
 * and off — and answers it on the console rather than on screen, so a headless
 * screenshot run can read it. It is mounted only when the harness asks for it
 * (`?stats=1`) and is never part of the table.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/** Frames thrown away while shaders compile and the text atlas fills. */
const WARMUP_FRAMES = 40

export function FrameStats({ label, seconds = 3 }: { label: string; seconds?: number }) {
  const state = useRef({ warmup: 0, frames: 0, elapsed: 0, window: 0 })

  useFrame((_, delta) => {
    const stats = state.current
    if (stats.warmup < WARMUP_FRAMES) {
      stats.warmup++
      return
    }
    stats.frames++
    stats.elapsed += delta
    if (stats.elapsed < seconds) return
    const average = (stats.elapsed / stats.frames) * 1000
    stats.window++
    console.log(
      `[frame] ${label}: ${average.toFixed(1)} ms/frame (${(1000 / average).toFixed(1)} fps) ` +
        `over ${stats.frames} frames, window ${stats.window}`
    )
    stats.frames = 0
    stats.elapsed = 0
  })

  return null
}
