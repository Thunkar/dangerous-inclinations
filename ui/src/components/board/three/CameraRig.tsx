/**
 * The camera rig: damped orbit, pan and dolly, bounded to the board.
 *
 * The board is a table, not a world, so the camera is kept honest — it cannot
 * be trucked off the edge, cannot dolly further out than the whole board or
 * closer in than one well, and never drops below the plane where the numbers
 * would go edge-on. Three presets frame it: Table (three-quarter from the near
 * edge, the default), Top (the 2D board with lighting) and Follow (the well
 * your own ship is in). `flyTo` is what a double-click on a body calls.
 *
 * Framing is solved, not guessed. The board is a triangle of discs seen from an
 * angle, so a box around it would be mostly empty air and the board would float
 * in a wide margin; instead the rig takes the silhouette of what is actually
 * drawn (`boardHullPoints`) and finds the nearest camera that still holds every
 * point of it, then slides the camera sideways and up until the silhouette is
 * centred. Every preset, `reset` and a resize all go through that one solver,
 * so they land on the same picture.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { BOARD_BOUNDS } from '../geometry'
import {
  BOARD_RELIEF,
  CAMERA_NEAR,
  boardHullPoints,
  surfaceElevation,
  wellHullPoints,
} from './world'
import {
  CameraRigContext,
  type CameraPreset,
  type CameraRigHandle,
  type CameraRigValue,
} from './cameraRigContext'

/**
 * Degrees above the plane. Ninety would be straight down, and degenerate.
 *
 * Table is a three-quarter view at 55°, and stays there for as long as the pane
 * is wider than it is tall. A board seen from 55° is half again as wide as it
 * is deep, so in a squarish column it would fill the width and leave a third of
 * the height empty; the rig then stands the camera up by as little as it takes
 * to use that height. On a wide pane every candidate but the first loses, so
 * nothing changes.
 */
const TABLE_PITCHES = [55, 60, 65, 70, 75]
const TOP_PITCH = 89.9

/**
 * The fraction of the shorter frame axis the board is asked to fill. A tenth of
 * the frame as margin reads as breathing room; much less and the near corner of
 * the board touches the edge of the pane.
 */
const FRAME_FILL = 0.9

/** Room left around one well when it is framed on its own. */
const WELL_MARGIN = 40

/** How much more board a steeper Table camera must show before it is taken. */
const PITCH_GAIN = 1.15

const MIN_DISTANCE = 180
const MAX_DISTANCE = 4400
/** Never under the plane: past 82° the sector numbers are already edge-on. */
const MAX_POLAR = MathUtils.degToRad(82)

type Controls = React.ComponentRef<typeof CameraControls>

/**
 * Place the camera so that every point is inside the frustum, as close as it
 * can be and with the points centred in the picture.
 *
 * Work in the camera's own frame: `u` across, `v` up, `w` into the scene. With
 * the eye at depth `w0` a point is in frame when |u − uEye| ≤ (w − w0)·tanH and
 * likewise for v, so each point gives an interval of eye positions and the
 * camera fits when all the intervals overlap. Pulling back widens every
 * interval, so bisecting on `w0` finds the closest depth that fits and the
 * middle of the surviving intervals is the centred eye.
 */
