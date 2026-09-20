/**
 * Forward expansion (successors) for the movement planner.
 *
 * Given a position and a fuel budget, this enumerates every position the
 * ship can occupy after one movement action: coast, burn (any intensity ×
 * any sector adjustment in the ring's range, in either direction, since a
 * rotation costs no fuel and is not the turn's one move) and jump. It is the dual of
 * {@link ./predecessors.ts:getPredecessors} and is used by the forward BFS
 * and by the reverse planner's reachability helper.
 *
 * Engine rules encoded here (see game/movement.ts and actionProcessors.ts):
 *   - coast / burn: orbital drift first, then the ring change + phasing;
 *   - jump: the lane's destination sector IS the turn's movement: there is
 *     no drift after landing, and facing does not matter; phasing shifts the
 *     landing inside the arrival arc for 1 fuel a sector.
 */

import type { BurnIntensity } from "../../models/game.ts";
import {
  BURN_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  getAdjustmentRange,
} from "../../models/rings.ts";
import {
  getJumpAdjustmentRange,
  getJumpOptions,
  phasedJumpDestination,
} from "../../models/gravityWells.ts";
import { driftPosition, ringVelocity, wrapSector } from "../../game/geometry.ts";
import { burnDestinationRing } from "../../game/movement.ts";
import type { OrientedPosition, MovementActionType } from "./types.ts";

export interface SuccessorInfo {
  position: OrientedPosition;
  actionType: MovementActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  /**
   * Mass spent for this transition. Negative means mass was recovered
   * (only possible when coasting with the scoop active).
   */
  massCost: number;
}

export interface SuccessorOptions {
  allowWellTransfers: boolean;
  /** Coast steps recover mass equal to the ring velocity. */
  hasFuelScoop?: boolean;
  /** A compressor cheapens a jump's own mass (never its phasing). */
  hasFuelCompressor?: boolean;
}

/**
 * All single-turn successors from `position`, given the ship's available
 * fuel and configuration.
 */
export function getSuccessors(
  position: OrientedPosition,
  availableMass: number,
  options: SuccessorOptions
): SuccessorInfo[] {
  const results: SuccessorInfo[] = [];
  const velocity = ringVelocity(position.wellId, position.ring);
  // Both coasts and burns drift first; the engine does the same.
  const drifted = driftPosition(position);

  // Order matters. The forward BFS returns the first node it finds that
  // matches the target, so among equal-length plans the one whose first
  // step is listed first wins. Burns come before coast so a burn-committal
  // plan is preferred over a coast-first plan of the same length: the bot
  // replans every turn, and a coast-first plan keeps being replaced by
  // another coast-first plan (oscillation) whereas a burn commits.
  const adjustmentRange = getAdjustmentRange(velocity);
  for (const intensity of ["soft", "medium", "hard"] as const) {
    const burnCost = BURN_COSTS[intensity];
    if (burnCost.mass > availableMass) continue;

    for (const facing of ["prograde", "retrograde"] as const) {
      const destRing = burnDestinationRing({ ...position, facing }, intensity);
      // burnDestinationRing clamps to the rings that exist; a burn that
      // would leave them changes the ring by less than it should, and the
      // engine rejects it.
      if (Math.abs(destRing - position.ring) !== burnCost.rings) continue;

      for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
        const massCost = calculateBurnMassCost(burnCost.mass, adj);
        if (massCost > availableMass) continue;
        results.push({
          position: {
            wellId: position.wellId,
            ring: destRing,
            sector: wrapSector(drifted.sector + adj),
            facing,
          },
          actionType: facing === "prograde" ? "burn_prograde" : "burn_retrograde",
          burnIntensity: intensity,
          sectorAdjustment: adj,
          massCost,
        });
      }
    }
  }

  // Coast: orbital drift only, optionally scooping.
  results.push({
    position: { ...drifted, facing: position.facing },
    actionType: "coast",
    sectorAdjustment: 0,
    massCost: options.hasFuelScoop ? -velocity : 0,
  });

  // Jumps: only from a lane's departure arc. The landing may be phased to any
  // sector of the arrival arc for 1 fuel each; 0 (the matching sector) first,
  // so an unphased jump wins ties.
  if (options.allowWellTransfers) {
    for (const option of getJumpOptions(position)) {
      const range = getJumpAdjustmentRange(option);
      const adjustments = [0];
      for (let adj = range.min; adj <= range.max; adj++) if (adj !== 0) adjustments.push(adj);
      for (const adj of adjustments) {
        const massCost = calculateJumpMassCost(adj, options.hasFuelCompressor === true);
        if (massCost > availableMass) continue;
        const destination = phasedJumpDestination(option, adj);
        if (!destination) continue;
        results.push({
          position: { ...destination, facing: position.facing },
          actionType: "well_transfer",
          sectorAdjustment: adj,
          massCost,
        });
      }
    }
  }

  return results;
}
