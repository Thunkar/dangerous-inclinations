/**
 * Type definitions for API requests and responses
 * These match the server's Zod schemas
 */

// ============================================================================
// Player Types
// ============================================================================

export interface Player {
  playerId: string;
  playerName: string;
  createdAt: number;
}

export interface CreatePlayerRequest {
  playerName: string;
}

export interface CreatePlayerResponse {
  playerId: string;
  playerName: string;
}

// ============================================================================
// Lobby Types
// ============================================================================

export interface LobbyPlayer {
  playerId: string;
  playerName: string;
  isBot: boolean;
  isReady: boolean;
}

export interface ServerLobby {
  lobbyId: string;
  lobbyName: string;
  hasPassword: boolean;
  maxPlayers: number;
  players: LobbyPlayer[];
  hostPlayerId: string;
  gameId?: string; // Set when game starts
  createdAt: number;
}

export interface LobbyListItem {
  lobbyId: string;
  lobbyName: string;
  hasPassword: boolean;
  maxPlayers: number;
  currentPlayers: number;
  gameStarted: boolean;
  createdAt: number;
}

export interface CreateLobbyRequest {
  lobbyName: string;
  password?: string;
  maxPlayers: number;
}

export interface CreateLobbyResponse {
  lobbyId: string;
  lobbyName: string;
  maxPlayers: number;
  hostPlayerId: string;
}

export interface JoinLobbyRequest {
  lobbyId: string;
  password?: string;
}

export interface JoinLobbyResponse {
  success: boolean;
  lobby: ServerLobby;
}

export interface StartGameResponse {
  gameId: string;
}

// ============================================================================
// Game Types
// ============================================================================

// Import GameState from engine
export type { GameState, PlayerAction } from "@dangerous-inclinations/engine";

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessage =
  | {
      type: "GAME_STATE";
      payload: {
        gameState: any; // Will be GameState from engine
      };
    }
  | {
      type: "ERROR";
      payload: {
        message: string;
      };
    }
  | {
      type: "PLAYER_JOINED";
      payload: LobbyPlayer;
    }
  | {
      type: "PLAYER_LEFT";
      payload: {
        playerId: string;
      };
    }
  | {
      type: "LOBBY_STATE";
      payload: ServerLobby;
    }
  | {
      type: "GAME_STARTING";
      payload: {
        gameId: string;
        gameState: any; // Will be GameState from engine
      };
    };

export interface SubmitTurnRequest {
  gameId: string;
  actions: any[]; // Will be PlayerAction[] from engine
}

// ============================================================================
// API Error Types
// ============================================================================

export interface APIError {
  error: string;
  statusCode?: number;
}
