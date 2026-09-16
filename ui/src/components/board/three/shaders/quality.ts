/**
 * How much the shaders in this folder are allowed to cost.
 *
 * One number, decided once, early, by `scene/Environment.tsx` — which is the
 * only thing that measures and the only thing that may call `stepDown`. This
 * module is just where the answer is kept, because three different components
 * compile shaders against it (`BlackHole`, `Planet`, the star shells) and they
 * are drawn by `Wells`, which cannot pass a context down to them.
 *
 * It is a store rather than React state on purpose: the value changes at most
 * twice in the life of a board and never during play, so the components that
 * care recompile once each and nothing re-renders per frame.
 *
 *   0  the path that was asked for
 *   1  the composer dropped: bloom, vignette and the lensing pass go away
 *   2  the cheap path: two-octave noise, fewer stars, a coarser sky, no clouds
 *
 * It only ever goes up. A board that gets prettier again while you are looking
 * at it is more distracting than a board that stays plain.
 */
import { useSyncExternalStore } from 'react'

export type SceneQuality = 'rich' | 'cheap'

let level = 0
const listeners = new Set<() => void>()

/** Move down a step. Lower or equal levels are ignored: this is a ratchet. */
export function stepDown(next: number): void {
  if (next <= level) return
  level = next
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): number {
  return level
}

function serverSnapshot(): number {
  return 0
}

/** The raw step, for the one component that has to know about the composer. */
export function useDowngrade(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/** What a shader should compile for. */
export function useSceneQuality(): SceneQuality {
  return useDowngrade() >= 2 ? 'cheap' : 'rich'
}
