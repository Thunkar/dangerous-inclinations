import type { RingConfig } from '../types/game'

export const RING_CONFIGS: RingConfig[] = [
  { ring: 1, velocity: 12, radius: 50, sectors: 24 },
  { ring: 2, velocity: 10, radius: 80, sectors: 30 },
  { ring: 3, velocity: 8, radius: 110, sectors: 32 },
  { ring: 4, velocity: 6, radius: 140, sectors: 48 },
  { ring: 5, velocity: 4, radius: 170, sectors: 56 },
  { ring: 6, velocity: 3, radius: 200, sectors: 54 },
  { ring: 7, velocity: 2, radius: 230, sectors: 58 },
  { ring: 8, velocity: 1, radius: 260, sectors: 50 },
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
