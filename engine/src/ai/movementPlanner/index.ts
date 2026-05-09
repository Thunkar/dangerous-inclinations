/**
 * Movement Planner Module
 *
 * Provides multi-turn path planning for ships navigating between orbital positions.
 * Supports two optimization modes:
 * - fastest: Minimize number of turns
 * - economical: Minimize fuel (reaction mass) usage
 *
 * Uses reverse turn-layered BFS from destination, expanding backwards layer by
 * layer (one turn per layer) until the origin is found.
 *
 * @example
 * ```typescript
 * import { planMovement, analyzeSlingshots } from './movementPlanner'
 *
 * const plan = planMovement(
 *   { wellId: 'blackhole', ring: 3, sector: 5, facing: 'prograde' },
 *   { wellId: 'planet-alpha', ring: 2, sector: 10 },
 *   { mode: 'fastest', availableMass: 20 }
 * )
 *
 * if (plan) {
 *   console.log(`Path found: ${plan.totalTurns} turns, ${plan.totalMassCost} mass`)
 *   for (const step of plan.steps) {
 *     console.log(`  ${step.actionType}: ${step.from.sector} → ${step.to.sector}`)
 *   }
 * }
 * ```
 */

// Main planner functions — reverse BFS, static targets only
export {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getReachablePositions,
  comparePlans,
} from "./planner.ts";

// Forward BFS planner — supports static and dynamic targets
export { planMovementToTarget } from "./forward.ts";

// Target abstraction — used to express static or dynamic goals
export type { PlannerTarget } from "./targets.ts";
export { staticTarget, orbitingTarget } from "./targets.ts";

// Predecessor / successor primitives (for advanced usage)
export {
  getPredecessors,
  getVelocityAtPosition,
  getMaxRingForWell,
} from "./predecessors.ts";
export { getSuccessors } from "./successors.ts";
export type { SuccessorInfo } from "./successors.ts";

// Types
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
  MovementAlternatives,
  PlannerOptions,
  PlannerMode,
  MovementActionType,
  SlingshotAnalysis,
  PredecessorInfo,
} from "./types.ts";

export { positionKey, orbitalPositionKey, positionsMatch } from "./types.ts";

// ============================================================================
// Convenience functions for bot integration
// ============================================================================

import type {
  ShipState,
  BurnIntensity,
  Facing,
  ActionType,
} from "../../models/game.ts";
import { getMaxReactionMass } from "../../game/loadout.ts";
import { planMovement, isReachable } from "./planner.ts";
import { planMovementToTarget } from "./forward.ts";
import { orbitingTarget } from "./targets.ts";
import { STATION_CONSTANTS } from "../../game/stations.ts";
import { getGravityWell } from "../../models/gravityWells.ts";
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  PlannerMode,
} from "./types.ts";

/**
 * Plan movement from a ship's current position to a target.
 * Convenience wrapper that extracts position from ShipState.
 *
 * @param ship - Current ship state
 * @param target - Target orbital position
 * @param mode - Optimization mode ('fastest' or 'economical')
 * @returns Movement plan or null if unreachable
 */
export function planFromShip(
  ship: ShipState,
  target: OrbitalPosition,
  mode: PlannerMode = "fastest",
): MovementPlan | null {
  const origin: OrientedPosition = {
    wellId: ship.wellId,
    ring: ship.ring,
    sector: ship.sector,
    facing: ship.facing,
  };

  const hasFuelScoop = ship.subsystems.some((s) => s.type === "scoop"); // always true (fixed)
  const maxFuelCapacity = getMaxReactionMass(ship.subsystems);

  return planMovement(origin, target, {
    mode,
    availableMass: ship.reactionMass,
    currentFacing: ship.facing,
    allowWellTransfers: true,
    maxTurns: 20,
    hasFuelScoop,
    maxFuelCapacity,
  });
}

/**
 * Get the first action from a movement plan.
 * Useful for bots that want to execute one step at a time.
 *
 * @param plan - Movement plan from planMovement
 * @returns Action data for the first step, or null if plan is empty
 */
