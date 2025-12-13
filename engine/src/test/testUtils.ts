import {
  applyOrbitalMovement,
  applyRotation,
  completeRingTransfer,
  initiateBurn,
} from "../game/movement";
import { executeTurn, type TurnResult } from "../game/turns";
import type {
  ActionType,
  BurnIntensity,
  Facing,
  GameState,
  Player,
  ShipState,
} from "../models/game";

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

/**
 * Calculate ship position after movement with pending burn data
 * This is used during the planning phase to show where the ship will be after movement
 *
 * IMPORTANT: With immediate transfers, burns complete on the same turn.
 * During the current turn, weapons firing after movement will fire from:
 * - The destination ring and sector (after transfer completion)
 *
 * @param initialShip - Current ship state
 * @param pendingFacing - Facing after rotation action
 * @param pendingMovement - Movement action data (burn or coast)
 * @param rotateBeforeMove - Whether rotation happens before movement (default true for backwards compatibility)
 * @returns Projected ship state after movement (at destination ring if burning)
 */
export function calculatePostMovementPosition(
  initialShip: ShipState,
  pendingFacing?: Facing,
  pendingMovement?: {
    actionType: ActionType;
    burnIntensity?: BurnIntensity;
    sectorAdjustment: number;
  },
  rotateBeforeMove: boolean = true
): ShipState {
  let projectedShip = { ...initialShip };

  // Apply rotation BEFORE movement if specified (affects burn direction)
  if (
    rotateBeforeMove &&
    pendingFacing &&
    pendingFacing !== projectedShip.facing
  ) {
    projectedShip = applyRotation(projectedShip, pendingFacing);
  }

  // Apply orbital movement (ship moves along current ring)
  // This happens for BOTH coast and burn actions
  projectedShip = applyOrbitalMovement(projectedShip);

  // If burning, complete the transfer immediately (same turn)
  if (pendingMovement?.actionType === "burn" && pendingMovement.burnIntensity) {
    // Create a mock burn action to simulate the transfer
    const mockBurnAction = {
      type: "burn" as const,
      playerId: "mock",
      data: {
        burnIntensity: pendingMovement.burnIntensity,
        sectorAdjustment: pendingMovement.sectorAdjustment,
      },
    };

    // Initiate and complete burn immediately (all transfers are immediate)
    projectedShip = initiateBurn(projectedShip, mockBurnAction);
    if (projectedShip.transferState) {
      projectedShip = completeRingTransfer(projectedShip);
    }
  }

  // Apply rotation AFTER movement if specified (for facing after burn)
  if (
    !rotateBeforeMove &&
    pendingFacing &&
    pendingFacing !== projectedShip.facing
  ) {
    projectedShip = applyRotation(projectedShip, pendingFacing);
  }

  return projectedShip;
}
