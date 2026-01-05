/**
 * Game API service
 * Handles game state retrieval and turn submission
 */

import { api } from './client'
import type { GameState, ShipLoadout } from '@dangerous-inclinations/engine'

/**
 * Get game state for an active game
 */
export async function getGameState(gameId: string): Promise<GameState> {
  return api.get<GameState>(`/api/games/${gameId}`)
}

/**
 * Deploy ship during deployment phase
 */
export async function deployShip(gameId: string, sector: number): Promise<GameState> {
  return api.post<GameState>(`/api/games/${gameId}/deploy`, { sector })
}

/**
 * Submit ship loadout during loadout phase
 */
export async function submitLoadout(
  gameId: string,
  loadout: ShipLoadout
): Promise<{ success: boolean; gameState: GameState }> {
  return api.post<{ success: boolean; gameState: GameState }>(`/api/games/${gameId}/loadout`, { loadout })
}
