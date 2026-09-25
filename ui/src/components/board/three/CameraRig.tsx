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
import { Box3, MathUtils, Vector3 } from 'three'
import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { BOARD_BOUNDS, PRINT_SCALE, ringRadius, wellVisual } from '../geometry'
import {
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  TABLE_PITCHES,
  TOP_PITCH,
  WELL_MARGIN,
  framePoints,
  type Controls,
} from './framing'
import {
  BOARD_RELIEF,
  boardHullPoints,
  homeHullPoints,
  ringElevation,
  surfaceElevation,
  wellHullPoints,
} from './world'
import { Director, type DirectorProps } from './Director'
import {
  CameraRigContext,
  type CameraPreset,
  type CameraRigHandle,
  type CameraRigValue,
} from './cameraRigContext'

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
  /**
   * The view the board opened in: what Recentre puts it back to. A board that
   * opened on Auto recentres to the three-quarter view, since Auto is not a
   * place to go back to.
   */
  const openedIn = useRef<CameraPreset>(initialPreset === 'auto' ? 'table' : initialPreset)

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
  director,
}: {
  /** The well the Follow preset frames; it falls back to Table when absent. */
  followWellId?: GravityWellId
  rig: CameraRigValue
  /** What the Auto preset films; the director only runs while it is selected. */
  director: Omit<DirectorProps, 'controls' | 'handAt'>
}) {
  const controls = useRef<Controls>(null)
  /** When a hand last moved the camera: the director gives way to it. */
  const handAt = useRef(0)
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
  const gl = useThree(state => state.gl)

  const framePreset = useCallback((next: CameraPreset, transition: boolean) => {
    const rigControls = controls.current
    if (!rigControls) return
    touched.current = false
    framing.current = 'home'
    // The director frames Auto itself, the moment it mounts.
    if (next === 'auto') return
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
        handAt.current = performance.now()
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
        handAt.current = performance.now()
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
    /**
     * What the scene is holding: objects, GPU buffers and what the last frame
     * drew. A board that slows down over a long game is holding more of
     * something, and this says which.
     */
    ;(host as { __boardProbe?: () => unknown }).__boardProbe = () => {
      let objects = 0
      scene.traverse(() => {
        objects++
      })
      return {
        objects,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      }
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
  }, [camera, scene, size, gl])

  return (
    <>
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
          handAt.current = performance.now()
        }}
      />
      {rig.preset === 'auto' && <Director controls={controls} handAt={handAt} {...director} />}
    </>
  )
}
