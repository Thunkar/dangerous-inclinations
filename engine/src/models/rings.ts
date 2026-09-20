/**
 * Ring geometry and movement costs. All rings have 24 sectors.
 */
export const SECTORS_PER_RING = 24;

/** Phasing: extra sectors that can be added during a burn (braking is limited by velocity). */
export const MAX_SECTOR_ADJUSTMENT = 3;
export const SECTOR_ADJUSTMENT_COST_PER_SECTOR = 1;
export const MIN_FORWARD_MOVEMENT = 1;

/**
 * Burn costs. A burn changes ring by `rings` in the facing direction
 * (prograde = outward, retrograde = inward) and completes immediately.
 */
export const BURN_COSTS = {
  soft: { energy: 1, mass: 1, rings: 1 },
  medium: { energy: 2, mass: 2, rings: 2 },
  hard: { energy: 3, mass: 3, rings: 3 },
} as const;

/** Jumping between wells through a transfer lane. */
export const WELL_TRANSFER_COSTS = {
  energy: 3,
  mass: 3,
} as const;

/**
 * Fuel a jump costs with a working fuel compressor is one against the lane's
 * three; the tile pays two of the three and never the phasing. A constant, not
 * a knob — a game is played under RULES.md and nothing else.
 */
export const COMPRESSED_JUMP_MASS = 1;

/**
 * Allowed sector adjustment for a burn from a ring with the given velocity.
 * You may brake down to MIN_FORWARD_MOVEMENT sector of forward drift
 * (velocity 8: -7) and accelerate by up to MAX_SECTOR_ADJUSTMENT (+3).
 */
export function getAdjustmentRange(velocity: number): { min: number; max: number } {
  return { min: -(velocity - MIN_FORWARD_MOVEMENT), max: MAX_SECTOR_ADJUSTMENT };
}

/** Phasing costs 1 fuel a sector, on a burn or on a jump. */
export function phasingMassCost(sectorAdjustment: number): number {
  return Math.abs(sectorAdjustment) * SECTOR_ADJUSTMENT_COST_PER_SECTOR;
}

export function calculateBurnMassCost(baseMassCost: number, sectorAdjustment: number): number {
  return baseMassCost + phasingMassCost(sectorAdjustment);
}

/**
 * Fuel a jump costs: the lane's own cost, which a working fuel compressor cuts
 * to {@link COMPRESSED_JUMP_MASS}, plus the phasing, which it never cheapens
 * (RULES §Jump: "a compressor pays for the jump, not for the phasing").
 */
export function calculateJumpMassCost(sectorAdjustment: number, hasCompressor: boolean): number {
  const lane = hasCompressor ? COMPRESSED_JUMP_MASS : WELL_TRANSFER_COSTS.mass;
  return lane + phasingMassCost(sectorAdjustment);
}
