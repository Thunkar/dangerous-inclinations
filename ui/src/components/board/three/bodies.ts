/**
 * How much room a drawn body takes, and where it sits.
 *
 * The black hole is not just its horizon: the accretion disc, the photon ring,
 * the lensed arc and the glow pooling around it are the picture, and nothing
 * else may be printed under them. The black hole's own name, the well's labels
 * and every radius in `scene/BlackHole.tsx` read these numbers, so the disc can
 * be retuned in one place and everything else stays out of its way.
 *
 * ## The budget, and why it is solved rather than tuned
 *
 * Everything the black hole does has to be spent before ring 1's sector
 * numbers, because a number you cannot read is a rule you cannot play. There
 * are two ceilings, not one, and the hand-tuned multiples of the horizon this
 * file used to carry met them only by luck:
 *
 *  - **In plan** (the Top camera) the nearest ink of ring 1 sits at
 *    `sectorLabelBand('blackhole', 1).inner`. Nothing with any alpha may cross
 *    it, in any direction.
 *  - **In elevation** (the Table camera, 62° above the plane) the black hole
 *    is a solid ball and a tilted sheet floating above the floor of the pit,
 *    and both of them ride *up* the screen toward ring 1's far numbers. A point
 *    at height `y` above the ring-1 plane and plan distance `d` on the far side
 *    lands `d·sin P + y·cos P` up the screen, against a ceiling ring 1's own
 *    ink sets at `L·sin P`. So every unit of height costs 0.47 units of
 *    ceiling, and a tilted disc *has* to be lifted, or its low edge cuts the
 *    floor of the pit. This is the ceiling that decides how big the horizon may
 *    be, and it is why there are no polar jets (see the treatments below).
 *
 *    That sign used to be a minus, which said height *buys* ceiling, and while
 *    the hole was a marble at the bottom of a wide pit nothing came of it. Ring
 *    1 has since come out to meet ring 5 and the hole has grown into the room,
 *    at which point the error cashed itself in: the disc's far limb climbed
 *    through ring 1's "22" and "1". Every ceiling in this file is now measured
 *    the way the screen measures it.
 *
 * There was a third and it was the tightest: `Wells` printed BLACK HOLE on the
 * floor of the pit, in the band between this module's `bodyExtent` and ring 1's
 * numbers, and reserving that lane cost the disc a fifth of its radius, for a
 * label on the one body whose identity is never in doubt. The name is printed
 * below the plate now instead, where nothing competes for the room, and
 * `bodyExtent` is free to tell the plain truth about how far the black hole
 * reaches: the last triangle of its disc, measured along the axis the name used
 * to be printed on. `scene/Wells.tsx` decides between the two bands.
 *
 * Both ceilings grow with the board. `budget()` reads them from `world.ts` and
 * `geometry.ts` every time, and `blackHoleBody()` bisects the disc's radius
 * against them by sampling the sheet where it actually goes rather than a
 * circle drawn round it, so opening the rings out moves ring 1 outward and the
 * black hole grows into the room with nothing here touched. It already has
 * once: the board was opened out 1.42x while this was being written and the
 * disc followed on its own.
 */
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { wellVisual } from '../geometry'
import { PRINT_SCALE, funnelFloorRadius, sectorLabelBand, surfaceElevation } from './world'

/**
 * The shallowest Table camera, in degrees above the plane: `CameraRig`'s first
 * candidate pitch, and the one that leaves the least room over the hole. Read
 * here rather than imported to keep this module free of the camera, so it has
 * to be kept in step with `TABLE_PITCHES[0]` there by hand.
 *
 * It is 62 rather than 55 because this file is where the cost of a shallow
 * camera is paid. The ceiling up the screen is `ink·sin P` and a horizon resting
 * in the pit reaches `r·(1 + 0.95·cos P)`, so the largest legal black hole is
 * `ink·sin P / (1 + 0.95·cos P)`: 0.53·ink at 55°, 0.61·ink at 62°. Seven
 * degrees of pitch are worth a fifth of the body.
 */
const TABLE_PITCH = 62

