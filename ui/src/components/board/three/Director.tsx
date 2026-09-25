/**
 * The auto camera: a director for the 3D board.
 *
 * It does two jobs. While a turn plays it films it: the animator names each
 * moment worth a shot (`CameraShot`) and waits a beat for the camera to get
 * there, and the director stands close enough to see the hull, behind a ship
 * that is jumping, beside one that is burning, over the shoulder of one that
 * is shooting with its target in the same frame. When the turn is over it
 * pulls back to what the player needs in order to act: the well their ship is
 * in, and any well the turn they are building reaches.
 *
 * Framing goes through the same solver as the presets (`framing.ts`), only
 * looking whichever way the shot wants and allowed closer than a hand may
 * dolly. The camera is eased here, per frame, rather than by the controls'
 * own transition, because a shot follows a moving hull and asking the
 * controls for a fresh transition sixty times a second is not what they are
 * for.
 *
 * Two things keep it from being seasick. Between shots of different ships it
 * cuts rather than swinging across the board: a whip-pan the length of the
 * table is what makes a camera nauseating, and a cut is what film does
 * instead. Within a shot, and between shots close enough to glide, it moves
 * on a critically damped spring, which starts from rest instead of lunging.
 * And it only pulls back to your well when it is your turn to plan (or after
 * the table has been quiet for a moment): pulling out between two bots' turns
 * only to dive straight back in was the pumping that made the first version
 * hard to watch.
 *
 * A hand wins. Touching the camera while a turn plays leaves the rest of that
 * turn to the hand; the next turn is filmed again.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { MathUtils, PerspectiveCamera, Vector3, type Object3D } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GravityWellId, Missile, Position } from '@dangerous-inclinations/engine'
import type { CameraShot } from '../../../context/AnimationContext'
import { allWells, wellCenter } from '../geometry'
import {
  MIN_DISTANCE,
  TABLE_PITCHES,
  WELL_MARGIN,
  framePoints,
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

/** How close a shot may stand to what it films: about four hull lengths. */
const CLOSE = 150
/** The spring's smoothing time, in seconds: roughly how long a glide takes to settle. */
const GLIDE = 0.8
/** A new shot further than this from where the camera is looking is a cut, not a glide. */
const CUT_DISTANCE = 320
/** So is one that faces further round than this: turning the camera half round is a whip-pan too. */
const CUT_TURN = 100
/** How long the table must be quiet on somebody else's turn before the camera pulls back. */
const PULL_BACK_DELAY = 1600
/** The controls' own transition time while the director drives them: the pull-back is slow. */
const PULL_BACK_SMOOTH = 0.9
/** The share of the frame a shot fills: tighter than a preset, it is a close-up. */
const SHOT_FILL = 0.78
/** Never closer to the surface under it than this. */
const EYE_CLEARANCE = 26
/** How fast a shot of one ship circles it, in radians a second. */
const ORBIT = 0.22

/**
 * How each shot stands. `pitch` is degrees above the plane, `margin` the room
 * left around a hull, and `turn` how far the camera stands off the line of
 * travel or of fire: 0 is straight behind, 90 square to the side.
 */
const SHOTS = {
  jump: { pitch: 16, margin: 52, turn: 0 },
  burn: { pitch: 22, margin: 50, turn: 62 },
  coast: { pitch: 30, margin: 64, turn: 70 },
  recoil: { pitch: 24, margin: 56, turn: 40 },
  duel: { pitch: 20, margin: 44, turn: 24 },
  missiles: { pitch: 28, margin: 46, turn: 12 },
  destroyed: { pitch: 22, margin: 74 },
  docked: { pitch: 30, margin: 60 },
  arrived: { pitch: 30, margin: 60 },
} as const

export interface DirectorProps {
  controls: RefObject<Controls | null>
  shot: CameraShot | null
  animating: boolean
  /** The wells the player has to see to act: their ship's, and any their plan reaches. */
  actWells: readonly GravityWellId[]
  missiles: readonly Missile[]
  /** When a hand last touched the camera (performance.now()), 0 if never. */
  handAt: RefObject<number>
  /** True while it is this seat's turn to plan: the pull-back comes at once. */
  myTurn: boolean
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

/** A horizontal unit vector from `from` to `to`, or null when they stand together. */
function heading(from: Vector3, to: Vector3): Vector3 | null {
  const out = new Vector3(to.x - from.x, 0, to.z - from.z)
  return out.lengthSq() < 1 ? null : out.normalize()
}

function rotateY(v: Vector3, degrees: number): Vector3 {
  return v.clone().applyAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(degrees))
}