function solveEye(
  camera: PerspectiveCamera,
  points: Vector3[],
  pitchDeg: number,
  fill: number
): { eye: Vector3; target: Vector3 } | null {
  if (points.length === 0) return null
  const tanV = Math.tan(MathUtils.degToRad(camera.fov) / 2) * fill
  const tanH = tanV * Math.max(0.2, camera.aspect)
  const pitch = MathUtils.degToRad(pitchDeg)
  // Azimuth 0: the camera sits over the board's near (+z) edge, so sector 0 of
  // the black hole stays at the far side of the picture, as it is printed.
  const forward = new Vector3(0, -Math.sin(pitch), -Math.cos(pitch))
  const right = new Vector3(1, 0, 0)
  const up = right.clone().cross(forward)

  const u = points.map(p => p.dot(right))
  const v = points.map(p => p.dot(up))
  const w = points.map(p => p.dot(forward))
  const nearest = Math.min(...w)
  const mean = w.reduce((sum, value) => sum + value, 0) / w.length

  /** Centre of the eye's feasible interval on one axis, or null if there is none. */
  const centre = (axis: number[], tan: number, eyeDepth: number): number | null => {
    let low = -Infinity
    let high = Infinity
    for (let i = 0; i < axis.length; i++) {
      const depth = w[i] - eyeDepth
      if (depth <= CAMERA_NEAR) return null
      low = Math.max(low, axis[i] - depth * tan)
      high = Math.min(high, axis[i] + depth * tan)
    }
    return low <= high ? (low + high) / 2 : null
  }

  const fits = (eyeDepth: number) =>
    centre(u, tanH, eyeDepth) !== null && centre(v, tanV, eyeDepth) !== null

  let far = nearest - MAX_DISTANCE
  let near = nearest - MIN_DISTANCE
  if (!fits(far)) far = nearest - MAX_DISTANCE * 4
  if (!fits(near)) {
    for (let i = 0; i < 48; i++) {
      const mid = (far + near) / 2
      if (fits(mid)) far = mid
      else near = mid
    }
  } else {
    far = near
  }
  const eyeDepth = far
  const eyeU = centre(u, tanH, eyeDepth)
  const eyeV = centre(v, tanV, eyeDepth)
  if (eyeU === null || eyeV === null) return null

  const eye = right
    .clone()
    .multiplyScalar(eyeU)
    .addScaledVector(up, eyeV)
    .addScaledVector(forward, eyeDepth)
  const distance = MathUtils.clamp(mean - eyeDepth, MIN_DISTANCE, MAX_DISTANCE)
  const target = eye.clone().addScaledVector(forward, distance)
  return { eye, target }
}

/** How much of the frame the points cover once the camera is where it is. */
function coverage(camera: PerspectiveCamera, points: Vector3[], eye: Vector3, target: Vector3) {
  const view = camera.clone()
  view.position.copy(eye)
  view.lookAt(target)
  view.updateMatrixWorld(true)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const ndc = new Vector3()
  for (const point of points) {
    ndc.copy(point).project(view)
    minX = Math.min(minX, ndc.x)
    minY = Math.min(minY, ndc.y)
    maxX = Math.max(maxX, ndc.x)
    maxY = Math.max(maxY, ndc.y)
  }
  return ((maxX - minX) * (maxY - minY)) / 4
}

/**
 * Frame a set of world points from the near edge. Where more than one pitch is
 * offered the one that puts the most board on screen wins, which is what lets a
 * tall pane get a less oblique view of the same board.
 */
function framePoints(
  controls: Controls,
  points: Vector3[],
  pitches: number[],
  transition: boolean
) {
  const camera = controls.camera
  if (!(camera instanceof PerspectiveCamera)) return
  let best: { eye: Vector3; target: Vector3 } | null = null
  let bestCoverage = 0
  let firstCoverage = 0
  for (const pitch of pitches) {
    const solved = solveEye(camera, points, pitch, FRAME_FILL)
    if (!solved) continue
    const covered = coverage(camera, points, solved.eye, solved.target)
    if (!best) {
      best = solved
      bestCoverage = covered
      firstCoverage = covered
      continue
    }
    // A steeper camera has to earn the loss of the three-quarter view.
    if (covered > bestCoverage && covered > firstCoverage * PITCH_GAIN) {
      best = solved
      bestCoverage = covered
    }
  }
  if (!best) return
  const { eye, target } = best
  void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, transition)
}

/** A well fills the frame from the same angle: its rings, its pit and its body. */
function frameWell(
  controls: Controls,
  wellId: GravityWellId,
  pitches: number[],
  transition: boolean
) {
  framePoints(controls, wellHullPoints(wellId, WELL_MARGIN), pitches, transition)
}

export function CameraRigProvider({
  initialPreset = 'table',
  children,
}: {
  initialPreset?: CameraPreset
  children: ReactNode
}) {
  const handle = useRef<CameraRigHandle | null>(null)
  const [preset, setPresetState] = useState<CameraPreset>(initialPreset)
  const presetRef = useRef(preset)
  presetRef.current = preset

  const value = useMemo<CameraRigValue>(
    () => ({
      preset,
      handle,
      setPreset: next => {
        setPresetState(next)
        handle.current?.framePreset(next, true)
      },
      flyTo: wellId => handle.current?.frameWell(wellId, true),
      zoomBy: factor => handle.current?.zoomBy(factor),
      reset: () => handle.current?.framePreset(presetRef.current, true),
    }),
    [preset]
  )

  return <CameraRigContext.Provider value={value}>{children}</CameraRigContext.Provider>
}