/**
 * How far the black hole's light reaches over the top of the horizon, in horizon
 * radii: the photon ring and the lensed arc, which face the camera and so climb
 * the screen at the full rate rather than the disc's foreshortened one. It is
 * `arcOuterUp` below, and it is the outermost bright thing the hole draws
 * upward, so it and not the silhouette is what the ceiling has to be measured
 * against.
 */
const ARC_REACH = 1.1

/**
 * How far the horizon is settled into the floor of its own pit, in radii.
 *
 * A ball resting exactly on the floor sits with its centre a full radius up, and
 * every unit of that centre height is 0.47 units of ceiling spent before the
 * light has reached anywhere, which is a poor way to spend a budget on a body
 * that is a hole. Settling it in costs nothing that can be seen: the plate is
 * opaque and the cut is black on dark, so from any camera above the plane the
 * silhouette is the same circle. It buys the hole about a sixth of its radius.
 * The disc still has to clear the floor, and `liftFor` takes whichever of the
 * two is higher.
 */
const SUNK = 0.72

/**
 * Board units of daylight left between the black hole's light and ring 1's ink,
 * in plan and again up the screen at the Table pitch. Printed sizes, so they
 * carry `PRINT_SCALE` like every other printed size on the board.
 *
 * The plan gap is a moat and has to look like one. The shader's outer kill
 * takes the alpha to nothing over the last fifth of the sheet, but "nothing"
 * arrives gradually and the eye reads the last of it as a wash behind the
 * numbers; seven printed units of black between the last triangle and the first
 * digit is what it takes for ring 1 to read as ink on black, which is about
 * what the board was tuned with before the disc grew into the room.
 */
const PLAN_GAP = 7 * PRINT_SCALE
const SCREEN_GAP = 3 * PRINT_SCALE
export interface BlackHoleBudget {
  /** Nearest ink of ring 1: nothing may cross this radius in plan. */
  ink: number
  /** Largest radius any part of the disc may reach, seen from straight above. */
  plan: number
  /** Height up the screen, at the Table pitch, that nothing bright may pass. */
  screen: number
  /** Radius inside which the pit's floor is flat, so the pool can lie on it. */
  floor: number
}

/**
 * What the black hole is allowed, in board units, from the board as it is drawn
 * today. Every number in this file is a fraction of one of these.
 */
export function budget(): BlackHoleBudget {
  const ink = sectorLabelBand('blackhole', 1).inner
  return {
    ink,
    plan: ink - PLAN_GAP,
    screen: ink * Math.sin((TABLE_PITCH * Math.PI) / 180) - SCREEN_GAP,
    floor: funnelFloorRadius('blackhole'),
  }
}

/* ------------------------------------------------------------- treatments */

/**
 * Three ways of spending the budget, for the designer to choose between.
 *
 *  - **blaze**, the disc as a disc: a flat sheet at a shallow tilt, lit right
 *    across the annulus instead of dying a third of the way out, with spiral
 *    filaments, a white-hot inner lip, a little vertical thickness and hard
 *    Doppler beaming. This is the existing black hole grown into its own room.
 *  - **warp**, the disc as the gravity well: the sheet leaves the hole's
 *    equator tilted and settles into the board plane at its outer edge, so the
 *    light lies in the funnel the board is already drawn as. Its outer edge is
 *    on the floor, which costs it no lift at all, so it may spread wider.
 *  - **halo**, the disc as a body of gas: half again as wide a scale height, so
 *    the shells stand well clear of the midplane and the inner disc is a fat
 *    torus rather than a sheet; calmer beaming, looser arms, and a photon ring
 *    and lensed arc strong enough to carry the picture. Mass, not fire.
 *
 * A fourth was drawn and thrown away: polar jets. Height looks free (nothing
 * is printed above the plate) but at the Table pitch every unit of height
 * buys 0.57 units of travel up the screen *toward* ring 1's far numbers, and a
 * jet leaning away from the camera adds its own lean on top. The arithmetic
 * comes out at 0.80 units of ceiling per unit of jet, which caps a legal jet at
 * about 1.3 horizon radii: a stub inside the lensed arc, not a jet. They
 * become possible if the board opens out far enough.
 */
