import type { GameState, TurnLogEntry, PlayerAction } from '../types/game'
import { processActions } from './actionProcessors'
import { processMissiles } from './missiles'

/**
 * Result of executing a complete game turn
 */
export interface TurnResult {
  gameState: GameState
  logEntries: TurnLogEntry[]
  errors?: string[]
}

/**
 * Create a deep copy snapshot of game state for validation
 */
function createGameStateSnapshot(gameState: GameState): GameState {
  return {
    ...gameState,
    players: gameState.players.map(player => ({
      ...player,
      ship: {
        ...player.ship,
        subsystems: player.ship.subsystems.map(s => ({ ...s })),
        reactor: { ...player.ship.reactor },
        heat: { ...player.ship.heat },
        transferState: player.ship.transferState ? { ...player.ship.transferState } : null,
      },
    })),
    turnLog: [...gameState.turnLog],
    missiles: gameState.missiles ? gameState.missiles.map(m => ({ ...m })) : [], // Deep copy missiles array
  }
}

/**
 * Execute a complete game turn for the active player with snapshot-based validation
 *
 * @param gameState - Current game state
 * @param actions - Array of actions for the active player to execute
 *
 * Validation flow:
 * 1. Create a snapshot of the entire game state
 * 2. Process all actions on the snapshot (validation + execution in one step)
 * 3. If successful, use the snapshot as the new game state
 * 4. If errors occur, discard snapshot and return original state with errors
 *
 * Execution phases:
 * 1. Process actions in priority order:
 *    - Energy allocation
 *    - Energy deallocation
 *    - Heat venting
 *    - Rotation (if needed)
 *    - Movement (coast or burn)
 *    - Weapon firing (all simultaneous)
 *    - Heat damage (from previous turns)
 *    - Heat generation (from this turn)
 * 2. Move to next player
 * 3. Prepare next player's turn (resolve their transfer if arriving)
 */
export function executeTurn(gameState: GameState, actions: PlayerAction[]): TurnResult {
  const activePlayerIndex = gameState.activePlayerIndex
  const activePlayer = gameState.players[activePlayerIndex]
  const allLogEntries: TurnLogEntry[] = []

  // Validate all actions belong to the active player
  const wrongPlayerActions = actions.filter(a => a.playerId !== activePlayer.id)
  if (wrongPlayerActions.length > 0) {
    return {
      gameState,
      logEntries: [],
      errors: ['All actions must belong to the active player'],
    }
  }

  // Create a snapshot of the game state
  const snapshot = createGameStateSnapshot(gameState)

  // Process actions on the snapshot (validation + execution in one step)
  const processResult = processActions(snapshot, actions)

  // If processing failed, discard snapshot and return original state
  if (!processResult.success) {
    return {
      gameState,
      logEntries: [],
      errors: processResult.errors || ['Failed to process actions'],
    }
  }

  // Success - use the snapshot as the new game state
  let updatedGameState = processResult.gameState
  allLogEntries.push(...processResult.logEntries)

  // Process missiles owned by the active player (after their actions complete)
  if (updatedGameState.missiles.length > 0) {
    const playerMissiles = updatedGameState.missiles.filter(m => m.ownerId === activePlayer.id)
    if (playerMissiles.length > 0) {
      const missileResult = processMissiles(updatedGameState, activePlayer.id)
      updatedGameState = missileResult.gameState
      allLogEntries.push(...missileResult.logEntries)
    }
  }

  // Move to next player
  const nextPlayerIndex = (gameState.activePlayerIndex + 1) % updatedGameState.players.length
  const isNewTurn = nextPlayerIndex === 0

  updatedGameState = {
    ...updatedGameState,
    turn: isNewTurn ? gameState.turn + 1 : gameState.turn,
    activePlayerIndex: nextPlayerIndex,
    turnLog: [...gameState.turnLog, ...allLogEntries],
  }

  // All transfers complete immediately, no need to resolve on turn start

  return {
    gameState: updatedGameState,
    logEntries: allLogEntries,
  }
}
