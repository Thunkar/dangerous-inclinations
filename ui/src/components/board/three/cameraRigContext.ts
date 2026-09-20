/**
 * The camera's remote control.
 *
 * The buttons that drive the camera are plain HTML sitting on top of the
 * canvas, and the camera itself lives inside it; this context is the wire
 * between them. It carries no three.js types, so either side can import it.
 */
import { createContext, useContext, type RefObject } from 'react'
import type { GravityWellId } from '@dangerous-inclinations/engine'

/** Table: three-quarter view of the black hole. Top: the 2D board, lit. Follow: your well. */
export type CameraPreset = 'table' | 'top' | 'follow'

export const CAMERA_PRESETS: readonly CameraPreset[] = ['table', 'top', 'follow']

export interface CameraRigApi {
  /** The preset last asked for; the camera may have been dragged since. */
  preset: CameraPreset
  setPreset: (preset: CameraPreset) => void
  /** Fly to a gravity well and frame it. */
  flyTo: (wellId: GravityWellId) => void
  /** Dolly in (factor > 1) or out (factor < 1). */
  zoomBy: (factor: number) => void
  /** Put the camera back in the view the board opened in: the recentre button. */
  reset: () => void
}

/** What the rig inside the canvas registers so the API above can reach it. */
export interface CameraRigHandle {
  framePreset: (preset: CameraPreset, transition: boolean) => void
  frameAll: (transition: boolean) => void
  frameWell: (wellId: GravityWellId, transition: boolean) => void
  zoomBy: (factor: number) => void
}

export interface CameraRigValue extends CameraRigApi {
  handle: RefObject<CameraRigHandle | null>
}

export const CameraRigContext = createContext<CameraRigValue | null>(null)

/**
 * The camera's API. It carries `handle` too (the rig inside the canvas
 * registers itself through it) but callers only ever need the four verbs.
 */
export function useCameraRig(): CameraRigValue {
  const value = useContext(CameraRigContext)
  if (!value) throw new Error('useCameraRig must be used inside a CameraRigProvider')
  return value
}
