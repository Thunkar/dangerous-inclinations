/**
 * The auto camera: a director for the 3D board, shooting like a broadcast.
 *
 * It does two jobs. While a turn plays it films it: the animator names each
 * moment worth a shot (`CameraShot`) and waits a beat for the camera to get
 * there, and the director frames it close: the whole of a move, attacker and
 * target together in a duel, the missiles and the ship they are closing on.
 * When the turn is over it pulls back to what the player needs in order to
 * act: the well their ship is in, and any well the turn they are building
 * reaches.
 *
 * **It never turns.** Two earlier versions filmed each shot from its own
 * angle, behind a jumping hull or over a shooter's shoulder, and either swung
 * the camera round between shots or cut, and both were hard to watch: what
 * makes a moving camera nauseating is the view rotating and the table tilting
 * under it. So this one works like the camera over a football pitch. It faces
 * the way the camera faced when the director took over (the table's own view,
 * or wherever a hand last left it), stands at one pitch, and does everything
 * else by panning and zooming. The only tilt it allows is a few degrees up, for
 * a shot the black hole would otherwise hide.
 *
 * **It never cuts either.** A shot close by is reached by a glide. A shot
 * across the table is reached the way a map flies between two cities: it pulls
 * out far enough to hold both, crosses, and comes back in, so the move reads as
 * travel rather than as a whip. Once there it tracks on a critically damped
 * spring and eases in a little while the moment holds.
 *
 * Framing goes through the same solver as the presets (`framing.ts`), allowed
 * closer than a hand may dolly. The camera is set here, per frame, rather than
 * by the controls' own transition, because a shot follows a moving hull.
 *
 * It only pulls back to your well when it is your turn to plan (or after the
 * table has been quiet for a moment), so it does not pump out and back in
 * between two bots' turns. A hand wins: touching the camera while a turn plays
 * leaves the rest of that turn, and the pull-back after it, to the hand.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { MathUtils, PerspectiveCamera, Vector3, type Object3D } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GravityWellId, Position } from '@dangerous-inclinations/engine'
import type { CameraShot } from '../../../animation/beats'
import type { MissileToken } from '../model'
import { allWells, wellCenter, wellVisual } from '../geometry'
import { blackHoleBody, bodyExtent } from './bodies'
import {
  FRAME_FILL,
  MAX_DISTANCE,
  MIN_DISTANCE,
  TABLE_PITCHES,
  WELL_MARGIN,
  forwardOf,
  solveEye,
  type Controls,
} from './framing'
import {
  homeHullPoints,
  plateRadius,
  positionWorld,
  surfaceElevation,
  wellHullPoints,
} from './world'

/** Degrees above the plane every shot is taken from: lower than the table's 62°, never low. */
const PITCH = 50
/** Extra pitch tried, in order, when the black hole would hide the shot. */
const LIFTS = [0, 12, 24] as const
/** How close a shot may stand to what it films: about four hull lengths. */
const CLOSE = 150
/** The share of the frame a shot fills. */
const SHOT_FILL = 0.74
/** Room left round a hull in every shot. */
const MARGIN = 55
/** The spring that tracks a shot once the camera has arrived, in seconds. */
const TRACK = 0.7
/** How long a transition takes: a short glide, up to a long crossing. */
const GLIDE_MIN = 0.8
const GLIDE_MAX = 1.8
/** How far a held shot eases in, as a share of its distance, and over how long. */
const PUSH_IN = 0.08
const PUSH_SECONDS = 3.5
/** How long the table must be quiet on somebody else's turn before the camera pulls back. */
const PULL_BACK_DELAY = 1600
/** Never closer to the surface under it than this. */
const EYE_CLEARANCE = 26

export interface DirectorProps {
  controls: RefObject<Controls | null>
  shot: CameraShot | null
  animating: boolean
  /** The wells the player has to see to act: their ship's, and any their plan reaches. */
  actWells: readonly GravityWellId[]
  missiles: readonly MissileToken[]
  /** When a hand last touched the camera (performance.now()), 0 if never. */
  handAt: RefObject<number>
  /** True while it is this seat's turn to plan: the pull-back comes at once. */
  myTurn: boolean
}

/** A camera pose as the director thinks of it: what it looks at, from how far, how steeply. */
interface Pose {
  target: Vector3
  distance: number
  pitch: number
}

