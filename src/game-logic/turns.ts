import type { GameState, TurnLogEntry, PlayerAction } from '../types/game'
import { validatePlayerActions } from './validation'
import { processActions } from './actionProcessors'
import { mapSectorOnTransfer, getRingConfig } from '../constants/rings'

/**
 * Result of executing a complete game turn
 */
export interface TurnResult {
  gameState: GameState
  logEntries: TurnLogEntry[]
  errors?: string[]
}

/**
 * Prepare the game state for the next player's turn
 * This resolves any transfers for the next player so they see their ship in the correct position
 *
 * @param gameState - Current game state
 * @returns Updated game state with next player's transfer resolved (if any)
 */
export function prepareTurn(gameState: GameState): GameState {
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  // If the active player has a pending transfer, complete it now
  if (activePlayer.ship.transferState?.arriveNextTurn) {
    const resolvedPlayers = [...gameState.players]
    const resolvedShip = completeTransfer(activePlayer.ship)
    resolvedPlayers[gameState.activePlayerIndex] = {
      ...activePlayer,
      ship: resolvedShip,
    }

    return {
      ...gameState,
      players: resolvedPlayers,
    }
  }

  return gameState
}

/**
 * Execute a complete game turn for the active player
 *
 * @param gameState - Current game state (should already be prepared with prepareTurn)
 * @param actions - Array of actions for the active player to execute
 *
 * Execution phases:
 * 1. Validate all actions
 * 2. Process actions in priority order:
 *    - Energy allocation
 *    - Energy deallocation
 *    - Heat venting
 *    - Rotation (if needed)
 *    - Movement (coast or burn)
 *    - Weapon firing (all simultaneous)
 *    - Heat damage (from previous turns)
 *    - Heat generation (from this turn)
 * 3. Move to next player
 * 4. Prepare next player's turn (resolve their transfer if arriving)
 */
export function executeTurn(gameState: GameState, actions: PlayerAction[]): TurnResult {
  const activePlayer = gameState.players[gameState.activePlayerIndex]
  const allLogEntries: TurnLogEntry[] = []
  const errors: string[] = []

  // Validate all actions belong to the active player
  const wrongPlayerActions = actions.filter(a => a.playerId !== activePlayer.id)
  if (wrongPlayerActions.length > 0) {
    return {
      gameState,
      logEntries: [],
      errors: ['All actions must belong to the active player'],
    }
  }

  // Validate action set
  const validation = validatePlayerActions(gameState, activePlayer.id, actions)
  if (!validation.valid) {
    return {
      gameState,
      logEntries: [],
      errors: [validation.reason || 'Invalid action set'],
    }
  }

  // Process all actions and get updated game state
  const processResult = processActions(gameState, actions)

  if (!processResult.success) {
    return {
      gameState,
      logEntries: [],
      errors: processResult.errors || ['Failed to process actions'],
    }
  }

  let updatedGameState = processResult.gameState
  allLogEntries.push(...processResult.logEntries)

  // Move to next player
  const nextPlayerIndex = (gameState.activePlayerIndex + 1) % updatedGameState.players.length
  const isNewTurn = nextPlayerIndex === 0

  updatedGameState = {
    ...updatedGameState,
    turn: isNewTurn ? gameState.turn + 1 : gameState.turn,
    activePlayerIndex: nextPlayerIndex,
    turnLog: [...gameState.turnLog, ...allLogEntries],
  }

  // Prepare the next player's turn (resolve their transfer if arriving)
  const nextPlayer = updatedGameState.players[nextPlayerIndex]
  if (nextPlayer.ship.transferState?.arriveNextTurn) {
    const resolvedPlayers = [...updatedGameState.players]
    const resolvedShip = completeTransfer(nextPlayer.ship)
    resolvedPlayers[nextPlayerIndex] = {
      ...nextPlayer,
      ship: resolvedShip,
    }

    // Add transfer log entry
    allLogEntries.push({
      turn: updatedGameState.turn,
      playerId: nextPlayer.id,
      playerName: nextPlayer.name,
      action: 'Transfer Complete',
      result: `Arrived at ring ${resolvedShip.ring}, sector ${resolvedShip.sector}`,
    })

    updatedGameState = {
      ...updatedGameState,
      players: resolvedPlayers,
      turnLog: [...updatedGameState.turnLog, allLogEntries[allLogEntries.length - 1]],
    }
  }

  return {
    gameState: updatedGameState,
    logEntries: allLogEntries,
    errors: errors.length > 0 ? errors : undefined,
  }
}

/**
 * Complete a ship's transfer to destination ring/sector
 */
function completeTransfer(ship: any): any {
  if (!ship.transferState) {
    return ship
  }

  const { destinationRing, sectorAdjustment } = ship.transferState

  const baseSector = mapSectorOnTransfer(ship.ring, destinationRing, ship.sector)
  const destRingConfig = getRingConfig(destinationRing)

  if (!destRingConfig) {
    return ship
  }

  const finalSector = (baseSector + sectorAdjustment + destRingConfig.sectors) % destRingConfig.sectors

  return {
    ...ship,
    ring: destinationRing,
    sector: finalSector,
    transferState: null,
  }
}
