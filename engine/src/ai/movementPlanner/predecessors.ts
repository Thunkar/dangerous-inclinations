import type { BurnIntensity, GravityWellId } from '../../models/game'
import { BURN_COSTS, SECTORS_PER_RING, getAdjustmentRange, WELL_TRANSFER_COSTS } from '../../models/rings'
import { getGravityWell, getRingConfigForWell, TRANSFER_POINTS } from '../../models/gravityWells'
import type { OrientedPosition, PredecessorInfo } from './types'

/**
 * Find all positions that can reach the target position in one turn.
 * This is the core of the reverse Dijkstra search - we expand backwards from
 * the destination to find all possible predecessors.
 *
 * NOTE: Rotation is FREE and can be combined with any action (burn, coast) in the same turn.
 * Therefore, burn predecessors include BOTH facings - the ship can rotate before burning.
 *
 * @param target - The position we want to reach
 * @param availableMass - Maximum reaction mass we can spend
 * @param allowWellTransfers - Whether to include well transfer predecessors
 * @returns Array of predecessor positions with their action details
 */
export function getPredecessors(
  target: OrientedPosition,
  availableMass: number,
  allowWellTransfers: boolean
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = []

  // 1. Coast predecessors (same ring, same well)
  predecessors.push(...getCoastPredecessors(target))

  // 2. Burn predecessors (different rings, same well)
  // Note: Burns include both facings since rotation is free
  predecessors.push(...getBurnPredecessors(target, availableMass))

  // 3. Well transfer predecessors (different well)
  if (allowWellTransfers) {
    predecessors.push(...getWellTransferPredecessors(target, availableMass))
  }

  return predecessors
}

/**
 * Find coast predecessors - positions that can reach target by coasting (no burn)
 * Coast simply applies orbital movement: new_sector = (old_sector + velocity) % 24
 * So predecessor sector = (target_sector - velocity + 24) % 24
 */
function getCoastPredecessors(target: OrientedPosition): PredecessorInfo[] {
  const ringConfig = getRingConfigForWell(target.wellId, target.ring)
  if (!ringConfig) return []

  const velocity = ringConfig.velocity
  const predecessorSector = (target.sector - velocity + SECTORS_PER_RING) % SECTORS_PER_RING

  // Coast can be done with any facing - no rotation required
  // We return both facings as options
  return [
    {
      position: {
        wellId: target.wellId,
        ring: target.ring,
        sector: predecessorSector,
        facing: 'prograde',
      },
      actionType: 'coast',
      sectorAdjustment: 0,
      massCost: 0,
      requiresRotation: false,
    },
    {
      position: {
        wellId: target.wellId,
        ring: target.ring,
        sector: predecessorSector,
        facing: 'retrograde',
      },
      actionType: 'coast',
      sectorAdjustment: 0,
      massCost: 0,
      requiresRotation: false,
    },
  ]
}

/**
 * Find burn predecessors - positions that can reach target by burning
 *
 * Movement sequence:
 * 1. Ship at source position applies orbital movement: position += source_velocity
 * 2. Ship burns (changes ring) + applies sector adjustment
 *
 * So: target_sector = (source_sector + source_velocity + adjustment) % 24
 * Therefore: source_sector = (target_sector - source_velocity - adjustment + 48) % 24
 *
 * Burn directions (real orbital mechanics):
 * - Prograde burn: accelerates with orbit = raises orbit = moves to HIGHER ring (outward)
 *   - Target at ring R means source was at ring R - burn.rings (came from inner ring)
 * - Retrograde burn: decelerates = lowers orbit = moves to LOWER ring (inward)
 *   - Target at ring R means source was at ring R + burn.rings (came from outer ring)
 */
function getBurnPredecessors(
  target: OrientedPosition,
  availableMass: number
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = []
  const well = getGravityWell(target.wellId)
  if (!well) return predecessors

  const maxRing = well.rings.length
  const burnIntensities: BurnIntensity[] = ['soft', 'medium', 'hard']

  for (const intensity of burnIntensities) {
    const burnCost = BURN_COSTS[intensity]

    // Check if we have enough mass for base burn (we'll check adjustment cost per option)
    if (burnCost.mass > availableMass) continue

    // Prograde burn: raises orbit (outward), so source was at inner ring
    const progradeSourceRing = target.ring - burnCost.rings
    if (progradeSourceRing >= 1 && progradeSourceRing <= maxRing) {
      predecessors.push(
        ...getBurnPredecessorsForDirection(
          target,
          progradeSourceRing,
          'prograde',
          intensity,
          burnCost,
          availableMass
        )
      )
    }

    // Retrograde burn: lowers orbit (inward), so source was at outer ring
    const retrogradeSourceRing = target.ring + burnCost.rings
    if (retrogradeSourceRing >= 1 && retrogradeSourceRing <= maxRing) {
      predecessors.push(
        ...getBurnPredecessorsForDirection(
          target,
          retrogradeSourceRing,
          'retrograde',
          intensity,
          burnCost,
          availableMass
        )
      )
    }
  }

  return predecessors
}

