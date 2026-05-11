/**
 * Forward expansion (successors) for the movement planner.
 *
 * Given a position and a fuel budget, this enumerates **every** position
 * the ship can occupy after one bot action: coast, burn (any intensity ×
 * any sector adjustment in the ring's range × ring transition appropriate
 * for the ship's facing), and well transfer. This is the dual of
 * {@link ./predecessors.ts:getPredecessors} and is used by the forward BFS
 * for dynamic targets.
 *
 * The action sequence within one turn is fixed by the engine:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ 1. Orbital movement — ring's velocity is added to current sector │
 *   │ 2. Action — coast, burn (ring change + sector adjustment), or    │
 *   │    well transfer (warp + destination's orbital movement)         │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Burns may also flip the ring (prograde → outward, retrograde → inward).
 * Rotation is free and may be combined with any action, so each successor
 * inherits the ship's *current* facing — callers may rotate before burning
 * if they want a different facing direction at no turn cost.
 */

import type {
  GravityWellId,
  Facing,
  BurnIntensity,
} from "../../models/game.ts";
import {
  BURN_COSTS,
  SECTORS_PER_RING,
  getAdjustmentRange,
  WELL_TRANSFER_COSTS,
} from "../../models/rings.ts";
import {
  getGravityWell,
  getRingConfigForWell,
  TRANSFER_POINTS,
} from "../../models/gravityWells.ts";
import type { OrientedPosition, MovementActionType } from "./types.ts";

export interface SuccessorInfo {
  position: OrientedPosition;
  actionType: MovementActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  /**
   * Mass spent for this transition. Negative means mass was *recovered*
   * (only possible when coasting with a fuel scoop installed).
   */
  massCost: number;
}

/**
 * All single-turn successors from `position`, given the ship's available
 * fuel and configuration. The returned successors share the ship's facing —
 * pick the burn direction that aligns with the current facing if you don't
 * want to rotate; or rotate freely (no turn cost) and burn the other way.
 *
 * @param position - Where the ship currently sits (with facing).
 * @param availableMass - Reaction mass remaining in the tank.
 * @param options.allowWellTransfers - Whether to enumerate well transfers.
 * @param options.hasFuelScoop - Adds a coast variant that recovers mass.
 */
export function getSuccessors(
  position: OrientedPosition,
  availableMass: number,
  options: {
    allowWellTransfers: boolean;
    hasFuelScoop?: boolean;
  },
): SuccessorInfo[] {
  const results: SuccessorInfo[] = [];

  const well = getGravityWell(position.wellId);
  if (!well) return results;

  const ringConfig = getRingConfigForWell(position.wellId, position.ring);
  if (!ringConfig) return results;

  const velocity = ringConfig.velocity;

  // Order matters here. The forward BFS returns the *first* node it finds
  // that matches the target — when multiple equal-length paths exist, it
  // returns the one whose successors were explored first. We list **burns
  // before coast** so burn-committal plans of length N are preferred over
  // coast-first plans of length N. That matters because at high-velocity
  // rings (BH R1 vel 8) you can often align with a target in N turns
  // either by coasting first or by burning first — and the bot replans
  // every turn from its new position, so a coast-first plan never gets
  // *executed* past step 1: each replan finds another coast-first plan
  // and the bot oscillates. Burn-first plans give it commitment.

  // 1. Burns — ring change × sector adjustment × intensity, in BOTH
  //    directions. Rotation is free within a turn (engine processes the
  //    rotate action before the burn), so a ship facing retrograde can
  //    still burn prograde — it just emits a rotate alongside the burn.
  //    Successors are tagged with the post-burn facing so downstream code
  //    knows what to align to.
  const burnIntensities = ["soft", "medium", "hard"] as const;
  const adjustmentRange = getAdjustmentRange(velocity);

  for (const intensity of burnIntensities) {
    const burnCost = BURN_COSTS[intensity];
    if (burnCost.mass > availableMass) continue;

    const directions: Array<{
      facing: Facing;
      destRing: number;
      actionType: MovementActionType;
    }> = [
      {
        facing: "prograde",
        destRing: position.ring + burnCost.rings,
        actionType: "burn_prograde",
      },
      {
        facing: "retrograde",
        destRing: position.ring - burnCost.rings,
        actionType: "burn_retrograde",
      },
    ];

    for (const dir of directions) {
      if (dir.destRing < 1 || dir.destRing > well.rings.length) continue;

      for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
        const totalMass = burnCost.mass + Math.abs(adj);
        if (totalMass > availableMass) continue;

        const destSector =
          (((position.sector + velocity + adj) % SECTORS_PER_RING) +
            SECTORS_PER_RING) %
          SECTORS_PER_RING;

        results.push({
          position: {
            wellId: position.wellId,
            ring: dir.destRing,
            sector: destSector,
            facing: dir.facing,
          },
          actionType: dir.actionType,
          burnIntensity: intensity,
          sectorAdjustment: adj,
          massCost: totalMass,
        });
      }
    }
  }

  // 2. Coast — orbital movement only. With a fuel scoop, we recover mass
  //    equal to the ring's velocity (the scoop's defining bonus).
  const coastSector = (position.sector + velocity) % SECTORS_PER_RING;
  const scoopRecovery = options.hasFuelScoop ? velocity : 0;
  results.push({
    position: {
      wellId: position.wellId,
      ring: position.ring,
      sector: coastSector,
      facing: position.facing,
    },
    actionType: "coast",
    sectorAdjustment: 0,
    massCost: -scoopRecovery,
  });

  // 3. Well transfer — only valid from a configured transfer point. After
  //    transfer the destination ring's orbital movement also fires this
  //    same turn (engine rule).
  if (options.allowWellTransfers && WELL_TRANSFER_COSTS.mass <= availableMass) {
    for (const tp of TRANSFER_POINTS) {
      if (
        tp.fromWellId !== position.wellId ||
        tp.fromRing !== position.ring ||
        tp.fromSector !== position.sector
      ) {
        continue;
      }
      const destRingConfig = getRingConfigForWell(tp.toWellId, tp.toRing);
      if (!destRingConfig) continue;

      const finalSector =
        (tp.toSector + destRingConfig.velocity) % SECTORS_PER_RING;
      results.push({
        position: {
          wellId: tp.toWellId as GravityWellId,
          ring: tp.toRing,
          sector: finalSector,
          facing: position.facing,
        },
        actionType: "well_transfer",
        sectorAdjustment: 0,
        massCost: WELL_TRANSFER_COSTS.mass,
      });
    }
  }

  return results;
}
