/**
 * Reverse expansion (predecessors) for the movement planner: every
 * position that reaches `target` in one movement action. The dual of
 * {@link ./successors.ts:getSuccessors}; used by the reverse BFS.
 *
 * Rotation is free within a turn, so burn predecessors come in both
 * facings (the ship rotates before burning). Jumps land on the arrival arc
 * with no drift and work from either facing: with phasing, every departure
 * sector of a lane reaches every sector of its arrival arc.
 */
import type { BurnIntensity } from "../../models/game.ts";
import { BURN_COSTS, calculateJumpMassCost, getAdjustmentRange } from "../../models/rings.ts";
import {
  arcOffset,
  arcSectors,
  getMaxRing,
  getRingConfig,
  laneArrivalArc,
  laneDepartureArc,
  TRANSFER_LANES,
} from "../../models/gravityWells.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import type { OrientedPosition, PredecessorInfo } from "./types.ts";

export interface PredecessorOptions {
  allowWellTransfers: boolean;
  /** A compressor refunds a jump's own mass (never its phasing). */
  hasFuelCompressor?: boolean;
}

/**
 * Find all positions that can reach the target position in one turn.
 */
export function getPredecessors(
  target: OrientedPosition,
  availableMass: number,
  options: PredecessorOptions | boolean
): PredecessorInfo[] {
  const opts: PredecessorOptions =
    typeof options === "boolean" ? { allowWellTransfers: options } : options;
  const predecessors: PredecessorInfo[] = [];
  predecessors.push(...getCoastPredecessors(target));
  predecessors.push(...getBurnPredecessors(target, availableMass));
  if (opts.allowWellTransfers) {
    predecessors.push(
      ...getWellTransferPredecessors(target, availableMass, opts.hasFuelCompressor === true)
    );
  }
  return predecessors;
}

/**
 * Coast: new_sector = old_sector + velocity, so the predecessor sits
 * `velocity` sectors behind, in either facing.
 */
function getCoastPredecessors(target: OrientedPosition): PredecessorInfo[] {
  if (!getRingConfig(target.wellId, target.ring)) return [];
  const sector = wrapSector(target.sector - ringVelocity(target.wellId, target.ring));
  return (["prograde", "retrograde"] as const).map((facing) => ({
    position: { wellId: target.wellId, ring: target.ring, sector, facing },
    actionType: "coast",
    sectorAdjustment: 0,
    massCost: 0,
    requiresRotation: false,
  }));
}

/**
 * Burn: target_sector = source_sector + source_velocity + adjustment.
 * Prograde raises the orbit (source ring is inner), retrograde lowers it.
 */
function getBurnPredecessors(target: OrientedPosition, availableMass: number): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = [];
  const maxRing = getMaxRing(target.wellId);

  for (const intensity of ["soft", "medium", "hard"] as const) {
    const burnCost = BURN_COSTS[intensity];
    if (burnCost.mass > availableMass) continue;

    const progradeSourceRing = target.ring - burnCost.rings;
    if (progradeSourceRing >= 1) {
      predecessors.push(
        ...getBurnPredecessorsForDirection(
          target,
          progradeSourceRing,
          "prograde",
          intensity,
          availableMass
        )
      );
    }
    const retrogradeSourceRing = target.ring + burnCost.rings;
    if (retrogradeSourceRing <= maxRing) {
      predecessors.push(
        ...getBurnPredecessorsForDirection(
          target,
          retrogradeSourceRing,
          "retrograde",
          intensity,
          availableMass
        )
      );
    }
  }
  return predecessors;
}

function getBurnPredecessorsForDirection(
  target: OrientedPosition,
  sourceRing: number,
  burnDirection: "prograde" | "retrograde",
  intensity: BurnIntensity,
  availableMass: number
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = [];
  const sourceVelocity = ringVelocity(target.wellId, sourceRing);
  const range = getAdjustmentRange(sourceVelocity);
  const baseMass = BURN_COSTS[intensity].mass;

  for (let adjustment = range.min; adjustment <= range.max; adjustment++) {
    const totalMassCost = baseMass + Math.abs(adjustment);
    if (totalMassCost > availableMass) continue;
    const sourceSector = wrapSector(target.sector - sourceVelocity - adjustment);
    for (const facing of ["prograde", "retrograde"] as const) {
      predecessors.push({
        position: { wellId: target.wellId, ring: sourceRing, sector: sourceSector, facing },
        actionType: burnDirection === "prograde" ? "burn_prograde" : "burn_retrograde",
        burnIntensity: intensity,
        sectorAdjustment: adjustment,
        massCost: totalMassCost,
        requiresRotation: facing !== burnDirection,
      });
    }
  }
  return predecessors;
}

/**
 * Jump: the ship lands on the lane's arrival arc (no drift). Phasing shifts
 * the landing inside that arc for 1 fuel a sector, so any of the lane's four
 * departure sectors can reach the target, the matching one for free.
 */
function getWellTransferPredecessors(
  target: OrientedPosition,
  availableMass: number,
  hasFuelCompressor: boolean
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = [];
  for (const lane of TRANSFER_LANES) {
    const landing = arcOffset(laneArrivalArc(lane), target);
    if (landing < 0) continue;
    const departure = laneDepartureArc(lane);
    const sectors = arcSectors(departure);
    for (let offset = 0; offset < sectors.length; offset++) {
      const adjustment = landing - offset;
      const massCost = calculateJumpMassCost(adjustment, hasFuelCompressor);
      if (massCost > availableMass) continue;
      for (const facing of ["prograde", "retrograde"] as const) {
        predecessors.push({
          position: {
            wellId: departure.wellId,
            ring: departure.ring,
            sector: sectors[offset],
            facing,
          },
          actionType: "well_transfer",
          sectorAdjustment: adjustment,
          massCost,
          requiresRotation: false,
        });
      }
    }
  }
  return predecessors;
}
