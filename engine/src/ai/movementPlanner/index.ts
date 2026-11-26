/**
 * Movement Planner Module
 *
 * Multi-turn path planning for ships navigating between orbital positions.
 *
 * - {@link planMovement}: reverse turn-layered BFS for static destinations
 *   ("fastest" or "economical").
 * - {@link planMovementToTarget}: forward turn-layered BFS for any
 *   {@link PlannerTarget}, including moving ones (stations, drifting ships).
 * - {@link planMovementAlternatives} and {@link planAlternativesToTarget}:
 *   fastest, balanced and economical routes, from either search.
 *
 * @example
 * ```typescript
 * const plan = planMovement(
 *   { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
 *   { wellId: "planet-alpha", ring: 2, sector: 10 },
 *   { mode: "fastest", availableMass: 10 },
 * );
 * ```
 */

export { planMovement, planMovementAlternatives, planAlternativesToTarget } from './planner.ts'
export { planMovementToTarget } from './forward.ts'
export type { PlannerTarget } from './targets.ts'
export {
  staticTarget,
  orbitingTarget,
  nearDriftingShip,
  anySectorOnRing,
  orbitSectorAt,
  driftPeriod,
} from './targets.ts'
export { getPredecessors } from './predecessors.ts'
export type { PredecessorOptions } from './predecessors.ts'
export { getSuccessors } from './successors.ts'
export type { SuccessorInfo, SuccessorOptions } from './successors.ts'
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
  MovementAlternatives,
  PlannerOptions,
  PlannerAvoid,
  PlannerMode,
  MovementActionType,
  PredecessorInfo,
} from './types.ts'
export { positionKey, DEFAULT_PLANNER_OPTIONS } from './types.ts'

// ============================================================================
// Convenience functions for bot integration
// ============================================================================

import type { ShipState, BurnIntensity, Facing, Station } from '../../models/game.ts'
import { hasWorkingCompressor } from '../../game/ship.ts'
import { MAX_REACTION_MASS } from '../../models/game.ts'
import { STATION_DRIFT } from '../../models/gravityWells.ts'
import { inDockingReach, isMooredAt } from '../../game/stations.ts'
import { planMovement } from './planner.ts'
import { planMovementToTarget } from './forward.ts'
import { driftPeriod, orbitingTarget, staticTarget } from './targets.ts'
import type { PlannerTarget } from './targets.ts'
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  PlannerAvoid,
  PlannerMode,
  PlannerOptions,
} from './types.ts'

function shipOrigin(ship: ShipState): OrientedPosition {
  return { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing: ship.facing }
}

/**
 * Planner options describing the ship's tank, scoop and compressor.
 *
 * `reserveMass` is fuel the route may not touch: both the tank and what is in
 * it shrink by it, which is exactly the arithmetic of a reserve: every
 * affordability check along the path reads "fuel above the reserve", and the
 * scoop's headroom to the real tank is unchanged. A Tanker pumps its fuel on
 * arrival, so its dock trips are planned with that reserved and the search
 * coasts in where it would otherwise burn.
 */
function shipPlannerOptions(
  ship: ShipState,
  maxTurns: number,
  reserveMass = 0,
  avoid?: PlannerAvoid
): PlannerOptions {
  const scoop = ship.subsystems.find(s => s.type === 'scoop')
  return {
    avoid,
    mode: 'fastest',
    maxTurns,
    availableMass: ship.reactionMass - reserveMass,
    allowWellTransfers: true,
    hasFuelScoop: scoop !== undefined && !scoop.isBroken,
    maxFuelCapacity: MAX_REACTION_MASS - reserveMass,
    hasFuelCompressor: hasWorkingCompressor(ship),
  }
}

/**
 * Plan movement from a ship's current position to a static target.
 *
 * The reverse search caps every predecessor's burn by the fuel the ship has
 * *now*, so from a near-empty tank it reports "unreachable" for routes that
 * are perfectly possible once the scoop has run for a turn or two. The
 * forward search tracks fuel along the path and does model scooping, so it
 * is the fallback whenever the reverse search comes back empty on a ship
 * that has a working scoop. It only runs on that failure, so the common
 * case still costs one reverse search.
 *
 * The reverse search learns a route's turns only once it reaches the ship,
 * so it cannot keep to `avoid`: a route it finds that stops inside is planned
 * again forward, which can.
 */
export function planFromShip(
  ship: ShipState,
  target: OrbitalPosition,
  mode: PlannerMode = 'fastest',
  maxTurns: number = 20,
  avoid?: PlannerAvoid
): MovementPlan | null {
  const options = shipPlannerOptions(ship, maxTurns, 0, avoid)
  const origin = shipOrigin(ship)
  const plan = planMovement(origin, target, { ...options, mode })
  if (plan && !(avoid && stopsInside(plan, avoid))) return plan
  if (!plan && !options.hasFuelScoop) return null
  return planMovementToTarget(origin, staticTarget(target), plan ? { ...options, mode } : options)
}

