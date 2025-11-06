import type { RingConfig } from '../types/game'

export const RING_CONFIGS: RingConfig[] = [
  { ring: 1, velocity: 1, radius: 60, sectors: 6 },   // 1/6 revolution per turn (largest sectors)
  { ring: 2, velocity: 1, radius: 110, sectors: 12 }, // 1/12 revolution per turn
  { ring: 3, velocity: 1, radius: 160, sectors: 24 }, // 1/24 revolution per turn
  { ring: 4, velocity: 1, radius: 210, sectors: 48 }, // 1/48 revolution per turn
  { ring: 5, velocity: 1, radius: 260, sectors: 96 }, // 1/96 revolution per turn (smallest sectors)
]

export const ENERGY_PER_TURN = 10
export const MAX_REACTION_MASS = 24
export const STARTING_REACTION_MASS = 10
export const SCOOP_ENERGY_COST = 5

export const BURN_COSTS = {
  standard: { energy: 1, mass: 1, rings: 1 },
  hard: { energy: 2, mass: 2, rings: 2 },
  extreme: { energy: 3, mass: 3, rings: 3 },
}

export const ROTATION_ENERGY_COST = 1

export function getRingConfig(ring: number): RingConfig | undefined {
  return RING_CONFIGS.find(r => r.ring === ring)
}

/**
 * Maps a sector number when transferring between rings with different sector counts.
 *
 * PERFECT DOUBLING PROGRESSION (5 rings, constant velocity):
 * Ring sectors: 6 → 12 → 24 → 48 → 96 (each ring doubles)
 * Ring velocity: ALL velocity 1 (constant angular velocity)
 *
 * WHY THIS DESIGN:
 * - Uniform velocity means speed differences come ONLY from sector size
 * - Inner rings "feel faster" because they have larger sectors
 * - Outer rings "feel slower" because they have more, smaller sectors
 * - No complex velocity calculations - just 1 sector per turn, always
 *
 * Transfer rules (EXTREMELY simple for tabletop):
 * 1. Adjacent rings (all 2× relationship): multiply/divide by 2
 *    - R1 S3 → R2: S6 (3 × 2 = 6)
 *    - R2 S6 → R3: S12 (6 × 2 = 12)
 *    - R3 S12 → R4: S24 (12 × 2 = 24)
 *    - R4 S24 → R5: S48 (24 × 2 = 48)
 *    Reverse: just divide by 2
 *    - R2 S6 → R1: S3 (6 ÷ 2 = 3)
 *    - R3 S12 → R2: S6 (12 ÷ 2 = 6)
 *    - R4 S24 → R3: S12 (24 ÷ 2 = 12)
 *    - R5 S48 → R4: S24 (48 ÷ 2 = 24)
 *
 * 2. Non-adjacent: use angular fraction (sector / totalSectors) × newTotal
 *    - R1 S3 → R3: (3/6) × 24 = S12 (half circle → half circle)
 *    - R1 S3 → R5: (3/6) × 96 = S48 (half circle → half circle)
 *    - R2 S6 → R4: (6/12) × 48 = S24 (half circle → half circle)
 *
 * Movement per turn (ALL rings move 1 sector):
 * - R1: 1/6 revolution = 60° (FASTEST FEEL - huge 60° sectors)
 * - R2: 1/12 revolution = 30° (fast feel - 30° sectors)
 * - R3: 1/24 revolution = 15° (medium feel - 15° sectors)
 * - R4: 1/48 revolution = 7.5° (slow feel - 7.5° sectors)
 * - R5: 1/96 revolution = 3.75° (SLOWEST FEEL - tiny 3.75° sectors)
 *
 * Strategic depth: R1 feels 16× faster than R5 despite same velocity!
 * Perfect for tabletop: "Everyone moves 1 sector, then check slingshot bonus"
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

  // Calculate angular position as a fraction of the full circle (0 to 1)
  const angularFraction = currentSector / fromConfig.sectors

  // Map to destination ring and round to nearest sector
  const mappedSector = Math.round(angularFraction * toConfig.sectors) % toConfig.sectors

  return mappedSector
}
