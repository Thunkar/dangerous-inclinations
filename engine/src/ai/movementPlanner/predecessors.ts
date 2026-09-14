/**
 * Reverse expansion (predecessors) for the movement planner: every
 * position that reaches `target` in one movement action. The dual of
 * {@link ./successors.ts:getSuccessors}; used by the reverse BFS.
 *
 * Rotation is free within a turn, so burn predecessors come in both
 * facings (the ship rotates before burning). Jumps land exactly on the
 * lane's destination sector with no drift and work from either facing.
 */
import type { BurnIntensity } from "../../models/game.ts";
import { BURN_COSTS, getAdjustmentRange, WELL_TRANSFER_COSTS } from "../../models/rings.ts";
import { getMaxRing, getRingConfig, TRANSFER_POINTS } from "../../models/gravityWells.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import type { OrientedPosition, PredecessorInfo } from "./types.ts";

export interface PredecessorOptions {
  allowWellTransfers: boolean;
  /** Jumps cost no mass. */
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
 * Jump: the ship lands exactly on the lane's destination sector (no drift),
 * so the predecessor is the lane's source sector in the other well.
 */
function getWellTransferPredecessors(
  target: OrientedPosition,
  availableMass: number,
  hasFuelCompressor: boolean
): PredecessorInfo[] {
  const jumpMass = hasFuelCompressor ? 0 : WELL_TRANSFER_COSTS.mass;
  if (jumpMass > availableMass) return [];

  const predecessors: PredecessorInfo[] = [];
  for (const tp of TRANSFER_POINTS) {
    if (tp.toWellId !== target.wellId || tp.toRing !== target.ring || tp.toSector !== target.sector)
      continue;
    for (const facing of ["prograde", "retrograde"] as const) {
      predecessors.push({
        position: { wellId: tp.fromWellId, ring: tp.fromRing, sector: tp.fromSector, facing },
        actionType: "well_transfer",
        sectorAdjustment: 0,
        massCost: jumpMass,
        requiresRotation: false,
      });
    }
  }
  return predecessors;
}
