/**
 * Movement. Turns the first step of a movement plan into an engine action
 * the current ship can actually perform, checked against the engine's
 * `legalMoves`. Anything that fails becomes a coast.
 */
import type { BurnIntensity, Facing, ShipState } from "../../models/game.ts";
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
} from "../../models/rings.ts";
import { findJump, phasedJumpDestination } from "../../models/gravityWells.ts";
import { legalMoves, phasingAllowed } from "../../game/movement.ts";
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
 * The cheapest way off a station berth: a soft burn, outward if there is a
 * ring above and inward otherwise, rotating if the nose is the wrong way
 * round.
 *
 * A berth is as good a place to skim from as any (RULES §Coast), so a tank
 * that runs down in port is not a ship stranded there. What the berth cannot
 * do is dock again: this is the move that turns the next arrival back into a
 * visit.
 */
export function castOffChoice(ship: ShipState): MovementChoice | null {
  const burn = legalMoves(ship).burns.find((b) => b.intensity === "soft");
  if (!burn) return null;
  return {
    kind: "burn",
    preview: { kind: "burn", burnIntensity: "soft", sectorAdjustment: 0 },
    requiredFacing: burn.facing,
    engineEnergy: burn.engineEnergy,
    massCost: burn.fuel,
    wantsScoop: false,
    burnIntensity: "soft",
    sectorAdjustment: 0,
  };
}

/** Whether the engine takes this burn from `ship` now, rotating to `facing` first if need be. */
function burnIsLegal(
  ship: ShipState,
  intensity: BurnIntensity,
  facing: Facing,
  adjustment: number
): boolean {
  return legalMoves(ship).burns.some(
    (b) => b.intensity === intensity && b.facing === facing && phasingAllowed(b, adjustment)
  );
}

/** Whether the engine takes this jump from `ship` now. */
function jumpIsLegal(ship: ShipState, destinationWellId: string, adjustment = 0): boolean {
  return legalMoves(ship).jumps.some(
    (j) => j.destinationWellId === destinationWellId && phasingAllowed(j, adjustment)
  );
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
    const facing = first.targetFacing ?? ship.facing;
    if (!burnIsLegal(ship, intensity, facing, adjustment)) return null;
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
  if (!jumpIsLegal(ship, destination, adjustment)) return null;
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
