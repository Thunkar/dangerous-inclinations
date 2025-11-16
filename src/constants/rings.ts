import type { RingConfig } from '../types/game'

/**
 * DEPRECATED: Use well-specific ring configurations from gravityWells.ts
 * This is kept for backward compatibility but black hole and planets now have different configs
 *
 * Black hole: 4 rings (velocities 8,4,2,1) - dramatic doubling
 * Planets: 3 rings (velocities 4,2,1) - dramatic doubling
 * All rings: 24 sectors
 * Spacing: Large Ring 1 (120 units from center), then tight 50 unit gaps between rings
 */
export const RING_CONFIGS: RingConfig[] = [
  { ring: 1, velocity: 8, radius: 120, sectors: 24 },  // Innermost - BLAZING FAST
  { ring: 2, velocity: 4, radius: 170, sectors: 24 },  // Very Fast
  { ring: 3, velocity: 2, radius: 220, sectors: 24 },  // Medium
  { ring: 4, velocity: 1, radius: 270, sectors: 24 },  // Slow (black hole only)
]

export const ENERGY_PER_TURN = 10
export const MAX_REACTION_MASS = 24
export const STARTING_REACTION_MASS = 10
export const SCOOP_ENERGY_COST = 5

/**
 * Burn costs for ring transfers
 * Note: Ring changes are now velocity changes (inner rings are faster)
 * No sector adjustment - you land exactly at the mapped sector
 */
export const BURN_COSTS = {
  light: { energy: 1, mass: 1, rings: 1 },     // Transfer ±1 ring (change velocity by ±1)
  medium: { energy: 2, mass: 2, rings: 2 },    // Transfer ±2 rings (change velocity by ±2)
  heavy: { energy: 3, mass: 3, rings: 3 },     // Transfer ±3 rings (change velocity by ±3)
}

export const ROTATION_ENERGY_COST = 1

export function getRingConfig(ring: number): RingConfig | undefined {
  return RING_CONFIGS.find(r => r.ring === ring)
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
  fromRing: number,
  toRing: number,
  currentSector: number
): number {
  const fromConfig = getRingConfig(fromRing)
  const toConfig = getRingConfig(toRing)

  if (!fromConfig || !toConfig) {
    return 0
  }

  // All rings have 24 sectors, so mapping is trivial: stay at same sector
  if (fromConfig.sectors === toConfig.sectors) {
    return currentSector % toConfig.sectors
  }

  // Fallback for any edge cases (e.g., if configurations differ between wells)
  // Use angular fraction mapping
  const angularFraction = (currentSector + 1) / fromConfig.sectors
  const exactPosition = angularFraction * toConfig.sectors
  const epsilon = 0.0001
  const mappedSector = Math.floor(exactPosition - epsilon) % toConfig.sectors

  return mappedSector
}