export function getFirstAction(plan: MovementPlan): {
  actionType: ActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  targetFacing?: Facing;
  /**
   * For well_transfer actions only — the well the planner intends to jump
   * to. Required by the bot to construct a `WellTransferAction`.
   */
  destinationWellId?: string;
} | null {
  if (plan.steps.length === 0) return null;

  const step = plan.steps[0];

  // `targetFacing` is the facing the ship MUST be in for this step to
  // succeed (i.e. the post-rotation facing). For burns, that's the burn
  // direction. Setting it to `step.from.facing` (the pre-rotation source
  // facing) would never trigger a rotation — exactly the bug that kept
  // bots stuck on planet R3 when they needed to retrograde-burn inward.
  let targetFacing: Facing | undefined;
  if (step.actionType === "burn_prograde") {
    targetFacing = "prograde";
  } else if (step.actionType === "burn_retrograde") {
    targetFacing = "retrograde";
  } else if (step.actionType === "well_transfer") {
    // Well transfers require prograde facing.
    targetFacing = "prograde";
  } else {
    targetFacing = undefined; // coast — no rotation required by the step itself
  }

  // Map planner step type → engine action type. Each is a distinct
  // action; well transfers in particular MUST be emitted as a real
  // well_transfer action, not collapsed into coast (which previously
  // stranded bots on the black hole because no one ever issued the jump).
  let actionType: ActionType;
  if (step.actionType === "coast") {
    actionType = "coast";
  } else if (
    step.actionType === "burn_prograde" ||
    step.actionType === "burn_retrograde"
  ) {
    actionType = "burn";
  } else {
    actionType = "well_transfer";
  }

  return {
    actionType,
    burnIntensity: step.burnIntensity,
    sectorAdjustment: step.sectorAdjustment,
    targetFacing,
    destinationWellId:
      step.actionType === "well_transfer" ? step.to.wellId : undefined,
  };
}

/**
 * Check if a target position is reachable from a ship's position.
 *
 * @param ship - Current ship state
 * @param target - Target orbital position
 * @param maxTurns - Maximum turns to search
 * @returns True if target is reachable
 */
export function canReachTarget(
  ship: ShipState,
  target: OrbitalPosition,
  maxTurns: number = 10,
): boolean {
  const origin: OrientedPosition = {
    wellId: ship.wellId,
    ring: ship.ring,
    sector: ship.sector,
    facing: ship.facing,
  };

  return isReachable(origin, target, maxTurns, ship.reactionMass, true);
}

/**
 * Estimate how many turns it will take to reach a target.
 * Returns Infinity if unreachable.
 *
 * @param ship - Current ship state
 * @param target - Target orbital position
 * @returns Number of turns, or Infinity if unreachable
 */
export function estimateTurnsToTarget(
  ship: ShipState,
  target: OrbitalPosition,
): number {
  const plan = planFromShip(ship, target, "fastest");
  return plan?.totalTurns ?? Infinity;
}

/**
 * Result of a station meet-up plan: the position the ship should aim at,
 * how many bot turns the meet takes, and the underlying plan.
 */
export interface StationMeetPlan {
  meetPosition: OrbitalPosition;
  totalTurns: number;
  plan: MovementPlan;
}

/**
 * Plan a meet-up with an orbiting station.
 *
 * Stations advance once per round, in lockstep with `isNewRound`. From the
 * planner's perspective each bot turn equals one round, with the orbit
 * advance landing **between** the bot's turn-N match check and its turn-N+1
 * action — see {@link orbitingTarget} for the full timing rules.
 *
 * Internally this builds an `orbitingTarget` for the station and dispatches
 * to {@link planMovementToTarget}; that function's forward, time-layered
 * BFS naturally lines up the ship's "where will I be?" with the station's
 * "where will *it* be?", which a static-target planner cannot do.
 *
 * @param ship - Bot ship state.
 * @param station - The station to meet (planet id + ring + sector). Ring is
 *   conventionally 1; the sector is its current sector.
 * @returns A {@link StationMeetPlan} or `null` if no meet within `maxTurns`.
 */
export function planStationMeetUp(
  ship: ShipState,
  station: { planetId: string; ring: number; sector: number },
  maxTurns: number = 12,
): StationMeetPlan | null {
  const origin: OrientedPosition = {
    wellId: ship.wellId,
    ring: ship.ring,
    sector: ship.sector,
    facing: ship.facing,
  };

  const well = getGravityWell(station.planetId);
  const ringConfig = well?.rings.find((r) => r.ring === station.ring);
  const sectorsPerRound = ringConfig?.velocity ?? 4;

  const target = orbitingTarget(
    {
      wellId: station.planetId,
      ring: station.ring,
      sector: station.sector,
    },
    sectorsPerRound,
    STATION_CONSTANTS.SECTORS_PER_RING,
  );

  const hasFuelScoop = ship.subsystems.some((s) => s.type === "scoop");
  const maxFuelCapacity = getMaxReactionMass(ship.subsystems);

  const plan = planMovementToTarget(origin, target, {
    mode: "fastest",
    availableMass: ship.reactionMass,
    currentFacing: ship.facing,
    allowWellTransfers: true,
    maxTurns,
    hasFuelScoop,
    maxFuelCapacity,
  });

  if (!plan) return null;

  return {
    meetPosition: plan.destination,
    totalTurns: plan.totalTurns,
    plan,
  };
}
