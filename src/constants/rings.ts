import type { RingConfig } from '../types/game'

export const RING_CONFIGS: RingConfig[] = [
  { ring: 1, velocity: 2, radius: 60, sectors: 6 },   // Fastest, largest sectors (1/3 revolution)
  { ring: 2, velocity: 2, radius: 110, sectors: 8 },  // 1/4 revolution
  { ring: 3, velocity: 2, radius: 160, sectors: 12 }, // 1/6 revolution
  { ring: 4, velocity: 1, radius: 210, sectors: 12 }, // 1/12 revolution
  { ring: 5, velocity: 1, radius: 260, sectors: 16 }, // 1/16 revolution
  { ring: 6, velocity: 1, radius: 310, sectors: 24 }, // 1/24 revolution
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
 * Uses angular position to map between rings. The calculation is simple:
 * 1. Calculate what fraction of the ring you're at (currentSector / totalSectors)
 * 2. Apply that same angular position to the destination ring
 * 3. Round to nearest sector
 *
 * Sector counts: R1=6, R2=8, R3=12, R4=12, R5=16, R6=24
 * All sector counts divide evenly into 24, making mapping predictable.
 *
 * Examples:
 * - Ring 1 sector 3 (halfway) → Ring 3: sector 6 (also halfway)
 * - Ring 3 sector 0 → Ring 1: sector 0 (both at 12 o'clock)
 * - Ring 6 sector 12 → Ring 2: sector 4 (both at 6 o'clock)
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
