/**
 * Lobby API service
 * Handles lobby creation, joining, and management
 */

import { api } from './client'
import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  LobbyListItem,
  PointsToWin,
  ServerLobby,
  StartGameResponse,
  UpdateLobbyRequest,
} from './types'

/**
 * Get list of all available lobbies
 */
export async function listLobbies(): Promise<LobbyListItem[]> {
  return api.get<LobbyListItem[]>('/api/lobbies')
}

/**
 * Get details of a specific lobby
 */
export async function getLobby(lobbyId: string): Promise<ServerLobby> {
  return api.get<ServerLobby>(`/api/lobbies/${lobbyId}`)
}

/**
 * Create a new lobby
 */
export async function createLobby(
  lobbyName: string,
  maxPlayers: number,
  pointsToWin: PointsToWin,
  password?: string
): Promise<CreateLobbyResponse> {
  return api.post<CreateLobbyResponse>('/api/lobbies', {
    lobbyName,
    maxPlayers,
    pointsToWin,
    password,
  } as CreateLobbyRequest)
}

/**
 * Change a table setting before the deal (host only). Once the game exists the
 * agreement is on the state and the server refuses to move it.
 */
export async function updateLobbySettings(
  lobbyId: string,
  settings: UpdateLobbyRequest
): Promise<ServerLobby> {
  return api.patch<ServerLobby>(`/api/lobbies/${lobbyId}`, settings)
}

/**
 * Join an existing lobby
 */
export async function joinLobby(lobbyId: string, password?: string): Promise<JoinLobbyResponse> {
  return api.post<JoinLobbyResponse>('/api/lobbies/join', {
    lobbyId,
    password,
  } as JoinLobbyRequest)
}

/**
 * Leave a lobby
 */
export async function leaveLobby(lobbyId: string): Promise<void> {
  await api.post(`/api/lobbies/${lobbyId}/leave`, {})
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
export async function addBot(lobbyId: string, botName?: string): Promise<ServerLobby> {
  return api.post<ServerLobby>(`/api/lobbies/${lobbyId}/bot`, { botName })
}

/**
 * Remove a bot from the lobby (host only)
 */
export async function removeBot(lobbyId: string, botId: string): Promise<void> {
  await api.delete(`/api/lobbies/${lobbyId}/bot/${botId}`)
}
