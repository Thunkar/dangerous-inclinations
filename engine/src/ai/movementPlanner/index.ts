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

// Main planner functions
export {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getReachablePositions,
  comparePlans,
} from "./planner.ts";

// Predecessor calculation (for advanced usage)
export {
  getPredecessors,
  getVelocityAtPosition,
  getMaxRingForWell,
} from "./predecessors.ts";

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
import { MAX_REACTION_MASS } from "../../models/game.ts";
import { SUBSYSTEM_CONFIGS } from "../../models/subsystems.ts";
import { planMovement, isReachable } from "./planner.ts";
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
  const compressorCount = ship.subsystems.filter((s) => s.type === "fuel_compressor").length;
  const compressorBonus = SUBSYSTEM_CONFIGS.fuel_compressor.passiveEffect?.reactionMassBonus ?? 0;
  const maxFuelCapacity = MAX_REACTION_MASS + compressorCount * compressorBonus;

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
} | null {
  if (plan.steps.length === 0) return null;

  const step = plan.steps[0];

  // Determine if we need to rotate first
  const needsRotation = step.requiresRotation;
  const targetFacing = needsRotation ? step.from.facing : undefined;

  // Map action type
  let actionType: ActionType;
  if (step.actionType === "coast") {
    actionType = "coast";
  } else if (
    step.actionType === "burn_prograde" ||
    step.actionType === "burn_retrograde"
  ) {
    actionType = "burn";
  } else {
    // Well transfer needs special handling
    actionType = "coast"; // Well transfers are followed by coast
  }

  return {
    actionType,
    burnIntensity: step.burnIntensity,
    sectorAdjustment: step.sectorAdjustment,
    targetFacing,
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
