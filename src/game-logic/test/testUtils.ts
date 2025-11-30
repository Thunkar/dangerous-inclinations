import { executeTurn, type TurnResult } from '../turns'
import type { GameState } from '../../types/game'

/**
 * Helper to execute a turn with actions for the active player
 * Automatically assigns the correct playerId to all actions
 */
export function executeTurnWithActions(gameState: GameState, ...actions: any[]): TurnResult {
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  const actionsWithCorrectPlayer = actions
    .map(action => (action ? { ...action, playerId: activePlayer.id } : action))
    .filter(Boolean)

  return executeTurn(gameState, actionsWithCorrectPlayer)
}
