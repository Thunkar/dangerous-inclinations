/**
 * Movement Planner Module
 *
 * Multi-turn path planning for ships navigating between orbital positions.
 *
 * - {@link planMovement}: reverse turn-layered BFS for static destinations
 *   ("fastest" or "economical").
 * - {@link planMovementToTarget}: forward turn-layered BFS for any
 *   {@link PlannerTarget}, including moving ones (stations, drifting ships).
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

export {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getReachablePositions,
} from "./planner.ts";
export { planMovementToTarget } from "./forward.ts";
export type { PlannerTarget } from "./targets.ts";
export {
  staticTarget,
  orbitingTarget,
  nearDriftingShip,
  anySectorOnRing,
  orbitSectorAt,
  driftPeriod,
} from "./targets.ts";
export { getPredecessors } from "./predecessors.ts";
export type { PredecessorOptions } from "./predecessors.ts";
export { getSuccessors } from "./successors.ts";
export type { SuccessorInfo, SuccessorOptions } from "./successors.ts";
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
  MovementAlternatives,
  PlannerOptions,
  PlannerMode,
  MovementActionType,
  PredecessorInfo,
} from "./types.ts";
export { positionKey, DEFAULT_PLANNER_OPTIONS } from "./types.ts";

// ============================================================================
// Convenience functions for bot integration
// ============================================================================

import type { ShipState, BurnIntensity, Facing, Station } from "../../models/game.ts";
import { hasWorkingCompressor } from "../../game/ship.ts";
import { MAX_REACTION_MASS } from "../../models/game.ts";
import { ringVelocity } from "../../game/geometry.ts";
import { planMovement } from "./planner.ts";
import { planMovementToTarget } from "./forward.ts";
import { orbitingTarget, staticTarget } from "./targets.ts";
import type { PlannerTarget } from "./targets.ts";
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  PlannerMode,
  PlannerOptions,
} from "./types.ts";

export function shipOrigin(ship: ShipState): OrientedPosition {
  return { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing: ship.facing };
}

/** Planner options describing the ship's tank, scoop and compressor. */
export function shipPlannerOptions(ship: ShipState, maxTurns: number): PlannerOptions {
  const scoop = ship.subsystems.find((s) => s.type === "scoop");
  return {
    mode: "fastest",
    maxTurns,
    availableMass: ship.reactionMass,
    allowWellTransfers: true,
    hasFuelScoop: scoop !== undefined && !scoop.isBroken,
    maxFuelCapacity: MAX_REACTION_MASS,
    hasFuelCompressor: hasWorkingCompressor(ship),
  };
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
 */
export function planFromShip(
  ship: ShipState,
  target: OrbitalPosition,
  mode: PlannerMode = "fastest",
  maxTurns: number = 20
): MovementPlan | null {
  const options = shipPlannerOptions(ship, maxTurns);
  const origin = shipOrigin(ship);
  const plan = planMovement(origin, target, { ...options, mode });
  if (plan || !options.hasFuelScoop) return plan;
  return planMovementToTarget(origin, staticTarget(target), options);
}

/**
 * Plan movement from a ship to any {@link PlannerTarget} (forward BFS).
 */
export function planShipToTarget(
  ship: ShipState,
  target: PlannerTarget,
  maxTurns: number = 12
): MovementPlan | null {
  return planMovementToTarget(shipOrigin(ship), target, shipPlannerOptions(ship, maxTurns));
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
  actionType: "coast" | "burn" | "well_transfer";
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  targetFacing?: Facing;
  destinationWellId?: string;
  /** Mass the planner expects this step to spend (negative = scoop recovery). */
  massCost: number;
} | null {
  const step = plan.steps[0];
  if (!step) return null;

  if (step.actionType === "burn_prograde" || step.actionType === "burn_retrograde") {
    return {
      actionType: "burn",
      burnIntensity: step.burnIntensity,
      sectorAdjustment: step.sectorAdjustment,
      targetFacing: step.actionType === "burn_prograde" ? "prograde" : "retrograde",
      massCost: step.massCost,
    };
  }
  if (step.actionType === "well_transfer") {
    return {
      actionType: "well_transfer",
      sectorAdjustment: step.sectorAdjustment,
      destinationWellId: step.to.wellId,
      massCost: step.massCost,
    };
  }
  return { actionType: "coast", sectorAdjustment: 0, massCost: step.massCost };
}

/**
 * Turns to reach a static target, or Infinity if unreachable.
 */
export function estimateTurnsToTarget(ship: ShipState, target: OrbitalPosition): number {
  return planFromShip(ship, target, "fastest")?.totalTurns ?? Infinity;
}

/**
 * Result of a station meet-up plan: where the ship lands, how many turns it
 * takes, and the plan itself.
 */
export interface StationMeetPlan {
  meetPosition: OrbitalPosition;
  totalTurns: number;
  plan: MovementPlan;
}

/** Planner target for a station (advances once per round by its ring velocity). */
export function stationTarget(
  station: Pick<Station, "planetId" | "ring" | "sector">
): PlannerTarget {
  return orbitingTarget(
    { wellId: station.planetId, ring: station.ring, sector: station.sector },
    ringVelocity(station.planetId, station.ring)
  );
}

/**
 * Plan a meet-up with an orbiting station using the forward BFS, which
 * lines up "where will I be?" with "where will it be?" at every turn.
 */
export function planStationMeetUp(
  ship: ShipState,
  station: Pick<Station, "planetId" | "ring" | "sector">,
  maxTurns: number = 12
): StationMeetPlan | null {
  const plan = planShipToTarget(ship, stationTarget(station), maxTurns);
  if (!plan) return null;
  return { meetPosition: plan.destination, totalTurns: plan.totalTurns, plan };
}
