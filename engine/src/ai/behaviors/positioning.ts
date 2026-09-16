/**
 * Movement. Turns the first step of a movement plan into an engine action
 * the current ship can actually perform, checking each burn against
 * getAdjustmentRange / calculateBurnMassCost and each jump against
 * findJump, engine state and fuel. Anything that fails becomes a coast.
 */
import type { BurnIntensity, Facing, ShipState } from "../../models/game.ts";
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  getAdjustmentRange,
} from "../../models/rings.ts";
import {
  findJump,
  getJumpAdjustmentRange,
  phasedJumpDestination,
} from "../../models/gravityWells.ts";
import { ringVelocity } from "../../game/geometry.ts";
import type { MovementPreview } from "../../game/movement.ts";
import type { MovementPlan } from "../movementPlanner/index.ts";
import { getFirstAction } from "../movementPlanner/index.ts";
import type { BotStatus } from "../types.ts";

export interface MovementChoice {
  kind: "coast" | "burn" | "jump";
  /** Engine's projection input. */
  preview: MovementPreview;
  /** Facing the ship must have when the movement executes; null = any. */
  requiredFacing: Facing | null;
  /** Energy the engines need (0 for a coast). */
  engineEnergy: number;
  /** Reaction mass the movement spends. */
  massCost: number;
  /** The plan counted on scooping during this coast. */
  wantsScoop: boolean;
  burnIntensity?: BurnIntensity;
  sectorAdjustment?: number;
  destinationWellId?: string;
}

export function coastChoice(wantsScoop: boolean): MovementChoice {
  return {
    kind: "coast",
    preview: { kind: "coast" },
    requiredFacing: null,
    engineEnergy: 0,
    massCost: 0,
    wantsScoop,
  };
}

/**
 * Whether a burn from `ship` (current ring) is legal for the engine.
 */
export function burnIsValid(
  ship: ShipState,
  status: BotStatus,
  intensity: BurnIntensity,
  adjustment: number
): boolean {
  if (status.engines.isBroken || status.engines.usedThisTurn) return false;
  const { min, max } = getAdjustmentRange(ringVelocity(ship.wellId, ship.ring));
  if (adjustment < min || adjustment > max) return false;
  return ship.reactionMass >= calculateBurnMassCost(BURN_COSTS[intensity].mass, adjustment);
}

export function jumpIsValid(
  ship: ShipState,
  status: BotStatus,
  destinationWellId: string,
  adjustment = 0
): boolean {
  if (status.engines.isBroken || status.engines.usedThisTurn) return false;
  const jump = findJump(
    { wellId: ship.wellId, ring: ship.ring, sector: ship.sector },
    destinationWellId
  );
  if (!jump) return false;
  const { min, max } = getJumpAdjustmentRange(jump);
  if (adjustment < min || adjustment > max) return false;
  return ship.reactionMass >= calculateJumpMassCost(adjustment, status.hasCompressor);
}

/**
 * The first step of `plan` as a movement the ship can perform now, or null
 * when the step is impossible (the caller then coasts and replans).
 */
export function movementFromPlan(
  ship: ShipState,
  status: BotStatus,
  plan: MovementPlan
): MovementChoice | null {
  const first = getFirstAction(plan);
  if (!first) return null;

  if (first.actionType === "coast") {
    return coastChoice(first.massCost < 0 && !status.scoop.isBroken);
  }

  if (first.actionType === "burn") {
    const intensity = first.burnIntensity ?? "soft";
    const adjustment = first.sectorAdjustment;
    if (!burnIsValid(ship, status, intensity, adjustment)) return null;
    const facing = first.targetFacing ?? ship.facing;
    if (facing !== ship.facing && (status.rotation.isBroken || status.rotation.usedThisTurn))
      return null;
    return {
      kind: "burn",
      preview: { kind: "burn", burnIntensity: intensity, sectorAdjustment: adjustment },
      requiredFacing: facing,
      engineEnergy: BURN_COSTS[intensity].energy,
      massCost: calculateBurnMassCost(BURN_COSTS[intensity].mass, adjustment),
      wantsScoop: false,
      burnIntensity: intensity,
      sectorAdjustment: adjustment,
    };
  }

  const destination = first.destinationWellId!;
  const adjustment = first.sectorAdjustment;
  if (!jumpIsValid(ship, status, destination, adjustment)) return null;
  const jump = findJump(
    { wellId: ship.wellId, ring: ship.ring, sector: ship.sector },
    destination
  )!;
  return {
    kind: "jump",
    preview: { kind: "jump", jumpDestination: phasedJumpDestination(jump, adjustment) },
    requiredFacing: null,
    engineEnergy: WELL_TRANSFER_COSTS.energy,
    massCost: calculateJumpMassCost(adjustment, status.hasCompressor),
    wantsScoop: false,
    sectorAdjustment: adjustment,
    destinationWellId: destination,
  };
}
