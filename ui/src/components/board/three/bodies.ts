/**
 * How much room a drawn body takes, and where it sits.
 *
 * The black hole is not just its horizon: the accretion disc, the photon ring
 * and the glow pooling around it are part of the picture and nothing else may
 * be printed under them. The black hole's own name, the well's labels and the
 * lensing fuse all read these numbers, so the disc can be retuned in one place
 * and everything else stays out of its way.
 *
 * The one number worth knowing when tuning them: the black hole's horizon is
 * 52 units, ring 1 is at 125, and ring 1's sector numbers are printed at about
 * 111. Everything the black hole does must be spent by then — a number you
 * cannot read is a rule you cannot play.
 */
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { wellVisual } from '../geometry'
import { surfaceElevation } from './world'

/** Accretion disc radii, as multiples of the event horizon's radius. */
export const DISC_INNER = 1.16
/** Where the disc stops being bright; also what the well's name clears. */
export const DISC_OUTER = 1.56
/** Where its geometry stops. The alpha is gone well before here. */
export const DISC_WISP = 1.8

/**
 * The glow in the pit.
 *
 * It stops at 1.6 horizon radii — inside the black hole's own name, which
 * `bodyExtent` puts at 1.56 plus twelve units — so the name stays ink on a dark
 * plate instead of grey on amber.
 */
export const POOL_RADIUS = 1.6

/** Degrees the disc is tilted out of the board plane, so it reads as a disc. */
export const DISC_TILT = 23

/** Radius past which a well's name and labels are clear of its body. */
export function bodyExtent(wellId: GravityWellId): number {
  const visual = wellVisual(wellId)
  return visual.orbitAngle === undefined ? visual.bodyRadius * DISC_OUTER : visual.bodyRadius
}

export interface BlackHoleBody {
  /** Event horizon radius. */
  radius: number
  /** World elevation of the centre of the horizon. */
  centerY: number
  /** Disc radii in world units. */
  discInner: number
  discBright: number
  discOuter: number
}

/**
 * Where the black hole floats in its own funnel.
 *
 * It cannot simply sit on the floor: the disc is tilted, so its low edge would
 * cut through the wall of the pit. The centre is lifted until the low edge
 * clears the surface at the disc's own radius — computed from `world.ts` rather
 * than tuned by hand, so a deeper funnel moves the body with it.
 */
export function blackHoleBody(): BlackHoleBody {
  const radius = wellVisual('blackhole').bodyRadius
  const discInner = radius * DISC_INNER
  const discBright = radius * DISC_OUTER
  const discOuter = radius * DISC_WISP
  const tiltDrop = discOuter * Math.sin((DISC_TILT * Math.PI) / 180)
  const floor = surfaceElevation('blackhole', 0)
  const wallAtRim = surfaceElevation('blackhole', discOuter)
  const centerY = Math.max(floor + radius * 0.95, wallAtRim + tiltDrop + radius * 0.3)
  return { radius, centerY, discInner, discBright, discOuter }
}
