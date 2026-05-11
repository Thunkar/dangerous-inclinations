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
 * selectedMissionIds: IDs of the 3 missions chosen from the player's 5 offers
 */
export async function submitLoadout(
  gameId: string,
  loadout: ShipLoadout,
  selectedMissionIds?: string[]
): Promise<{ success: boolean; gameState: GameState }> {
  return api.post<{ success: boolean; gameState: GameState }>(`/api/games/${gameId}/loadout`, { loadout, selectedMissionIds })
}

/**
 * Rewind a live game to a previous turn snapshot. `turnIndex` is an index
 * into `recording.turns[]`; `-1` means "back to the post-deploy initial
 * state". The server replaces the current game state with the snapshot,
 * truncates the recording, and re-broadcasts so all connected clients
 * see the rewind.
 */
export async function rewindGame(gameId: string, turnIndex: number): Promise<{ success: boolean; gameState: GameState }> {
  return api.post<{ success: boolean; gameState: GameState }>(
    `/api/games/${gameId}/rewind`,
    { turnIndex },
  )
}

/**
 * Fork a recording into a fresh live game. The forking player picks a
 * `turnIndex` and (optionally) which original player to step into. The
 * server creates a new game in Redis with the forked snapshot and
 * returns its gameId. The caller is expected to navigate the user
 * into the new game (e.g. via `?fork=<gameId>`).
 */
export async function forkRecording(args: {
  recordingId: string
  turnIndex: number
  impersonateOriginalPlayerId?: string
}): Promise<{ success: boolean; gameId: string; gameState: GameState }> {
  return api.post<{ success: boolean; gameId: string; gameState: GameState }>(
    `/api/games/fork`,
    args,
  )
}
