/**
 * Lobby API service
 * Handles lobby creation, joining, and management
 */

import { api } from "./client";
import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  LobbyListItem,
  ServerLobby,
  StartGameResponse,
} from "./types";

/**
 * Get list of all available lobbies
 */
export async function listLobbies(): Promise<LobbyListItem[]> {
  return api.get<LobbyListItem[]>("/api/lobbies");
}

/**
 * Get details of a specific lobby
 */
export async function getLobby(lobbyId: string): Promise<ServerLobby> {
  return api.get<ServerLobby>(`/api/lobbies/${lobbyId}`);
}

/**
 * Create a new lobby
 */
export async function createLobby(
  lobbyName: string,
  maxPlayers: number,
  password?: string,
): Promise<CreateLobbyResponse> {
  return api.post<CreateLobbyResponse>("/api/lobbies", {
    lobbyName,
    maxPlayers,
    password,
  } as CreateLobbyRequest);
}

/**
 * Join an existing lobby
 */
export async function joinLobby(
  lobbyId: string,
  password?: string,
): Promise<JoinLobbyResponse> {
  return api.post<JoinLobbyResponse>("/api/lobbies/join", {
    lobbyId,
    password,
  } as JoinLobbyRequest);
}

/**
 * Leave a lobby
 */
export async function leaveLobby(lobbyId: string): Promise<void> {
  await api.post(`/api/lobbies/${lobbyId}/leave`, {});
}

/**
 * Start the game (host only)
 */
export async function startGame(lobbyId: string): Promise<StartGameResponse> {
  return api.post<StartGameResponse>(`/api/lobbies/${lobbyId}/start`);
}
