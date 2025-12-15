/**
 * Game API service
 * Handles game state retrieval and turn submission
 */

import { api } from './client'
import type { GameState } from '@dangerous-inclinations/engine'

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
