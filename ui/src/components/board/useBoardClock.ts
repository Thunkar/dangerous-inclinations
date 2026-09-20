/**
 * The board's clock.
 *
 * Time used to live in AnimationContext, which meant every frame of every
 * beam re-rendered the whole table — loadouts, log, action column and all. It
 * lives here instead: one rAF loop, owned by the renderer that needs it, and
 * running only while something on the board is actually moving.
 *
 * The 3D board never calls this: it reads `performance.now()` inside its own
 * frame loop and never re-renders React at all.
 */
import { useEffect, useState } from 'react'

/** `performance.now()`, refreshed every animation frame while `active`. */
export function useBoardClock(active: boolean): number {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = () => {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  return now
}
