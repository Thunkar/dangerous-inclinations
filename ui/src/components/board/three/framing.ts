/**
 * The framing solver, shared by the rig's presets and the auto camera.
 *
 * Everything here answers one question: where does a camera looking a given
 * way have to stand to hold a set of world points, centred and as close as it
 * can be. The presets always look across the board from its near edge; the
 * auto camera looks whichever way the shot wants.
 */
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { CameraControls } from '@react-three/drei'
import { HOME_VIEW_RADIUS } from '../geometry'
import { BOARD_SPAN, CAMERA_NEAR } from './world'

/**
 * Azimuth 0: the camera sits over the board's near (+z) edge, so sector 0 of
 * the black hole stays at the far side of the picture, as it is printed.
 */
const NEAR_EDGE_LOOK = new Vector3(0, 0, -1)

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
export const TABLE_PITCHES = [62, 66, 70, 75]
export const TOP_PITCH = 89.9

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
export const WELL_MARGIN = HOME_VIEW_RADIUS * 0.0826

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
export const MIN_DISTANCE = BOARD_SPAN * 0.109
export const MAX_DISTANCE = BOARD_SPAN * 2.66
/** Never under the plane: past 82° the sector numbers are already edge-on. */
export const MAX_POLAR = MathUtils.degToRad(82)

export type Controls = React.ComponentRef<typeof CameraControls>

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
export function solveEye(
  camera: PerspectiveCamera,
  points: Vector3[],
  pitchDeg: number,
  fill: number,
  {
    look = NEAR_EDGE_LOOK,
    minDistance = MIN_DISTANCE,
  }: {
    /** Which way the camera faces across the table, as a horizontal unit vector. */
    look?: Vector3
    /** The closest the camera may stand; the auto camera's close-ups go under the hand's floor. */
    minDistance?: number
  } = {}
): { eye: Vector3; target: Vector3 } | null {
  if (points.length === 0) return null
  const tanV = Math.tan(MathUtils.degToRad(camera.fov) / 2) * fill
  const tanH = tanV * Math.max(0.2, camera.aspect)
  const pitch = MathUtils.degToRad(pitchDeg)
  const forward = new Vector3(look.x * Math.cos(pitch), -Math.sin(pitch), look.z * Math.cos(pitch))
  const right = new Vector3(-forward.z, 0, forward.x).normalize()
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
  let near = nearest - minDistance
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
  const distance = MathUtils.clamp(mean - eyeDepth, minDistance, MAX_DISTANCE)
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
export function framePoints(
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
