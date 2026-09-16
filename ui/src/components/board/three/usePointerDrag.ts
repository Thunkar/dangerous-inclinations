/**
 * Telling a click from a camera drag.
 *
 * The 2D board already makes this distinction — a press that travels more than
 * four pixels is a pan, not a click — and the 3D board must make it the same
 * way, or every attempt to orbit would fire at whatever ship the pointer
 * happens to land on. The camera controls handle the drag itself; this hook
 * only reports whether the press that is ending moved far enough to be one.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'

/** Pointer travel (px) before a press counts as a camera drag. Same as the SVG board. */
export const DRAG_THRESHOLD = 4

export function usePointerDrag(threshold = DRAG_THRESHOLD) {
  const gl = useThree(state => state.gl)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)

  useEffect(() => {
    const element = gl.domElement
    const down = (event: PointerEvent) => {
      origin.current = { x: event.clientX, y: event.clientY }
      dragged.current = false
    }
    const move = (event: PointerEvent) => {
      const from = origin.current
      if (!from || dragged.current) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) >= threshold) {
        dragged.current = true
      }
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
    }
  }, [gl, threshold])

  return useCallback(() => dragged.current, [])
}