export type BlackHoleTreatment = 'blaze' | 'warp' | 'halo'

export const BLACK_HOLE_TREATMENTS: readonly BlackHoleTreatment[] = ['blaze', 'warp', 'halo']

/** The one the board draws when nothing asks for another. */
export const DEFAULT_TREATMENT: BlackHoleTreatment = 'blaze'

interface Tuning {
  /** Inner edge of the disc, as a multiple of the horizon: the last stable orbit. */
  isco: number
  /** Where the disc's light is spent, as a fraction of what the budget allows. */
  bright: number
  /** Degrees the disc leaves the board plane at its inner edge. */
  tilt: number
  /** 0 keeps the sheet flat; 1 settles its outer edge onto the floor of the pit. */
  warp: number
  /** Scale height of the disc, as a multiple of the horizon. */
  puff: number
  /** Shells drawn above and below the midplane: 0 draws a decal, 1 a thick disc. */
  shells: 0 | 1
  /** Turns of the spiral pattern per e-fold of radius. */
  spiral: number
  /** Doppler beaming: how much brighter the limb turning toward you is. */
  beaming: number
  /** Strength of the arc the far side of the disc is bent into over the top. */
  arc: number
  /** Strength of the photon ring at the silhouette. */
  photon: number
  /** Light pooling on the floor, as a fraction of what the budget allows. */
  pool: number
}

const TUNING: Record<BlackHoleTreatment, Tuning> = {
  blaze: {
    isco: 1.14,
    bright: 0.88,
    tilt: 18,
    warp: 0,
    puff: 0.24,
    shells: 1,
    spiral: 2.2,
    beaming: 0.46,
    arc: 1.15,
    photon: 1.25,
    pool: 0.92,
  },
  warp: {
    isco: 1.12,
    bright: 0.9,
    tilt: 34,
    warp: 1,
    puff: 0.2,
    shells: 1,
    spiral: 3.4,
    beaming: 0.4,
    arc: 1.0,
    photon: 1.1,
    pool: 0.45,
  },
  halo: {
    isco: 1.1,
    bright: 0.9,
    tilt: 22,
    warp: 0,
    puff: 0.62,
    shells: 1,
    spiral: 1.6,
    beaming: 0.3,
    arc: 1.55,
    photon: 1.7,
    pool: 0.8,
  },
}

/**
 * `?bh=blaze|warp|halo` picks a treatment for a screenshot. Read once, like
 * every other dev flag on this board; the default is what the table draws.
 */
let asked: BlackHoleTreatment | null = null
export function blackHoleTreatment(): BlackHoleTreatment {
  if (asked) return asked
  const flag =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bh')
  asked = BLACK_HOLE_TREATMENTS.includes(flag as BlackHoleTreatment)
    ? (flag as BlackHoleTreatment)
    : DEFAULT_TREATMENT
  return asked
}

/* ------------------------------------------------------------------ solve */

export interface BlackHoleBody {
  treatment: BlackHoleTreatment
  /** Event horizon radius: the radius the flat board prints, so the two agree. */
  radius: number
  /** World elevation of the centre of the horizon. */
  centerY: number
  /** Height of that centre above the floor of the pit. */
  lift: number
  /** Inner edge of the disc: the last stable orbit. */
  discInner: number
  /** Radius the disc's light is spent by. */
  discBright: number
  /** Radius its geometry stops at; the alpha is long gone before here. */
  discOuter: number
  /** Radians the disc leaves the board plane at, at its inner edge. */
  tilt: number
  /** 0 a flat sheet, 1 a sheet that settles onto the floor at its outer edge. */
  warp: number
  /** Scale height of the disc at its thickest, in board units. */
  puff: number
  shells: 0 | 1
  spiral: number
  beaming: number
  arc: number
  photon: number
  /** Radius of the light pooling on the floor of the pit. */
  pool: number
  /** The camera-facing annulus the lensed arc is drawn on. */
  arcInner: number
  /** Its outer radius to the sides and below, and the tighter one over the top. */
  arcOuter: number
  arcOuterUp: number
  /** Radius past which nothing the black hole draws has any alpha left. */
  extent: number
}

