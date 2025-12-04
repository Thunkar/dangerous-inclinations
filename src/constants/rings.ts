/**
 * All rings have uniform sector count for consistent tactical gameplay
 */
export const SECTORS_PER_RING = 24

export const ENERGY_PER_TURN = 10
export const MAX_REACTION_MASS = 10
export const STARTING_REACTION_MASS = 10
export const DEFAULT_DISSIPATION_CAPACITY = 5

/**
 * Sector adjustment (phasing) costs for non-Hohmann transfers
 * Allows adjusting arrival sector by consuming extra reaction mass
 */
export const MAX_SECTOR_ADJUSTMENT = 3 // Maximum sectors that can be added/subtracted
export const SECTOR_ADJUSTMENT_COST_PER_SECTOR = 1 // Reaction mass cost per sector of adjustment
export const MIN_FORWARD_MOVEMENT = 1 // Must always move at least 1 sector prograde

/**
 * Burn costs for ring transfers
 * Note: Ring changes are now velocity changes (inner rings are faster)
 * Base costs are for ideal Hohmann transfers (sector adjustment = 0)
 * Additional costs apply for sector adjustments (phasing maneuvers)
 */
export const BURN_COSTS = {
  soft: { energy: 1, mass: 1, rings: 1 }, // Transfer ±1 ring (change velocity by ±1)
  medium: { energy: 2, mass: 2, rings: 2 }, // Transfer ±2 rings (change velocity by ±2)
  hard: { energy: 3, mass: 3, rings: 3 }, // Transfer ±3 rings (change velocity by ±3)
}

export const ROTATION_ENERGY_COST = 1

/**
 * Well transfer costs for jumping between gravity wells
 */
export const WELL_TRANSFER_COSTS = {
  energy: 3, // Requires engines at level 3
  mass: 3,   // Consumes 3 reaction mass
}

/**
 * Maps a sector number when transferring between rings.
 *
 * NEW DESIGN (4 black hole rings, 3 planet rings, variable velocity):
 * Ring sectors: ALL 24 SECTORS (uniform granularity)
 * Ring velocities: Black hole (4,3,2,1), Planets (3,2,1)
 *
 * WHY THIS DESIGN:
 * - Variable velocity means inner rings move FASTER (like real orbital mechanics)
 * - Uniform sector count (24) makes range calculation simple and predictable
 * - Ring transfers = velocity changes, not just position changes
 * - Much better positioning granularity for tactical gameplay
 *
 * Transfer rules (TRIVIALLY SIMPLE for tabletop):
 * - All rings have 24 sectors, so sector mapping is 1:1 (same sector number)
 * - Only angular position matters: you stay at the same angular position
 * - The tactical change is VELOCITY, not angular offset
 *
 * Example:
 * - R1 S10 → R2: Land at S10 (same angular position, but now velocity changes from 4 to 3)
 * - R3 S5 → R1: Land at S5 (same angular position, but now velocity changes from 2 to 4)
 *
 * Movement per turn (variable velocity with dramatic doubling):
 * - R1: 8 sectors/turn = 120° (BLAZING FAST - extreme risk/reward)
 * - R2: 4 sectors/turn = 60° (very fast - aggressive positioning)
 * - R3: 2 sectors/turn = 30° (medium - balanced)
 * - R4: 1 sector/turn = 15° (slow - safe but predictable)
 *
 * Strategic depth: Ring 1 is 8× faster than Ring 4! Inner rings = extreme speed but very hard to control
 * Perfect for tabletop: "Check your ring card for velocity, move that many sectors"
 */
export function mapSectorOnTransfer(
  _fromRing: number,
  _toRing: number,
  currentSector: number
): number {
  // All rings have uniform 24 sectors, so mapping is trivial: stay at same sector
  // This preserves angular position when transferring between rings
  return currentSector % SECTORS_PER_RING
}

/**
 * Calculate the allowed sector adjustment range for a ring transfer
 *
 * Rules:
 * - Must always move at least 1 sector forward (prograde)
 * - Can adjust up to ±3 sectors from base movement
 * - Maximum negative adjustment limited by velocity (can't go backwards)
 *
 * @param velocity - Current ring velocity (sectors per turn)
 * @returns Object with min and max adjustment values
 *
 * Examples:
 * - velocity 4: adjustment range -3 to +3 (total movement 1-7 sectors)
 * - velocity 2: adjustment range -1 to +3 (total movement 1-5 sectors)
 * - velocity 1: adjustment range 0 to +3 (total movement 1-4 sectors)
 */
export function getAdjustmentRange(velocity: number): { min: number; max: number } {
  // Maximum negative adjustment: can reduce movement but must keep at least 1 sector forward
  const maxNegativeAdjustment = Math.min(velocity - MIN_FORWARD_MOVEMENT, MAX_SECTOR_ADJUSTMENT)

  return {
    min: -maxNegativeAdjustment,
    max: MAX_SECTOR_ADJUSTMENT,
  }
}

/**
 * Calculate the total reaction mass cost for a burn including sector adjustment
 *
 * @param baseMassCost - Base mass cost from burn intensity
 * @param sectorAdjustment - Sector adjustment value (can be negative or positive)
 * @returns Total mass cost
 */
export function calculateBurnMassCost(baseMassCost: number, sectorAdjustment: number): number {
  const adjustmentCost = Math.abs(sectorAdjustment) * SECTOR_ADJUSTMENT_COST_PER_SECTOR
  return baseMassCost + adjustmentCost
}
