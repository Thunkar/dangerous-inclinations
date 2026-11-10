/**
 * Lobby API service
 * Handles lobby creation, joining, and management
 */

import { api } from './client'
import type {
  AddBotRequest,
  CreateLobbyRequest,
  JoinLobbyRequest,
  LobbyListItem,
  PublicLobby,
  StartGameResponse,
  SuccessResponse,
} from '@dangerous-inclinations/engine'

/**
 * Get list of all available lobbies
 */
export async function listLobbies(): Promise<LobbyListItem[]> {
  return api.get<LobbyListItem[]>('/api/lobbies')
}

/**
 * Get details of a specific lobby
 */
export async function getLobby(lobbyId: string): Promise<PublicLobby> {
  return api.get<PublicLobby>(`/api/lobbies/${lobbyId}`)
}

/**
 * Create a new lobby
 */
export async function createLobby(
  lobbyName: string,
  maxPlayers: number,
  password?: string
): Promise<PublicLobby> {
  return api.post<PublicLobby>('/api/lobbies', {
    lobbyName,
    maxPlayers,
    password,
  } satisfies CreateLobbyRequest)
}

/**
 * Join an existing lobby
 */
export async function joinLobby(lobbyId: string, password?: string): Promise<PublicLobby> {
  return api.post<PublicLobby>('/api/lobbies/join', {
    lobbyId,
    password,
  } satisfies JoinLobbyRequest)
}

/**
 * Leave a lobby
 */
export async function leaveLobby(lobbyId: string): Promise<void> {
  await api.post<SuccessResponse>(`/api/lobbies/${lobbyId}/leave`, {})
}

/**
 * Start the game (host only)
 */
export async function startGame(lobbyId: string): Promise<StartGameResponse> {
  return api.post<StartGameResponse>(`/api/lobbies/${lobbyId}/start`, {})
}

/**
 * Add a bot to the lobby (host only)
 */
export async function addBot(lobbyId: string, botName?: string): Promise<PublicLobby> {
  return api.post<PublicLobby>(`/api/lobbies/${lobbyId}/bot`, { botName } satisfies AddBotRequest)
}

/**
 * Remove a bot from the lobby (host only)
 */
export async function removeBot(lobbyId: string, botId: string): Promise<void> {
  await api.delete<SuccessResponse>(`/api/lobbies/${lobbyId}/bot/${botId}`)
}