const RAD = Math.PI / 180

/**
 * Scale height of the disc at a fraction `u` along its radius, as a share of
 * its thickest. Pinched shut at the last stable orbit, fattest just outside it,
 * thinning away outward: a flared disc, seen edge-on as a lens rather than as
 * a slab. **Mirror of `discPuff` in `shaders/accretion.ts`.**
 */
export function sheetPuff(u: number): number {
  return (1 - Math.exp(-u * 9)) * Math.exp(-u * 2.2)
}

export interface SheetShape {
  inner: number
  outer: number
  tilt: number
  warp: number
  lift: number
}

/** Smoothstep, the same curve GLSL's has, so the mirror below is exact. */
function ease(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * A point of the disc's sheet, at a fraction `u` along its radius and an
 * azimuth `theta`, relative to the plane through the hole's centre. `y` is up;
 * `z` is the board axis the well's name is printed along.
 *
 * The sheet is a circle rotated about the board's x axis, so in plan it is an
 * ellipse squashed along z, which is the room the name lives in. Warped, the
 * rotation relaxes with radius and the whole sheet settles toward the floor.
 *
 * **This is a mirror of `discSheet` in `shaders/accretion.ts`**: the solver
 * below has to know where the sheet goes in order to prove it never reaches
 * ring 1's numbers, and the shader has to draw it. Change one, change both.
 */
export function sheetPoint(
  u: number,
  theta: number,
  shape: SheetShape
): { x: number; y: number; z: number } {
  const radius = shape.inner + (shape.outer - shape.inner) * u
  const lean = shape.tilt * (1 - shape.warp * ease(u))
  const settle = shape.lift * shape.warp * ease((u - 0.12) / 0.88)
  return {
    x: radius * Math.cos(theta),
    y: radius * Math.sin(theta) * Math.sin(lean) - settle,
    z: radius * Math.sin(theta) * Math.cos(lean),
  }
}

/**
 * Where the black hole floats in its own funnel, and how much of the board it
 * is allowed to take.
 *
 * It cannot simply sit on the floor: the disc is tilted, so its low edge would
 * cut through the pit. The centre is lifted until that edge clears, computed
 * from `world.ts` rather than tuned by hand, so a deeper funnel carries the
 * body down with it. Then the disc's outer radius is the largest that keeps
 * every ceiling in `budget()`: found by bisection over the radius, testing the
 * sheet where it actually goes rather than a circle drawn around it.
 */
export function blackHoleBody(treatment = blackHoleTreatment()): BlackHoleBody {
  const tuning = TUNING[treatment]
  const room = budget()
  const cosPitch = Math.cos(TABLE_PITCH * RAD)
  const sinPitch = Math.sin(TABLE_PITCH * RAD)
  // The horizon is the radius the flat board prints, so the two boards agree
  // about the one body they both draw. The clamp is a backstop and nothing
  // more: a hole settled into the floor of the pit throws its lensed arc
  // `ARC_REACH·radius + SUNK·radius·cos P` up the screen, which is the most the
  // far numbers will allow, and at the board's tuned proportion the printed
  // radius comes in a few units under it.
  const radius = Math.min(
    wellVisual('blackhole').bodyRadius,
    room.screen / (ARC_REACH + SUNK * cosPitch)
  )
  const floor = surfaceElevation('blackhole', 0)
  const tilt = tuning.tilt * RAD
  const puff = radius * tuning.puff
  const inner = radius * tuning.isco

  /**
   * How high the centre has to ride for the sheet's lowest point to clear the
   * floor. The warp's own settle is measured from the lift and lands exactly on
   * the floor by construction, so only the tilt is asked about here.
   */
  const liftFor = (outer: number): number => {
    const shape: SheetShape = { inner, outer, tilt, warp: tuning.warp, lift: 0 }
    let lowest = 0
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      lowest = Math.min(lowest, sheetPoint(u, -Math.PI / 2, shape).y - sheetPuff(u) * puff)
    }
    return Math.max(radius * SUNK, -lowest + 3)
  }

  /** Does a disc of this radius keep every ceiling? */
  const fits = (outer: number): boolean => {
    const lift = liftFor(outer)
    // The lensed arc over the top of the horizon is the first thing to reach
    // ring 1's ink up the screen.
    if (radius * ARC_REACH + lift * cosPitch > room.screen) return false
    const shape: SheetShape = { inner, outer, tilt, warp: tuning.warp, lift }
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      const r = inner + (outer - inner) * u
      // Straight over the hole, on the far side: the highest the sheet gets on
      // screen, and the one bearing that can reach ring 1's far numbers.
      const far = sheetPoint(u, -Math.PI / 2, shape)
      const y = far.y + sheetPuff(u) * puff
      if (Math.abs(far.z) * sinPitch + (lift + y) * cosPitch > room.screen) return false
      // In plan the sheet is an ellipse round the hole, and ring 1's numbers
      // run all the way round it, so the long axis is what has to fit.
      if (r > room.plan) return false
    }
    return true
  }

  let low = inner * 1.15
  let high = room.plan
  if (!fits(low)) high = low
  else if (fits(high)) low = high
  else {
    for (let i = 0; i < 28; i++) {
      const mid = (low + high) / 2
      if (fits(mid)) low = mid
      else high = mid
    }
  }
  const outer = low
  const lift = liftFor(outer)
  const bright = inner + (outer - inner) * tuning.bright
  const pool = Math.min(room.plan, room.floor - PLAN_GAP) * tuning.pool
  // What the name and the well's labels have to clear: the last triangle of the
  // sheet, measured along the axis the name is printed on, which the tilt
  // squashes. Not the bright radius: the shader's own outer kill takes the
  // alpha to nothing by the last triangle and not a unit before it, so this is
  // where the black hole provably stops.
  const shape: SheetShape = { inner, outer, tilt, warp: tuning.warp, lift }
  const extent = Math.max(radius * 1.55, Math.abs(sheetPoint(1, -Math.PI / 2, shape).z))

  // The lensed arc faces the camera, so unlike the disc it climbs the screen at
  // the full rate, and the room it has is wildly lopsided. Straight up is
  // where ring 1's far numbers are: at the board's tuned proportion the
  // silhouette alone reaches within a couple of units of them, so over the top
  // the arc can be little more than the photon ring. Down and to the sides the
  // nearest ink is the *near* half of ring 1, and the hole's own lift carries
  // the arc away from it rather than toward it, which leaves twice the room.
  // So the annulus is given two radii and the shader mixes between them by
  // which way up the fragment is. Both are fractions of the horizon: the ratio
  // is the one the board was tuned at, and it should not change with the board.
  const arcInner = radius * 1.02
  const arcOuterUp = radius * ARC_REACH
  const arcOuter = radius * 1.78

  return {
    treatment,
    radius,
    centerY: floor + lift,
    lift,
    discInner: inner,
    discBright: bright,
    discOuter: outer,
    tilt,
    warp: tuning.warp,
    puff,
    shells: tuning.shells,
    spiral: tuning.spiral,
    beaming: tuning.beaming,
    arc: tuning.arc,
    photon: tuning.photon,
    pool,
    arcInner,
    arcOuter,
    arcOuterUp,
    extent,
  }
}

/**
 * How far past the limb a planet's atmosphere reaches, in body radii.
 *
 * It lives here rather than in `scene/Planet.tsx` because it is part of how
 * much room the body takes, which is what this module is for: the well's name
 * has to clear the air as well as the rock.
 */
export const PLANET_AIR = 1.34

/** Radius past which a well's name and labels are clear of its body. */
export function bodyExtent(wellId: GravityWellId): number {
  const visual = wellVisual(wellId)
  if (visual.orbitAngle !== undefined) return visual.bodyRadius * PLANET_AIR
  return blackHoleBody().extent
}
