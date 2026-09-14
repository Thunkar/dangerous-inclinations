/**
 * Types for REST requests/responses and WebSocket messages.
 * The shapes follow docs/protocol.md.
 */
import type { GameEvent, GameView, PlayerAction } from '@dangerous-inclinations/engine'

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface Player {
  playerId: string
  playerName: string
  createdAt: number
}

export interface CreatePlayerRequest {
  playerName: string
}

export interface CreatePlayerResponse {
  playerId: string
  playerName: string
}

// ---------------------------------------------------------------------------
// Lobbies
// ---------------------------------------------------------------------------

export interface LobbyPlayer {
  playerId: string
  playerName: string
  isBot: boolean
  isReady: boolean
}

export interface ServerLobby {
  lobbyId: string
  lobbyName: string
  hasPassword: boolean
  maxPlayers: number
  players: LobbyPlayer[]
  hostPlayerId: string
  /** Set once the game has started. */
  gameId?: string
  createdAt: number
}

export interface LobbyListItem {
  lobbyId: string
  lobbyName: string
  hasPassword: boolean
  maxPlayers: number
  currentPlayers: number
  gameStarted: boolean
  createdAt: number
}

export interface CreateLobbyRequest {
  lobbyName: string
  password?: string
  maxPlayers: number
}

export interface CreateLobbyResponse {
  lobbyId: string
  lobbyName: string
  maxPlayers: number
  hostPlayerId: string
}

export interface JoinLobbyRequest {
  lobbyId: string
  password?: string
}

export interface JoinLobbyResponse {
  success: boolean
  lobby: ServerLobby
}

export interface StartGameResponse {
  gameId: string
}

/** `GET /api/players/:id/status` — the lobby (with its gameId) is all the client needs to resume. */
export interface PlayerStatusResponse {
  player: Player
  lobby: ServerLobby | null
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

/** `GET /api/games/:gameId` and every phase-change message carry a view plus the visible history. */
export interface GameViewResponse {
  view: GameView
  events: GameEvent[]
}

export interface ViewResponse {
  view: GameView
}

export interface ForkResponse {
  gameId: string
  view: GameView
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

export interface TurnExecutedPayload {
  view: GameView
  events: GameEvent[]
  playerId: string
  turnNumber: number
  /** Only present when the recipient is the player who acted. */
  actions?: PlayerAction[]
  rewind?: true
}

export type GameSocketMessage =
  | { type: 'CONNECTED'; room: 'game'; roomId: string }
  | { type: 'GAME_VIEW'; payload: GameViewResponse }
  | { type: 'TURN_EXECUTED'; payload: TurnExecutedPayload }
  | { type: 'TURN_ERROR'; payload: { error?: string; errors?: string[] } }

export type LobbySocketMessage =
  | { type: 'CONNECTED'; room: 'lobby'; roomId: string }
  | { type: 'LOBBY_STATE'; payload: ServerLobby }
  | { type: 'PLAYER_JOINED'; payload: LobbyPlayer }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'GAME_STARTING'; payload: { gameId: string } }

export type GlobalSocketMessage =
  | { type: 'CONNECTED'; room: 'global' }
  | {
      type: 'LOBBY_CREATED'
      payload: {
        lobbyId: string
        lobbyName: string
        hasPassword: boolean
        maxPlayers: number
        currentPlayers: number
        createdAt: number
      }
    }
  | { type: 'LOBBY_DELETED'; payload: { lobbyId: string } }
  | { type: 'LOBBY_UPDATED'; payload: { lobbyId: string; currentPlayers: number; gameStarted: boolean } }

export interface SubmitTurnMessage {
  type: 'SUBMIT_TURN'
  payload: { actions: PlayerAction[]; turn: number; activePlayerId: string }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface APIError {
  error?: string
  errors?: string[]
  statusCode?: number
}
