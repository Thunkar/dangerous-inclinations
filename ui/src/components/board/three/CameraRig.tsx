/**
 * The camera rig: damped orbit, pan and dolly, bounded to the board.
 *
 * The board is a table, not a world, so the camera is kept honest: it cannot
 * be trucked off the edge, cannot dolly further out than the whole board or
 * closer in than one well, and never drops below the plane where the numbers
 * would go edge-on. Three presets frame it: Table (three-quarter from the near
 * edge, the default), Top (the 2D board with lighting) and Follow (the well
 * your own ship is in). `flyTo` is what a double-click on a body calls.
 *
 * A preset opens on the black hole rather than on the whole board. The board is
 * a triangle of wells 2652 units across and fitting all of it leaves each well a
 * fifth of the screen, while the game is played almost entirely in the one at
 * the centre (`HOME_VIEW_RADIUS` in `geometry.ts`). Recentre is what puts the
 * camera back in that opening view, from wherever a hand has taken it, and a
 * resize re-applies it.
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
import { BOARD_BOUNDS, HOME_VIEW_RADIUS, PRINT_SCALE, ringRadius, wellVisual } from '../geometry'
import {
  BOARD_RELIEF,
  BOARD_SPAN,
  CAMERA_NEAR,
  boardHullPoints,
  homeHullPoints,
  ringElevation,
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
 * Table is a three-quarter view at 62°, and stays there for as long as the pane
 * is wider than it is tall. A board seen from 62° is a little wider than it is
 * deep, so in a squarish column it would fill the width and leave some of the
 * height empty; the rig then stands the camera up by as little as it takes to
 * use that height. On a wide pane every candidate but the first loses, so
 * nothing changes.
 *
 * It was 55°, and the seven degrees were bought rather than chosen. Everything
 * the black hole draws has to stay below the far side of ring 1's numbers as
 * they land *on screen*, and at a pitch P that ceiling is `ink·sin P` while a
 * horizon resting in the pit reaches `r·(1 + 0.95·cos P)`, so a degree of
 * pitch is worth about a percent of black hole (`three/bodies.ts` does the
 * arithmetic). 62° buys the body a fifth of its radius, hands the sector
 * numbers 8% less foreshortening with it, and is still plainly a three-quarter
 * view rather than a plan. `bodies.ts` reads the same number and must be kept
 * in step with the first entry here.
 */
const TABLE_PITCHES = [62, 66, 70, 75]
const TOP_PITCH = 89.9

/**
 * The fraction of the shorter frame axis the board is asked to fill. A tenth of
 * the frame as margin reads as breathing room; much less and the near corner of
 * the board touches the edge of the pane.
 */
const FRAME_FILL = 0.9

/**
 * Room left around one well when it is framed on its own: empty board, so it
 * is a share of a framing rather than a number of units, and it stays where it
 * is on screen however the board is redrawn.
 *
 * It is a share of the view the board opens in, not of the board's span, for
 * the same reason the printed sizes are: the board is never seen whole, so its
 * span is not what this margin is seen against. Measured against the span, the
 * planets would have been pushed a tenth further away the moment the black hole
 * grew, which has nothing to do with the planets.
 */
const WELL_MARGIN = HOME_VIEW_RADIUS * 0.0826

/** How much more board a steeper Table camera must show before it is taken. */
const PITCH_GAIN = 1.15

/**
 * How far in and out a hand may dolly, as shares of the board's span. They were
 * 180 and 4400 units when the board spanned 1656 of them; written this way they
 * are the same two pictures (a camera dipped right into the plate, and one far
 * enough back to hold the whole board at the narrowest pane the table makes)
 * on a board of any size. The framing solver brackets its search with the far
 * one, so a board that outgrew it would simply be framed from too close.
 */