/**
 * Stand `turn` degrees off a line. Of the two sides, the one nearer the way
 * the camera already faces wins, so a new shot does not swing the camera
 * round the table; between two that are about as near, the one looking in
 * toward the middle of the well (the black hole behind the action is the
 * better picture, and a camera outside the pit never looks up through its
 * wall).
 */
function offLine(
  line: Vector3,
  turn: number,
  subject: Vector3,
  wellId: GravityWellId,
  facing: Vector3
): Vector3 {
  if (turn === 0) return line
  const centre = wellCenter(wellId)
  const inward = new Vector3(centre.x - subject.x, 0, centre.y - subject.z)
  if (inward.lengthSq() > 0) inward.normalize()
  const left = rotateY(line, turn)
  const right = rotateY(line, -turn)
  const score = (side: Vector3) => side.dot(facing) + 0.35 * side.dot(inward)
  return score(left) >= score(right) ? left : right
}

/**
 * A critically damped spring toward `goal` (Unity's SmoothDamp), per axis:
 * it leaves from rest and arrives without overshoot, where an exponential
 * ease leaves at full speed.
 */
function smoothDamp(
  current: Vector3,
  goal: Vector3,
  velocity: Vector3,
  smoothTime: number,
  delta: number
) {
  const omega = 2 / smoothTime
  const x = omega * delta
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  for (const axis of ['x', 'y', 'z'] as const) {
    const change = current[axis] - goal[axis]
    const temp = (velocity[axis] + omega * change) * delta
    velocity[axis] = (velocity[axis] - omega * temp) * decay
    current[axis] = goal[axis] + (change + temp) * decay
  }
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

  /**
   * The sprung camera: where it is, how fast it is going, whether it has been
   * seeded from where the camera really is, and whether the shot has not yet
   * decided if it opens with a cut.
   */
  const eased = useRef({
    eye: new Vector3(),
    target: new Vector3(),
    eyeVelocity: new Vector3(),
    targetVelocity: new Vector3(),
    live: false,
    opening: false,
  })
  /** When the turn being played started: a touch after it hands that turn over. */
  const playbackAt = useRef(0)
  /** The way the camera faced when the current shot started, for the shots that circle. */
  const shotLook = useRef(new Vector3(0, 0, -1))
  /** Hulls by player id, looked up once a shot rather than once a frame. */
  const hulls = useRef(new Map<string, Object3D | null>())

  // The controls' floor is a hand's; a close-up goes under it, and it goes back
  // when the director leaves. So does the transition time the pull-back uses.
  useEffect(() => {
    const rig = controls.current
    if (!rig) return
    const smoothTime = rig.smoothTime
    rig.smoothTime = PULL_BACK_SMOOTH
    return () => {
      rig.minDistance = MIN_DISTANCE
      rig.smoothTime = smoothTime
    }
  }, [controls])

  useEffect(() => {
    if (animating) playbackAt.current = performance.now()
  }, [animating])

  // A new shot: forget the hulls (one may have died, one may have come back)
  // and remember which way the camera was facing.
  const shotId = shot?.id
  useEffect(() => {
    hulls.current.clear()
    eased.current.opening = true
    const rig = controls.current
    if (!rig || !shotId) return
    const target = rig.getTarget(new Vector3())
    const look = heading(camera.position, target)
    if (look) shotLook.current.copy(look)
  }, [shotId, controls, camera])

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
      if (!rig) return
      eased.current.live = false
      rig.minDistance = MIN_DISTANCE
      const wells = actKey ? (actKey.split(',') as GravityWellId[]) : ['blackhole' as const]
      const points = wells.flatMap(well =>
        well === 'blackhole' ? homeHullPoints() : wellHullPoints(well, WELL_MARGIN)
      )
      framePoints(rig, points, TABLE_PITCHES, true)
    }
    // On your turn you need the board now. On somebody else's the next bot
    // is usually a moment away, and the camera holds its last shot for it.
    if (myTurn) {
      pullBack()
      return
    }
    const timer = setTimeout(pullBack, PULL_BACK_DELAY)
    return () => clearTimeout(timer)
  }, [idle, myTurn, actKey, controls, size.width, size.height])

  const scratch = useMemo(
    () => ({ goalEye: new Vector3(), goalTarget: new Vector3(), points: [] as Vector3[] }),
    []
  )

  /** Where a ship's hull is drawn this frame, or where the shot says it was. */
  const hullAt = (playerId: string, fallback: Position): Vector3 => {
    let hull = hulls.current.get(playerId)
    if (hull === undefined || (hull && !hull.parent)) {
      hull = scene.getObjectByName(`ship:${playerId}`) ?? null
      hulls.current.set(playerId, hull)
    }
    return hull ? hull.getWorldPosition(new Vector3()) : positionWorld(fallback)
  }

  useFrame((_, delta) => {
    const rig = controls.current
    if (!rig || !shot || !(camera instanceof PerspectiveCamera)) return
    if (handAt.current > playbackAt.current) {
      eased.current.live = false
      return
    }

    const points = scratch.points
    points.length = 0
    let look: Vector3
    let pitch: number

    switch (shot.kind) {
      case 'move': {
        const style = SHOTS[shot.move]
        const hull = hullAt(shot.playerId, shot.to)
        const from = positionWorld(shot.from)
        const to = positionWorld(shot.to)
        const line = heading(from, to) ?? shotLook.current
        look = offLine(line, style.turn, hull, shot.to.wellId, shotLook.current)
        pitch = style.pitch
        around(hull, style.margin, points)
        // A jump is filmed from behind, with room ahead of the nose; the other
        // moves keep where the ship is going in the picture.
        if (shot.move === 'jump')
          points.push(hull.clone().addScaledVector(line, style.margin * 1.6))
        else around(to, style.margin * 0.6, points)
        break
      }
      case 'duel': {
        const style = SHOTS.duel
        const attacker = hullAt(shot.attackerId, shot.from)
        const target = hullAt(shot.targetId, shot.to)
        const line = heading(attacker, target) ?? shotLook.current
        look = offLine(line, style.turn, attacker, shot.from.wellId, shotLook.current)
        // Two ships far apart make a long thin frame; a higher camera fits it closer.
        pitch = MathUtils.clamp(style.pitch + attacker.distanceTo(target) / 45, style.pitch, 42)
        // Two hulls side by side in one sector would frame as a wall of hull and
        // sector number: the closer they are, the more room the shot leaves.
        const margin = style.margin + Math.max(0, 120 - attacker.distanceTo(target)) * 0.45
        around(attacker, margin, points)
        around(target, margin, points)
        break
      }
      case 'missiles': {
        const style = SHOTS.missiles
        const target = hullAt(shot.targetId, shot.at)
        around(target, style.margin, points)
        const incoming = missiles.filter(m => m.targetId === shot.targetId)
        const centroid = new Vector3()
        for (const missile of incoming) {
          const at = positionWorld(missile)
          around(at, style.margin * 0.5, points)
          centroid.add(at)
        }
        const line =
          incoming.length > 0
            ? (heading(centroid.divideScalar(incoming.length), target) ?? shotLook.current)
            : shotLook.current
        look = offLine(line, style.turn, target, shot.at.wellId, shotLook.current)
        pitch = style.pitch
        break
      }
      case 'ship': {
        const style = SHOTS[shot.mood]
        const at = hullAt(shot.playerId, shot.at)
        around(at, style.margin, points)
        const seconds = (performance.now() - shot.start) / 1000
        look = rotateY(shotLook.current, MathUtils.radToDeg(seconds * ORBIT))
        pitch = style.pitch
        break
      }
    }

    const solved = solveEye(camera, points, pitch, SHOT_FILL, { look, minDistance: CLOSE })
    if (!solved) return
    const { goalEye, goalTarget } = scratch
    goalEye.copy(solved.eye)
    goalTarget.copy(solved.target)
    goalEye.y = Math.max(goalEye.y, floorUnder(goalEye) + EYE_CLEARANCE)

    const state = eased.current
    if (!state.live) {
      state.eye.copy(camera.position)
      rig.getTarget(state.target)
      state.eyeVelocity.set(0, 0, 0)
      state.targetVelocity.set(0, 0, 0)
      state.live = true
    }
    if (state.opening) {
      state.opening = false
      // Somewhere else on the table, or facing another way: cut rather than fly.
      const was = heading(state.eye, state.target)
      const will = heading(goalEye, goalTarget)
      const turn = was && will ? MathUtils.radToDeg(was.angleTo(will)) : 0
      if (state.target.distanceTo(goalTarget) > CUT_DISTANCE || turn > CUT_TURN) {
        state.eye.copy(goalEye)
        state.target.copy(goalTarget)
        state.eyeVelocity.set(0, 0, 0)
        state.targetVelocity.set(0, 0, 0)
      }
    }
    // A frame that took a long time (a tab brought back, a hitch) must not fling the spring.
    const step = Math.min(delta, 0.05)
    smoothDamp(state.eye, goalEye, state.eyeVelocity, GLIDE, step)
    smoothDamp(state.target, goalTarget, state.targetVelocity, GLIDE, step)
    rig.minDistance = CLOSE * 0.5
    void rig.setLookAt(
      state.eye.x,
      state.eye.y,
      state.eye.z,
      state.target.x,
      state.target.y,
      state.target.z,
      false
    )
  })

  return null
}