/**
 * Generate burn predecessors for a specific direction and intensity.
 *
 * IMPORTANT: Rotation is FREE and can be combined with burns in the same turn.
 * Therefore, we return predecessors for BOTH facings - the ship can rotate
 * before burning if needed, at no extra turn cost.
 */
function getBurnPredecessorsForDirection(
  target: OrientedPosition,
  sourceRing: number,
  burnDirection: 'prograde' | 'retrograde',
  intensity: BurnIntensity,
  burnCost: { energy: number; mass: number; rings: number },
  availableMass: number
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = []

  // Get source ring configuration to calculate velocity
  const sourceRingConfig = getRingConfigForWell(target.wellId, sourceRing)
  if (!sourceRingConfig) return predecessors

  const sourceVelocity = sourceRingConfig.velocity

  // Calculate adjustment range based on source velocity
  const adjustmentRange = getAdjustmentRange(sourceVelocity)

  // Try all valid sector adjustments
  for (let adjustment = adjustmentRange.min; adjustment <= adjustmentRange.max; adjustment++) {
    // Calculate total mass cost
    const totalMassCost = burnCost.mass + Math.abs(adjustment)
    if (totalMassCost > availableMass) continue

    // Calculate source sector
    // target_sector = (source_sector + source_velocity + adjustment) % 24
    // source_sector = (target_sector - source_velocity - adjustment + 48) % 24
    const sourceSector =
      (target.sector - sourceVelocity - adjustment + 2 * SECTORS_PER_RING) % SECTORS_PER_RING

    // Return both facings since rotation is free - ship can rotate before burning
    for (const facing of ['prograde', 'retrograde'] as const) {
      const needsRotation = facing !== burnDirection
      predecessors.push({
        position: {
          wellId: target.wellId,
          ring: sourceRing,
          sector: sourceSector,
          facing,
        },
        actionType: burnDirection === 'prograde' ? 'burn_prograde' : 'burn_retrograde',
        burnIntensity: intensity,
        sectorAdjustment: adjustment,
        massCost: totalMassCost,
        requiresRotation: needsRotation,
      })
    }
  }

  return predecessors
}

/**
 * Find well transfer predecessors - positions in OTHER wells that can reach target
 *
 * Well transfer sequence:
 * 1. Ship at source well/ring/sector initiates transfer
 * 2. Ship lands at destination well at fixed toSector (from transfer point)
 * 3. Ship then coasts: applies orbital movement: final_sector = (toSector + velocity) % 24
 *
 * So: target_sector = (transfer.toSector + dest_velocity) % 24
 * We need: transfer.toSector = (target_sector - dest_velocity + 24) % 24
 *
 * We look for transfer points where:
 * - toWellId === target.wellId
 * - toRing === target.ring
 * - toSector === required_landing_sector
 */
function getWellTransferPredecessors(
  target: OrientedPosition,
  availableMass: number
): PredecessorInfo[] {
  const predecessors: PredecessorInfo[] = []

  // Check if we have enough mass for well transfer
  if (WELL_TRANSFER_COSTS.mass > availableMass) return predecessors

  // Get target ring velocity
  const targetRingConfig = getRingConfigForWell(target.wellId, target.ring)
  if (!targetRingConfig) return predecessors

  // Calculate the sector the ship needs to land at (before orbital movement)
  const requiredLandingSector =
    (target.sector - targetRingConfig.velocity + SECTORS_PER_RING) % SECTORS_PER_RING

  // Find transfer points that land at our target well/ring
  for (const tp of TRANSFER_POINTS) {
    if (
      tp.toWellId === target.wellId &&
      tp.toRing === target.ring &&
      tp.toSector === requiredLandingSector
    ) {
      // Found a matching transfer point!
      // The predecessor is at the fromWellId, fromRing, fromSector
      // Note: Well transfers preserve facing (sector numbering handles direction)

      // Return both facings since well transfer doesn't require specific facing
      for (const facing of ['prograde', 'retrograde'] as const) {
        predecessors.push({
          position: {
            wellId: tp.fromWellId as GravityWellId,
            ring: tp.fromRing,
            sector: tp.fromSector,
            facing,
          },
          actionType: 'well_transfer',
          sectorAdjustment: 0,
          massCost: WELL_TRANSFER_COSTS.mass,
          requiresRotation: false,
        })
      }
    }
  }

  return predecessors
}

/**
 * Get the velocity for a position
 */
export function getVelocityAtPosition(wellId: GravityWellId, ring: number): number {
  const ringConfig = getRingConfigForWell(wellId, ring)
  return ringConfig?.velocity ?? 1
}

/**
 * Get the maximum ring number for a gravity well
 */
export function getMaxRingForWell(wellId: GravityWellId): number {
  const well = getGravityWell(wellId)
  return well?.rings.length ?? 5
}
