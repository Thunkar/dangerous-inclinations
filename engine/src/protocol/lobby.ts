/**
 * Players and lobbies on the wire (docs/protocol.md, "Players and lobbies"):
 * the request schemas the server checks, and the shapes it answers and
 * broadcasts with. None of it carries game state.
 */
import { z } from 'zod'
import { MAX_PLAYERS, MIN_PLAYERS } from '../models/game.ts'
import type { GameView } from '../game/view.ts'

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** The outside programs that may play a seat. */
export const AGENT_DRIVERS = ['claude', 'codex'] as const

/**
 * An AI agent sitting at a seat: which driver plays it and with which model.
 * Public, like a name: everyone at the table sees who is a person, a bot and
 * an agent. A bot is the server's own AI; an agent is an outside program.
 */
export const AgentSchema = z.object({
  driver: z.enum(AGENT_DRIVERS),
  model: z.string().min(1).max(80),
})
export type AgentInfo = z.infer<typeof AgentSchema>

/** `POST /api/players`. The server picks the player id; a body that names one is refused. */
export const CreatePlayerSchema = z
  .object({
    playerName: z.string().min(1).max(50),
    agent: AgentSchema.optional(),
  })
  .strict()
export type CreatePlayerRequest = z.input<typeof CreatePlayerSchema>

/** `PUT /api/players/:playerId`. */
export const UpdatePlayerSchema = z.object({
  playerName: z.string().min(1).max(50),
})
export type UpdatePlayerRequest = z.input<typeof UpdatePlayerSchema>

/** A registered player, as the server stores it and every player route answers with it. */
export interface PlayerRecord {
  playerId: string
  playerName: string
  /** Present when the seat is played by an outside agent. */
  agent?: AgentInfo
  createdAt: number
}

/** `GET /api/players/:playerId/status`: where the caller sits, and its view once the game started. */
export interface PlayerStatusResponse {
  player: PlayerRecord
  lobby: PublicLobby | null
  view: GameView | null
}

// ---------------------------------------------------------------------------
// Lobbies
// ---------------------------------------------------------------------------

/** `POST /api/lobbies`. */
export const CreateLobbySchema = z.object({
  lobbyName: z.string().min(1).max(100),
  /** Empty or absent means no password. */
  password: z.string().min(0).max(100).optional(),
  // The engine builds games of MIN_PLAYERS..MAX_PLAYERS seats; a lobby that
  // allowed more could never start.
  maxPlayers: z.number().int().finite().min(MIN_PLAYERS).max(MAX_PLAYERS).default(MAX_PLAYERS),
})
export type CreateLobbyRequest = z.input<typeof CreateLobbySchema>
/** A lobby request once checked: `maxPlayers` filled in. */
export type CreateLobbyOptions = z.output<typeof CreateLobbySchema>

/** `POST /api/lobbies/join`. */
export const JoinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  password: z.string().optional(),
})
export type JoinLobbyRequest = z.input<typeof JoinLobbySchema>

/** `POST /api/lobbies/:lobbyId/bot`. */
export interface AddBotRequest {
  botName?: string
}

/** Who plays a seat, as the lobby shows it to everyone: a person, a bot, or an agent and its model. */
export interface LobbySeat {
  playerId: string
  playerName: string
  /** The server's own AI. */
  isBot: boolean
  /** An outside agent (Claude, Codex) playing this seat; absent for people and bots. */
  agent?: AgentInfo
}

/** A lobby as a client sees it: whether it has a password, never the password. */
export interface PublicLobby {
  lobbyId: string
  lobbyName: string
  hasPassword: boolean
  maxPlayers: number
  players: LobbySeat[]
  hostPlayerId: string
  /** Set once the host starts the game. */
  gameId?: string
  createdAt: number
}

/** One row of `GET /api/lobbies`: no passwords and no player ids. */
export interface LobbyListItem {
  lobbyId: string
  lobbyName: string
  hasPassword: boolean
  maxPlayers: number
  currentPlayers: number
  gameStarted: boolean
  /** The caller has a seat at this table: it can go back to it. */
  seated: boolean
  createdAt: number
}

/** `POST /api/lobbies/:lobbyId/start`. */
export interface StartGameResponse {
  gameId: string
}

/** Leaving a lobby, removing a bot. */
export interface SuccessResponse {
  success: true
}

// ---------------------------------------------------------------------------
// Sockets: /ws/lobby and /ws/global (server to client only)
// ---------------------------------------------------------------------------

export type LobbySocketMessage =
  | { type: 'CONNECTED'; room: 'lobby'; roomId: string }
  | { type: 'PLAYER_JOINED'; payload: LobbySeat }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'GAME_STARTING'; payload: { gameId: string } }

export type GlobalSocketMessage =
  | { type: 'CONNECTED'; room: 'global' }
  | { type: 'LOBBY_CREATED'; payload: Omit<LobbyListItem, 'gameStarted' | 'seated'> }
  | {
      type: 'LOBBY_UPDATED'
      payload: Pick<LobbyListItem, 'lobbyId' | 'currentPlayers' | 'gameStarted'>
    }
  | { type: 'LOBBY_DELETED'; payload: { lobbyId: string } }