/**
 * The rig itself. It lives inside the canvas and registers its imperative half
 * with the provider, which is what the HTML buttons on top of the canvas call.
 */
export function CameraRig({
  followWellId,
  rig,
}: {
  /** The well the Follow preset frames; it falls back to Table when absent. */
  followWellId?: GravityWellId
  rig: CameraRigValue
}) {
  const controls = useRef<Controls>(null)
  const followRef = useRef(followWellId)
  followRef.current = followWellId
  const presetRef = useRef(rig.preset)
  presetRef.current = rig.preset
  /** Set the moment a hand touches the camera: after that a resize leaves it alone. */
  const touched = useRef(false)
  const size = useThree(state => state.size)
  const camera = useThree(state => state.camera)

  const framePreset = useCallback((next: CameraPreset, transition: boolean) => {
    const rigControls = controls.current
    if (!rigControls) return
    touched.current = false
    if (next === 'follow' && followRef.current) {
      frameWell(rigControls, followRef.current, TABLE_PITCHES, transition)
      return
    }
    framePoints(
      rigControls,
      boardHullPoints(),
      next === 'top' ? [TOP_PITCH] : TABLE_PITCHES,
      transition
    )
  }, [])

  const { handle } = rig
  useEffect(() => {
    handle.current = {
      framePreset,
      frameWell: (wellId, transition) => {
        const rigControls = controls.current
        if (!rigControls) return
        touched.current = false
        frameWell(
          rigControls,
          wellId,
          presetRef.current === 'top' ? [TOP_PITCH] : TABLE_PITCHES,
          transition
        )
      },
      zoomBy: factor => {
        const rigControls = controls.current
        if (!rigControls) return
        touched.current = true
        void rigControls.dollyTo(
          MathUtils.clamp(rigControls.distance / factor, MIN_DISTANCE, MAX_DISTANCE),
          true
        )
      },
    }
    return () => {
      handle.current = null
    }
  }, [handle, framePreset])

  /**
   * The target may be trucked anywhere over the board and a little under it:
   * the funnel floor is the lowest thing anyone would want to look at.
   */
  const boundary = useMemo(() => {
    const floor = surfaceElevation('blackhole', 0) - BOARD_RELIEF
    return new Box3(
      new Vector3(BOARD_BOUNDS.x, floor, BOARD_BOUNDS.y),
      new Vector3(
        BOARD_BOUNDS.x + BOARD_BOUNDS.width,
        BOARD_RELIEF * 4,
        BOARD_BOUNDS.y + BOARD_BOUNDS.height
      )
    )
  }, [])

  useEffect(() => {
    const rigControls = controls.current
    if (!rigControls) return
    rigControls.setBoundary(boundary)
  }, [boundary])

  /*
   * Re-frame whenever the pane changes shape — the flat board's viewBox does
   * the same, and it is the only way the board fills a column that is 830 wide
   * on one screen and 1170 on the next. A camera someone has already dragged is
   * left where they put it.
   */
  useEffect(() => {
    if (touched.current) return
    framePreset(presetRef.current, false)
  }, [framePreset, size.width, size.height])

  /*
   * Dev only: what the headless screenshot checks measure. It projects the same
   * silhouette the framing solves for and reports where it landed on screen, so
   * "the board fills the pane" is a number rather than an impression.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __boardFrame?: () => unknown }
    host.__boardFrame = () => {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const point of boardHullPoints()) {
        const ndc = point.clone().project(camera)
        const x = (ndc.x * 0.5 + 0.5) * size.width
        const y = (1 - (ndc.y * 0.5 + 0.5)) * size.height
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      return {
        viewport: [size.width, size.height],
        box: [minX, minY, maxX, maxY].map(v => Math.round(v)),
        widthFraction: +((maxX - minX) / size.width).toFixed(3),
        heightFraction: +((maxY - minY) / size.height).toFixed(3),
        offCentre: [
          Math.round((minX + maxX) / 2 - size.width / 2),
          Math.round((minY + maxY) / 2 - size.height / 2),
        ],
      }
    }
    return () => {
      delete host.__boardFrame
    }
  }, [camera, size])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0}
      maxPolarAngle={MAX_POLAR}
      smoothTime={0.28}
      draggingSmoothTime={0.12}
      dollySpeed={0.6}
      truckSpeed={2}
      onControlStart={() => {
        touched.current = true
      }}
    />
  )
}
