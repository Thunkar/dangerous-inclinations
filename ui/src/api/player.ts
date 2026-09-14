/**
 * Player endpoints: identity and session status.
 *
 * "Absent" and "could not ask" are different answers: only a 404 means the
 * server does not know this player. Anything else (offline, 5xx, a bad
 * gateway) is transient and must not cost the player their seat, so it is
 * thrown for the caller to retry.
 */
import { APIClientError, api } from './client'
import type { CreatePlayerRequest, CreatePlayerResponse, Player, PlayerStatusResponse } from './types'

function isNotFound(error: unknown): boolean {
  return error instanceof APIClientError && error.statusCode === 404
}

export async function createPlayer(playerName: string): Promise<CreatePlayerResponse> {
  return api.post<CreatePlayerResponse>('/api/players', { playerName } as CreatePlayerRequest)
}

/** The player, `null` if the server has no such player, or throws if it could not be asked. */
export async function getPlayer(playerId: string): Promise<Player | null> {
  try {
    return await api.get<Player>(`/api/players/${playerId}`)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function updatePlayerName(playerId: string, playerName: string): Promise<void> {
  await api.put(`/api/players/${playerId}`, { playerName })
}

/** Where the player is: their lobby (and, through it, their game) if any. */
export async function getPlayerStatus(playerId: string): Promise<PlayerStatusResponse | null> {
  try {
    return await api.get<PlayerStatusResponse>(`/api/players/${playerId}/status`)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}
