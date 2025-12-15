/**
 * Player API service
 * Handles player creation and authentication
 */

import { api } from "./client";
import type {
  CreatePlayerRequest,
  CreatePlayerResponse,
  Player,
} from "./types";

/**
 * Create a new player or authenticate existing player
 */
export async function createPlayer(
  playerName: string,
): Promise<CreatePlayerResponse> {
  return api.post<CreatePlayerResponse>("/api/players", {
    playerName,
  } as CreatePlayerRequest);
}

/**
 * Get player information by ID
 */
export async function getPlayer(playerId: string): Promise<Player | null> {
  try {
    return await api.get<Player>(`/api/players/${playerId}`);
  } catch (error) {
    // Player not found
    return null;
  }
}

/**
 * Update player name
 */
export async function updatePlayerName(
  playerId: string,
  playerName: string,
): Promise<void> {
  await api.put(`/api/players/${playerId}`, {
    playerName,
  });
}
