import { executeTurn, type TurnResult } from "../game/turns";
import type { GameState, Player, ShipState } from "../models/game";

/**
 * Helper to execute a turn with actions for the active player
 * Automatically assigns the correct playerId to all actions
 */
export function executeTurnWithActions(
  gameState: GameState,
  ...actions: any[]
): TurnResult {
  const activePlayer = gameState.players[gameState.activePlayerIndex];

  const actionsWithCorrectPlayer = actions
    .map((action) =>
      action ? { ...action, playerId: activePlayer.id } : action
    )
    .filter(Boolean);

  return executeTurn(gameState, actionsWithCorrectPlayer);
}

/**
 * Create a test player with default mission fields
 */
export function createTestPlayer(
  id: string,
  name: string,
  color: string,
  ship: ShipState
): Player {
  return {
    id,
    name,
    color,
    ship,
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
  };
}