/** A little cloud of points around a hull, so a framing leaves room for it. */
function around(at: Vector3, margin: number, into: Vector3[]) {
  into.push(
    at.clone().add(new Vector3(margin, 0, 0)),
    at.clone().add(new Vector3(-margin, 0, 0)),
    at.clone().add(new Vector3(0, 0, margin)),
    at.clone().add(new Vector3(0, 0, -margin)),
    at.clone().add(new Vector3(0, margin * 0.7, 0))
  )
}

/** Ease with no corner at either end. */
function smoother(t: number): number {
  const x = MathUtils.clamp(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** A critically damped spring toward `goal` (Unity's SmoothDamp), for one number. */
function smoothDamp(
  current: number,
  goal: number,
  velocity: { v: number },
  smoothTime: number,
  delta: number
): number {
  const omega = 2 / smoothTime
  const x = omega * delta
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - goal
  const temp = (velocity.v + omega * change) * delta
  velocity.v = (velocity.v - omega * temp) * decay
  return goal + (change + temp) * decay
}

/**
 * Where each body is and how much room it takes: the eye is kept out of this
 * sphere round every body, so no framing puts the camera inside the horizon or
 * in the disc's glare.
 */
function bodySpheres(): { centre: Vector3; radius: number }[] {
  return allWells().map(well => {
    const centre = wellCenter(well.id)
    if (well.id === 'blackhole') {
      const hole = blackHoleBody()
      return {
        centre: new Vector3(centre.x, hole.centerY, centre.y),
        radius: Math.max(hole.radius * 1.8, hole.discBright),
      }
    }
    const radius = wellVisual(well.id).bodyRadius
    return {
      centre: new Vector3(centre.x, surfaceElevation(well.id, 0) + radius, centre.y),
      radius: bodyExtent(well.id) * 1.25,
    }
  })
}

let spheres: ReturnType<typeof bodySpheres> | null = null

/** Whether a point is inside any body's sphere. */
function insideABody(point: Vector3): boolean {
  spheres ??= bodySpheres()
  return spheres.some(({ centre, radius }) => point.distanceTo(centre) < radius)
}

/**
 * Whether the black hole stands between the eye and what it is looking at.
 * Only the horizon counts: seeing a ship through the disc's light is a good
 * picture, a ship behind the horizon is not in the picture at all.
 */
function hiddenByHole(eye: Vector3, target: Vector3): boolean {
  const hole = blackHoleBody()
  const centre = wellCenter('blackhole')
  const c = new Vector3(centre.x, hole.centerY, centre.y)
  const line = target.clone().sub(eye)
  const t = MathUtils.clamp(c.clone().sub(eye).dot(line) / line.lengthSq(), 0, 1)
  return eye.clone().addScaledVector(line, t).distanceTo(c) < hole.radius * 1.15
}

/** The surface under a point: the floor of whichever well's plate it is over, else the table. */
function floorUnder(point: Vector3): number {
  for (const well of allWells()) {
    const centre = wellCenter(well.id)
    const distance = Math.hypot(point.x - centre.x, point.z - centre.y)
    if (distance < plateRadius(well.id)) return surfaceElevation(well.id, distance)
  }
  return 0
}

export function Director({
  controls,
  shot,
  animating,
  actWells,
  missiles,
  handAt,
  myTurn,
}: DirectorProps) {
  const camera = useThree(state => state.camera)
  const scene = useThree(state => state.scene)
  const size = useThree(state => state.size)

  /** The compass direction every shot faces: taken from the camera, never changed by a shot. */
  const look = useRef(new Vector3(0, 0, -1))
  /** The pose the camera is in, as the director last set it. */
  const pose = useRef<Pose | null>(null)
  /** Spring velocities for tracking a shot once it has arrived. */
  const velocity = useRef({ x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, d: { v: 0 }, p: { v: 0 } })
  /**
   * The move under way: where it started, when, for how long, and how far it
   * pulls out on the way. Null once the camera has arrived and is tracking.
   */
  const move = useRef<{ from: Pose; at: number; seconds: number; rise: number } | null>(null)
  /** What the camera is filming: a shot, the pull-back, or nothing (a hand has it). */
  const mode = useRef<'shot' | 'idle' | null>(null)
  /** The pull-back's framing, solved once when it starts. */
  const idleGoal = useRef<Pose | null>(null)
  /** The lift this shot settled on, chosen once so the camera does not hop between them. */
  const lift = useRef<number | null>(null)
  /** When the director last took the camera: a touch after it hands the camera back. */
  const tookAt = useRef(0)
  /** Hulls by player id, looked up once a shot rather than once a frame. */
  const hulls = useRef(new Map<string, Object3D | null>())

  // The controls' floor is a hand's; a close-up goes under it, and it goes back
  // when the director leaves.
  useEffect(() => {
    const rig = controls.current
    return () => {
      if (rig) rig.minDistance = MIN_DISTANCE
    }
  }, [controls])

  /** Take the camera from wherever it is: its facing becomes the compass for what follows. */
  const take = () => {
    const rig = controls.current
    if (!rig) return
    const target = rig.getTarget(new Vector3())
    const facing = new Vector3(target.x - camera.position.x, 0, target.z - camera.position.z)
    if (facing.lengthSq() > 1) look.current.copy(facing.normalize())
    const offset = camera.position.clone().sub(target)
    const distance = offset.length()
    pose.current = {
      target,
      distance,
      pitch: MathUtils.radToDeg(Math.asin(MathUtils.clamp(offset.y / distance, -1, 1))),
    }
    tookAt.current = performance.now()
  }

  /** Start a move from the pose the camera is in now. */
  const startMove = () => {
    if (!pose.current) take()
    if (!pose.current) return
    move.current = {
      from: { ...pose.current, target: pose.current.target.clone() },
      at: performance.now(),
      seconds: 0,
      rise: 0,
    }
    velocity.current = { x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, d: { v: 0 }, p: { v: 0 } }
  }

  // A playback takes the camera afresh, so a hand's last angle is respected.
  useEffect(() => {
    if (animating) take()
    // `take` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animating])

  // A new shot: forget the hulls (one may have died, one may have come back)
  // and start moving to it.
  const shotId = shot?.id
  useEffect(() => {
    hulls.current.clear()
    lift.current = null
    if (!shotId) return
    if (handAt.current > tookAt.current) return
    mode.current = 'shot'
    startMove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotId])

  /**
   * Between turns: pull back to what the player needs to see. Keyed on the
   * wells and the pane, so it re-frames when the plan reaches a new well or the
   * column changes shape, and otherwise leaves a hand's camera alone.
   */
  const idle = !animating && !shot
  const actKey = actWells.join(',')
  useEffect(() => {
    if (!idle) return
    const pullBack = () => {
      const rig = controls.current
      if (!rig || !(camera instanceof PerspectiveCamera)) return
      if (mode.current === null && handAt.current > tookAt.current) take()
      const wells = actKey ? (actKey.split(',') as GravityWellId[]) : ['blackhole' as const]
      const points = wells.flatMap(well =>
        well === 'blackhole' ? homeHullPoints() : wellHullPoints(well, WELL_MARGIN)
      )
      const solved = solveEye(camera, points, TABLE_PITCHES[0], FRAME_FILL, {
        look: look.current,
      })
      if (!solved) return
      idleGoal.current = {
        target: solved.target,
        distance: solved.eye.distanceTo(solved.target),
        pitch: TABLE_PITCHES[0],
      }
      mode.current = 'idle'
      startMove()
    }
    // On your turn you need the board now. On somebody else's the next bot
    // is usually a moment away, and the camera holds its last shot for it.
    if (myTurn) {
      pullBack()
      return
    }
    const timer = setTimeout(pullBack, PULL_BACK_DELAY)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle, myTurn, actKey, size.width, size.height])

  const scratch = useMemo(() => ({ points: [] as Vector3[] }), [])

  /** Where a ship's hull is drawn this frame, or where the shot says it was. */
  const hullAt = (playerId: string, fallback: Position): Vector3 => {
    let hull = hulls.current.get(playerId)
    if (hull === undefined || (hull && !hull.parent)) {
      hull = scene.getObjectByName(`ship:${playerId}`) ?? null
      hulls.current.set(playerId, hull)
    }
    return hull ? hull.getWorldPosition(new Vector3()) : positionWorld(fallback)
  }

  /** The points a shot has to hold, all of them, wherever the camera faces. */
  const shotPoints = (current: CameraShot): Vector3[] => {
    const points = scratch.points
    points.length = 0
    switch (current.kind) {
      case 'move': {
        // The whole of the move: the hull slides across a frame that stays put,
        // rather than the camera chasing it.
        around(hullAt(current.playerId, current.to), MARGIN, points)
        around(positionWorld(current.from), MARGIN * 0.8, points)
        around(positionWorld(current.to), MARGIN * 0.8, points)
        break
      }
      case 'duel': {
        const attacker = hullAt(current.attackerId, current.from)
        const target = hullAt(current.targetId, current.to)
        // Two hulls side by side in one sector would frame as a wall of hull and
        // sector number: the closer they are, the more room the shot leaves.
        const margin = MARGIN + Math.max(0, 120 - attacker.distanceTo(target)) * 0.45
        around(attacker, margin, points)
        around(target, margin, points)
        break
      }
      case 'missiles': {
        around(hullAt(current.targetId, current.at), MARGIN, points)
        for (const missile of missiles) {
          if (missile.targetId === current.targetId)
            around(positionWorld(missile.position), MARGIN * 0.5, points)
        }
        break
      }
      case 'ship':
        around(hullAt(current.playerId, current.at), MARGIN * 1.4, points)
        break
    }
    return points
  }

  useFrame((_, delta) => {
    const rig = controls.current
    if (!rig || !mode.current || !(camera instanceof PerspectiveCamera)) return
    // A hand on the camera ends the director's hold on it until the next turn.
    if (handAt.current > tookAt.current) {
      mode.current = null
      move.current = null
      return
    }

    // Where this frame wants the camera.
    let goal: Pose | null = null
    if (mode.current === 'idle') {
      goal = idleGoal.current
    } else if (shot) {
      const points = shotPoints(shot)
      const solveAt = (pitch: number) =>
        solveEye(camera, points, pitch, SHOT_FILL, { look: look.current, minDistance: CLOSE })
      if (lift.current === null) {
        lift.current = LIFTS[0]
        for (const candidate of LIFTS) {
          const trial = solveAt(PITCH + candidate)
          if (trial && !hiddenByHole(trial.eye, trial.target)) {
            lift.current = candidate
            break
          }
        }
      }
      const pitch = PITCH + lift.current
      const solved = solveAt(pitch)
      if (solved) {
        const held = (performance.now() - shot.start) / 1000
        goal = {
          target: solved.target,
          distance:
            solved.eye.distanceTo(solved.target) *
            (1 - PUSH_IN * smoother((held - 1) / PUSH_SECONDS)),
          pitch,
        }
      }
    }
    if (!goal || !pose.current) return

    const now = performance.now()
    const current = pose.current
    const going = move.current
    if (going) {
      if (going.seconds === 0) {
        // Sized on the first frame the goal is known: a glide for a short hop, a
        // longer crossing that pulls out to hold both ends for a long one.
        const span = new Vector3(
          goal.target.x - going.from.target.x,
          0,
          goal.target.z - going.from.target.z
        ).length()
        const near = Math.max(1, Math.min(going.from.distance, goal.distance))
        going.seconds = MathUtils.clamp(
          GLIDE_MIN + 0.45 * Math.log2(1 + span / near),
          GLIDE_MIN,
          GLIDE_MAX
        )
        const needed = span * 0.95
        going.rise = MathUtils.clamp(
          needed - (going.from.distance + goal.distance) / 2,
          0,
          MAX_DISTANCE - Math.max(going.from.distance, goal.distance)
        )
      }
      const s = smoother((now - going.at) / 1000 / going.seconds)
      current.target.lerpVectors(going.from.target, goal.target, s)
      current.distance =
        MathUtils.lerp(going.from.distance, goal.distance, s) + going.rise * Math.sin(Math.PI * s)
      current.pitch = MathUtils.lerp(going.from.pitch, goal.pitch, s)
      if (s >= 1) {
        move.current = null
        // The pull-back is a place to arrive at, not a shot to track: once
        // there, the camera is the player's.
        if (mode.current === 'idle') mode.current = null
      }
    } else {
      const step = Math.min(delta, 0.05)
      const v = velocity.current
      current.target.set(
        smoothDamp(current.target.x, goal.target.x, v.x, TRACK, step),
        smoothDamp(current.target.y, goal.target.y, v.y, TRACK, step),
        smoothDamp(current.target.z, goal.target.z, v.z, TRACK, step)
      )
      current.distance = smoothDamp(current.distance, goal.distance, v.d, TRACK, step)
      current.pitch = smoothDamp(current.pitch, goal.pitch, v.p, TRACK, step)
    }

    // Out of the bodies and off the floor by backing away along the line of
    // sight, never by stepping sideways: a sideways step turns the view.
    const forward = forwardOf(look.current, current.pitch)
    let back = current.distance
    const eye = current.target.clone().addScaledVector(forward, -back)
    for (let i = 0; i < 24; i++) {
      if (!insideABody(eye) && eye.y >= floorUnder(eye) + EYE_CLEARANCE) break
      back *= 1.12
      eye.copy(current.target).addScaledVector(forward, -back)
    }
    rig.minDistance = CLOSE * 0.5
    void rig.setLookAt(
      eye.x,
      eye.y,
      eye.z,
      current.target.x,
      current.target.y,
      current.target.z,
      false
    )
  })

  return null
}