/** Whether a turn of the route short of its arrival ends inside `avoid`. */
export function stopsInside(plan: MovementPlan, avoid: PlannerAvoid): boolean {
  for (let i = 0; i < plan.steps.length - 1; i++) {
    if (avoid.covers(plan.steps[i].to, i + 1)) return true
  }
  return false
}

/**
 * Plan movement from a ship to any {@link PlannerTarget} (forward BFS).
 *
 * `reserveMass` is fuel the route must still have aboard when it arrives;
 * `avoid` the places its turns may end on only as the arrival.
 */
export function planShipToTarget(
  ship: ShipState,
  target: PlannerTarget,
  maxTurns: number = 12,
  reserveMass = 0,
  avoid?: PlannerAvoid
): MovementPlan | null {
  return planMovementToTarget(
    shipOrigin(ship),
    target,
    shipPlannerOptions(ship, maxTurns, reserveMass, avoid)
  )
}

/**
 * The first step of a plan as engine action data.
 *
 * `targetFacing` is the facing the ship must have for the step (the burn
 * direction); it is undefined for coasts and jumps, which work from either
 * facing. `sectorAdjustment` is the phasing: the arrival shift of a burn or
 * of a jump inside its arrival arc.
 */
export function getFirstAction(plan: MovementPlan): {
  actionType: 'coast' | 'burn' | 'well_transfer'
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  targetFacing?: Facing
  destinationWellId?: string
  /** Mass the planner expects this step to spend (negative = scoop recovery). */
  massCost: number
} | null {
  const step = plan.steps[0]
  if (!step) return null

  if (step.actionType === 'burn_prograde' || step.actionType === 'burn_retrograde') {
    return {
      actionType: 'burn',
      burnIntensity: step.burnIntensity,
      sectorAdjustment: step.sectorAdjustment,
      targetFacing: step.actionType === 'burn_prograde' ? 'prograde' : 'retrograde',
      massCost: step.massCost,
    }
  }
  if (step.actionType === 'well_transfer') {
    return {
      actionType: 'well_transfer',
      sectorAdjustment: step.sectorAdjustment,
      destinationWellId: step.to.wellId,
      massCost: step.massCost,
    }
  }
  return { actionType: 'coast', sectorAdjustment: 0, massCost: step.massCost }
}

/**
 * Result of a station meet-up plan: where the ship lands, how many turns it
 * takes, and the plan itself.
 */
export interface StationMeetPlan {
  meetPosition: OrbitalPosition
  totalTurns: number
  plan: MovementPlan
}

/**
 * Planner target for a station (advances STATION_DRIFT sectors once a round).
 * A turn that ends in its docking reach docks there, so that is the match.
 */
export function stationTarget(
  station: Pick<Station, 'planetId' | 'ring' | 'sector'>
): PlannerTarget {
  const orbit = orbitingTarget(
    { wellId: station.planetId, ring: station.ring, sector: station.sector },
    STATION_DRIFT
  )
  return { ...orbit, isMatch: (pos, turn) => inDockingReach(orbit.positionAt(turn), pos) }
}

/**
 * The docking reach of every station, where they will be at each turn: a
 * ship that ends a turn inside docks there, so a route may end a turn
 * inside only as its arrival. For {@link PlannerOptions.avoid}.
 *
 * A ship that begins its turn moored does not dock that turn (RULES
 * §Stations), so from `start` on a berth the first turn may end anywhere.
 */
export function dockingAvoidance(stations: Station[], start: OrbitalPosition): PlannerAvoid {
  const period = driftPeriod(STATION_DRIFT)
  const targets = stations.map(stationTarget)
  // Where the stations are on turns 1..period; turn t is the same as t - period.
  const at = Array.from({ length: period }, (_, i) => targets.map(t => t.positionAt(i + 1)))
  const moored = isMooredAt(stations, start)
  return {
    period,
    covers: (pos, turn) => {
      if (moored && turn === 1) return false
      const here = at[(turn - 1) % period]
      for (let i = 0; i < here.length; i++) if (inDockingReach(here[i], pos)) return true
      return false
    },
  }
}

/**
 * Plan a meet-up with an orbiting station using the forward BFS, which
 * lines up "where will I be?" with "where will it be?" at every turn.
 */
export function planStationMeetUp(
  ship: ShipState,
  station: Pick<Station, 'planetId' | 'ring' | 'sector'>,
  maxTurns: number = 12,
  reserveMass = 0,
  avoid?: PlannerAvoid
): StationMeetPlan | null {
  const plan = planShipToTarget(ship, stationTarget(station), maxTurns, reserveMass, avoid)
  if (!plan) return null
  return { meetPosition: plan.destination, totalTurns: plan.totalTurns, plan }
}
