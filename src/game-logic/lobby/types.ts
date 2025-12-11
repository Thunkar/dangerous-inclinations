/**
 * Lobby and Game Phase Types for Dangerous Inclinations
 *
 * The game progresses through distinct phases:
 * 1. Lobby - Players join, host can start when ready
 * 2. Setup - Missions are dealt automatically
 * 3. Deployment - Players place ships on BH Ring 4
 * 4. Active - Normal gameplay with mission tracking
 * 5. Ended - A player completed all 3 missions
 */

/**
 * Game phases in order of progression
 */
export type GamePhase = 'lobby' | 'setup' | 'deployment' | 'active' | 'ended'

/**
 * A slot in the lobby that can hold a player or be empty
 */
export interface PlayerSlot {
  playerId: string | null // null = empty slot
  playerName: string | null
  isReady: boolean
  isBot: boolean
}

/**
 * Lobby state for managing pre-game setup
 */
export interface LobbyState {
  id: string
  hostPlayerId: string
  phase: GamePhase
  maxPlayers: number
  minPlayers: number
  playerSlots: PlayerSlot[]
}

/**
 * Result of a lobby operation
 */
export interface LobbyResult {
  success: boolean
  error?: string
  lobbyState?: LobbyState
}

/**
 * Constants for lobby configuration
 */
export const LOBBY_CONSTANTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  DEFAULT_MAX_PLAYERS: 6,
} as const
