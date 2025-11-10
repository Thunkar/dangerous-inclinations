import type { Player, PlayerAction } from '../../../types/game'
import { createTestShip } from './ships'

/**
 * Creates a test player with default ship
 */
export function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Test Player',
    color: '#ff0000',
    ship: createTestShip(),
    pendingAction: null,
    ...overrides,
  }
}

/**
 * Creates multiple test players for multiplayer scenarios
 */
export function createTestPlayers(count: number): Player[] {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']

  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: `Player ${i + 1}`,
    color: colors[i % colors.length],
    ship: createTestShip({
      ring: 3,
      sector: i * 4, // Spread players around the ring
    }),
    pendingAction: null,
  }))
}

/**
 * Creates a player with a pending action
 */
export function createPlayerWithAction(action: PlayerAction): Player {
  return createTestPlayer({
    pendingAction: action,
  })
}