const MIN_DISTANCE = BOARD_SPAN * 0.109
const MAX_DISTANCE = BOARD_SPAN * 2.66
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
  /** The view the board opened in: what Recentre puts it back to. */
  const openedIn = useRef(initialPreset)

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
      /*
       * Recentre puts the board back where it was when you sat down: the same
       * framing, the same pitch, the same constant. It is the only control that
       * reaches the three-quarter view (that preset lost its button for being
       * the same thing twice) so it also drops Top or Follow if one of them is
       * selected, which is the whole of what "put it back" can mean.
       *
       * It used to fit the whole board instead. That picture is still there for
       * a hand that zooms out, and it is a poorer default than it sounds: four
       * wells over a triangle 2652 units across leave each of them a fifth of
       * the pane, and the game is played in one of them.
       */
      reset: () => {
        setPresetState(openedIn.current)
        handle.current?.framePreset(openedIn.current, true)
      },
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
  /** Which of the two framings a resize should re-solve: the well, or the board. */
  const framing = useRef<'home' | 'all'>('home')
  const size = useThree(state => state.size)
  const camera = useThree(state => state.camera)
  const scene = useThree(state => state.scene)

  const framePreset = useCallback((next: CameraPreset, transition: boolean) => {
    const rigControls = controls.current
    if (!rigControls) return
    touched.current = false
    framing.current = 'home'
    if (next === 'follow' && followRef.current) {
      frameWell(rigControls, followRef.current, TABLE_PITCHES, transition)
      return
    }
    framePoints(
      rigControls,
      homeHullPoints(),
      next === 'top' ? [TOP_PITCH] : TABLE_PITCHES,
      transition
    )
  }, [])

  /**
   * Everything on the table at once, at the current angle.
   *
   * No control calls this: Recentre restores the opening view instead, and
   * zooming out reaches the whole board by hand. It stays on the handle because
   * it is the honest fit-everything framing and the resize solver still knows
   * how to re-apply it.
   */
  const frameAll = useCallback((transition: boolean) => {
    const rigControls = controls.current
    if (!rigControls) return
    touched.current = false
    framing.current = 'all'
    framePoints(
      rigControls,
      boardHullPoints(),
      presetRef.current === 'top' ? [TOP_PITCH] : TABLE_PITCHES,
      transition
    )
  }, [])

  const { handle } = rig
  useEffect(() => {
    handle.current = {
      framePreset,
      frameAll,
      frameWell: (wellId, transition) => {
        const rigControls = controls.current
        if (!rigControls) return
        touched.current = false
        framing.current = 'home'
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
  }, [handle, framePreset, frameAll])

  /**
   * The target may be trucked anywhere over the board and a little under it:
   * the funnel floor is the lowest thing anyone would want to look at. Both
   * come from the board itself (the box is `BOARD_BOUNDS`, the floor is the
   * funnel's) so opening the board out moved the clamp with it and there is
   * nothing here fitted to a board of a particular size.
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
   * Re-frame whenever the pane changes shape. The flat board's viewBox does
   * the same, and it is the only way the board fills a column that is 830 wide
   * on one screen and 1170 on the next. A camera someone has already dragged is
   * left where they put it.
   */
  useEffect(() => {
    if (touched.current) return
    if (framing.current === 'all') frameAll(false)
    else framePreset(presetRef.current, false)
  }, [framePreset, frameAll, size.width, size.height])

  /*
   * Dev only: what the headless screenshot checks measure. It projects the same
   * silhouette the framing solves for and reports where it landed on screen, so
   * "the board fills the pane" is a number rather than an impression.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as {
      __boardFrame?: () => unknown
      __boardLookAt?: (name: string, distance?: number, pitch?: number) => unknown
    }
    /**
     * Frame a named object in the scene, for close-up screenshots of a model
     * while it is being worked on. `__boardFrame` measures where the board
     * landed; this puts the camera somewhere worth measuring from. The dolly
     * clamp still applies, so a small object frames as small as the board lets
     * it.
     */
    host.__boardLookAt = (name, distance = MIN_DISTANCE, pitch = 0.5) => {
      const target = scene.getObjectByName(name)
      if (!target) return `no object named ${name}`
      const at = target.getWorldPosition(new Vector3())
      const flat = distance * Math.cos(pitch)
      // The board's dolly floor is set for playing on; a close-up of one model
      // is exactly the case it is wrong for, so this hook lifts it.
      if (controls.current) controls.current.minDistance = Math.min(MIN_DISTANCE, distance)
      controls.current?.setLookAt(
        at.x + flat,
        at.y + distance * Math.sin(pitch),
        at.z + flat,
        at.x,
        at.y,
        at.z,
        false
      )
      return { name, at: at.toArray().map(Math.round), distance }
    }
    /** Screen half-width and half-height of a circle drawn flat on the board. */
    const circleOnScreen = (radius: number, elevation: number) => {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < 64; i++) {
        const angle = (i / 64) * Math.PI * 2
        const ndc = new Vector3(
          Math.cos(angle) * radius,
          elevation,
          Math.sin(angle) * radius
        ).project(camera)
        const x = (ndc.x * 0.5 + 0.5) * size.width
        const y = (1 - (ndc.y * 0.5 + 0.5)) * size.height
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      return { width: +(maxX - minX).toFixed(1), height: +(maxY - minY).toFixed(1) }
    }
    host.__boardFrame = () => {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const silhouette = framing.current === 'all' ? boardHullPoints() : homeHullPoints()
      for (const point of silhouette) {
        const ndc = point.clone().project(camera)
        const x = (ndc.x * 0.5 + 0.5) * size.width
        const y = (1 - (ndc.y * 0.5 + 0.5)) * size.height
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      // Every black hole ring as it lands on screen. The spacing checks read
      // this: a ring gap in board units says nothing, because both renderers
      // fit whatever board they are handed, so the gap has to be measured
      // across the screen like everything else.
      const ringsPx = [1, 2, 3, 4, 5].map(ring =>
        circleOnScreen(ringRadius('blackhole', ring), ringElevation('blackhole', ring))
      )
      return {
        framing: framing.current,
        viewport: [size.width, size.height],
        // What the legibility checks measure: how much of the pane the black
        // hole's own well and its body actually occupy.
        ring5: ringsPx[4],
        body: circleOnScreen(wellVisual('blackhole').bodyRadius, surfaceElevation('blackhole', 0)),
        ringsPx,
        /** Screen pixels per board unit, across the screen where nothing is foreshortened. */
        scale: +(
          (ringsPx[4].width - ringsPx[0].width) /
          (2 * (ringRadius('blackhole', 5) - ringRadius('blackhole', 1)))
        ).toFixed(4),
        print: +PRINT_SCALE.toFixed(4),
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
      delete host.__boardLookAt
    }
  }, [camera, scene, size])

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
