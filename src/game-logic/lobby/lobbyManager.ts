/**
 * Lobby Manager for Dangerous Inclinations
 *
 * Manages the game lobby where players join before starting a game.
 * Handles phase transitions from lobby → setup → deployment → active
 */

import type { GameState, Player, GravityWell } from '../../types/game'
import type { LobbyState, PlayerSlot, LobbyResult } from './types'
import { LOBBY_CONSTANTS } from './types'
import { createInitialShipState } from '../../utils/subsystemHelpers'
import { createInitialStations } from '../stations'
import { dealMissions } from '../missions/missionDeck'

/**
 * Generate a unique lobby ID
 */
function generateLobbyId(): string {
  return `lobby-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a new lobby
 */
export function createLobby(
  hostPlayerId: string,
  hostPlayerName: string,
  maxPlayers: number = LOBBY_CONSTANTS.DEFAULT_MAX_PLAYERS
): LobbyState {
  const slots: PlayerSlot[] = Array(maxPlayers)
    .fill(null)
    .map((_, index) =>
      index === 0
        ? {
            playerId: hostPlayerId,
            playerName: hostPlayerName,
            isReady: false,
            isBot: false,
          }
        : {
            playerId: null,
            playerName: null,
            isReady: false,
            isBot: false,
          }
    )

  return {
    id: generateLobbyId(),
    hostPlayerId,
    phase: 'lobby',
    maxPlayers,
    minPlayers: LOBBY_CONSTANTS.MIN_PLAYERS,
    playerSlots: slots,
  }
}

/**
 * Join a lobby
 */
export function joinLobby(
  lobby: LobbyState,
  playerId: string,
  playerName: string
): LobbyResult {
  if (lobby.phase !== 'lobby') {
    return { success: false, error: 'Game has already started' }
  }

  // Find first empty slot
  const emptySlotIndex = lobby.playerSlots.findIndex(slot => slot.playerId === null)
  if (emptySlotIndex === -1) {
    return { success: false, error: 'Lobby is full' }
  }

  // Check if player already in lobby
  if (lobby.playerSlots.some(slot => slot.playerId === playerId)) {
    return { success: false, error: 'Player already in lobby' }
  }

  const updatedSlots = [...lobby.playerSlots]
  updatedSlots[emptySlotIndex] = {
    playerId,
    playerName,
    isReady: false,
    isBot: false,
  }

  return {
    success: true,
    lobbyState: { ...lobby, playerSlots: updatedSlots },
  }
}

/**
 * Leave a lobby
 */
export function leaveLobby(lobby: LobbyState, playerId: string): LobbyResult {
  if (lobby.phase !== 'lobby') {
    return { success: false, error: 'Cannot leave after game has started' }
  }

  // Host cannot leave (they would need to close the lobby)
  if (playerId === lobby.hostPlayerId) {
    return { success: false, error: 'Host cannot leave lobby. Close the lobby instead.' }
  }

  const slotIndex = lobby.playerSlots.findIndex(slot => slot.playerId === playerId)
  if (slotIndex === -1) {
    return { success: false, error: 'Player not in lobby' }
  }

  const updatedSlots = [...lobby.playerSlots]
  updatedSlots[slotIndex] = {
    playerId: null,
    playerName: null,
    isReady: false,
    isBot: false,
  }

  return {
    success: true,
    lobbyState: { ...lobby, playerSlots: updatedSlots },
  }
}

/**
 * Toggle player ready status
 */
export function setPlayerReady(
  lobby: LobbyState,
  playerId: string,
  isReady: boolean
): LobbyResult {
  if (lobby.phase !== 'lobby') {
    return { success: false, error: 'Cannot change ready status after game starts' }
  }

  const slotIndex = lobby.playerSlots.findIndex(slot => slot.playerId === playerId)
  if (slotIndex === -1) {
    return { success: false, error: 'Player not in lobby' }
  }

  const updatedSlots = [...lobby.playerSlots]
  updatedSlots[slotIndex] = { ...updatedSlots[slotIndex], isReady }

  return {
    success: true,
    lobbyState: { ...lobby, playerSlots: updatedSlots },
  }
}

/**
 * Add a bot to the lobby
 */
export function addBot(lobby: LobbyState, botName?: string): LobbyResult {
  if (lobby.phase !== 'lobby') {
    return { success: false, error: 'Cannot add bot after game starts' }
  }

  // Find first empty slot
  const emptySlotIndex = lobby.playerSlots.findIndex(slot => slot.playerId === null)
  if (emptySlotIndex === -1) {
    return { success: false, error: 'Lobby is full' }
  }

  const botId = `bot-${Date.now()}-${emptySlotIndex}`
  const botDisplayName = botName || `Bot ${emptySlotIndex + 1}`

  const updatedSlots = [...lobby.playerSlots]
  updatedSlots[emptySlotIndex] = {
    playerId: botId,
    playerName: botDisplayName,
    isReady: true, // Bots are always ready
    isBot: true,
  }

  return {
    success: true,
    lobbyState: { ...lobby, playerSlots: updatedSlots },
  }
}

/**
 * Remove a bot from the lobby
 */
export function removeBot(lobby: LobbyState, botId: string): LobbyResult {
  if (lobby.phase !== 'lobby') {
    return { success: false, error: 'Cannot remove bot after game starts' }
  }

  const slotIndex = lobby.playerSlots.findIndex(
    slot => slot.playerId === botId && slot.isBot
  )
  if (slotIndex === -1) {
    return { success: false, error: 'Bot not found in lobby' }
  }

  const updatedSlots = [...lobby.playerSlots]
  updatedSlots[slotIndex] = {
    playerId: null,
    playerName: null,
    isReady: false,
    isBot: false,
  }

  return {
    success: true,
    lobbyState: { ...lobby, playerSlots: updatedSlots },
  }
}

/**
 * Check if the game can start
 */
export function canStartGame(lobby: LobbyState): { canStart: boolean; reason?: string } {
  const filledSlots = lobby.playerSlots.filter(slot => slot.playerId !== null)

  if (filledSlots.length < lobby.minPlayers) {
    return {
      canStart: false,
      reason: `Need at least ${lobby.minPlayers} players (have ${filledSlots.length})`,
    }
  }

  const unreadyPlayers = filledSlots.filter(slot => !slot.isReady)
  if (unreadyPlayers.length > 0) {
    return {
      canStart: false,
      reason: `${unreadyPlayers.length} player(s) not ready`,
    }
  }

  return { canStart: true }
}

/**
 * Player colors for assignment
 */
const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

/**
 * Create players from lobby slots
 */
function createPlayersFromLobby(lobby: LobbyState): Player[] {
  const filledSlots = lobby.playerSlots.filter(slot => slot.playerId !== null)

  return filledSlots.map((slot, index) => ({
    id: slot.playerId!,
    name: slot.playerName!,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    // Ship will be set during deployment, but we need a placeholder
    ship: createInitialShipState({
      wellId: 'blackhole',
      ring: 4,
      sector: 0,
      facing: 'prograde',
    }),
    // Mission system fields - will be populated during setup
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: false,
  }))
}

/**
 * Start the game - transition from lobby to setup phase
 */
export function startGame(
  lobby: LobbyState,
  gravityWells: GravityWell[]
): { success: boolean; error?: string; gameState?: GameState } {
  const canStart = canStartGame(lobby)
  if (!canStart.canStart) {
    return { success: false, error: canStart.reason }
  }

  // Create players from lobby slots
  const players = createPlayersFromLobby(lobby)

  // Create stations for all planets
  const stations = createInitialStations(gravityWells)

  // Get just the planets for mission generation
  const planets = gravityWells.filter(w => w.type === 'planet')

  // Deal missions to players
  const { playerMissions, playerCargo } = dealMissions(players, planets)

  // Update players with their missions and cargo
  const playersWithMissions = players.map(player => ({
    ...player,
    missions: playerMissions.get(player.id) || [],
    cargo: playerCargo.get(player.id) || [],
  }))

  // Create initial game state in deployment phase
  const gameState: GameState = {
    turn: 0, // Turn 0 is deployment
    activePlayerIndex: 0,
    players: playersWithMissions,
    turnLog: [],
    missiles: [],
    status: 'active',
    phase: 'deployment',
    lobbyState: { ...lobby, phase: 'deployment' },
    stations,
  }

  return { success: true, gameState }
}

/**
 * Get lobby status for UI display
 */
export function getLobbyStatus(lobby: LobbyState): {
  playerCount: number
  maxPlayers: number
  readyCount: number
  canStart: boolean
  startBlockReason?: string
} {
  const filledSlots = lobby.playerSlots.filter(slot => slot.playerId !== null)
  const readyCount = filledSlots.filter(slot => slot.isReady).length
  const startCheck = canStartGame(lobby)

  return {
    playerCount: filledSlots.length,
    maxPlayers: lobby.maxPlayers,
    readyCount,
    canStart: startCheck.canStart,
    startBlockReason: startCheck.reason,
  }
}
