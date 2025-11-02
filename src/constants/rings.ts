import type { RingConfig } from '../types/game'

export const RING_CONFIGS: RingConfig[] = [
  { ring: 1, velocity: 8, radius: 50, sectors: 24 }, // 24 ÷ 8 = 3 sectors/turn (fastest)
  { ring: 2, velocity: 6, radius: 90, sectors: 36 }, // 36 ÷ 6 = 6 sectors/turn
  { ring: 3, velocity: 6, radius: 130, sectors: 48 }, // 48 ÷ 6 = 8 sectors/turn
  { ring: 4, velocity: 4, radius: 170, sectors: 60 }, // 60 ÷ 4 = 15 sectors/turn
  { ring: 5, velocity: 3, radius: 210, sectors: 72 }, // 72 ÷ 3 = 24 sectors/turn
  { ring: 6, velocity: 3, radius: 250, sectors: 84 }, // 84 ÷ 3 = 28 sectors/turn
  { ring: 7, velocity: 2, radius: 290, sectors: 96 }, // 96 ÷ 2 = 48 sectors/turn (slowest)
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
 * Preserves angular position (e.g., 25% around Ring 1 → 25% around Ring 2).
 */
export function mapSectorOnTransfer(
  fromRing: number,
  toRing: number,
  currentSector: number
): number {
  const fromConfig = getRingConfig(fromRing)
  const toConfig = getRingConfig(toRing)

  if (!fromConfig || !toConfig) return currentSector

  // Calculate angular position as a fraction (0.0 to 1.0)
  const angularPosition = currentSector / fromConfig.sectors

  // Map to new ring's sector count, rounding to nearest sector
  const newSector = Math.round(angularPosition * toConfig.sectors)

  // Handle wraparound (should rarely happen, but safety check)
  return newSector % toConfig.sectors
}
