/**
 * Deployment System for Dangerous Inclinations
 *
 * During the deployment phase, players place their ships on BH Ring 4.
 * Deployment order: player order (first player deploys first)
 * Restrictions: Cannot deploy on an already-occupied sector
 */

import type {
  GameState,
  Player,
  DeployShipAction,
  TurnLogEntry,
} from "../models/game";
import { createInitialShipState } from "../utils/subsystemHelpers";

/**
 * Deployment constants
 */
export const DEPLOYMENT_CONSTANTS = {
  WELL_ID: "blackhole",
  RING: 4,
  SECTORS: 24, // BH Ring 4 has 24 sectors
} as const;

/**
 * Get all sectors on BH Ring 4 that are available for deployment
 * Excludes sectors already occupied by deployed ships
 */
export function getAvailableDeploymentSectors(gameState: GameState): number[] {
  const occupiedSectors = new Set<number>();

  for (const player of gameState.players) {
    if (
      player.hasDeployed &&
      player.ship.wellId === DEPLOYMENT_CONSTANTS.WELL_ID &&
      player.ship.ring === DEPLOYMENT_CONSTANTS.RING
    ) {
      occupiedSectors.add(player.ship.sector);
    }
  }

  const availableSectors: number[] = [];
  for (let i = 0; i < DEPLOYMENT_CONSTANTS.SECTORS; i++) {
    if (!occupiedSectors.has(i)) {
      availableSectors.push(i);
    }
  }

  return availableSectors;
}

/**
 * Check if a sector is available for deployment
 */
export function isSectorAvailable(
  gameState: GameState,
  sector: number
): boolean {
  if (sector < 0 || sector >= DEPLOYMENT_CONSTANTS.SECTORS) {
    return false;
  }

  const availableSectors = getAvailableDeploymentSectors(gameState);
  return availableSectors.includes(sector);
}

/**
 * Result of a deployment action
 */
export interface DeploymentResult {
  success: boolean;
  error?: string;
  gameState: GameState;
  logEntry?: TurnLogEntry;
}

/**
 * Deploy a player's ship to a specific sector
 */
export function deployShip(
  gameState: GameState,
  playerId: string,
  sector: number
): DeploymentResult {
  // Validate game phase
  if (gameState.phase !== "deployment") {
    return {
      success: false,
      error: "Cannot deploy ship: game is not in deployment phase",
      gameState,
    };
  }

  // Find the player
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    return {
      success: false,
      error: `Player ${playerId} not found`,
      gameState,
    };
  }

  const player = gameState.players[playerIndex];

  // Check if player already deployed
  if (player.hasDeployed) {
    return {
      success: false,
      error: `Player ${player.name} has already deployed`,
      gameState,
    };
  }

  // Check if it's this player's turn to deploy
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  if (activePlayer.id !== playerId) {
    return {
      success: false,
      error: `Not ${player.name}'s turn to deploy`,
      gameState,
    };
  }

  // Validate sector
  if (!isSectorAvailable(gameState, sector)) {
    return {
      success: false,
      error: `Sector ${sector} is not available for deployment`,
      gameState,
    };
  }

  // Create ship at deployment location
  const deployedShip = createInitialShipState({
    wellId: DEPLOYMENT_CONSTANTS.WELL_ID,
    ring: DEPLOYMENT_CONSTANTS.RING,
    sector,
    facing: "prograde",
  });

  // Update player
  const updatedPlayer: Player = {
    ...player,
    ship: deployedShip,
    hasDeployed: true,
  };

  // Update game state
  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = updatedPlayer;

  // Advance to next player who hasn't deployed
  let nextActiveIndex =
    (gameState.activePlayerIndex + 1) % gameState.players.length;
  // Find the next player who hasn't deployed yet
  for (let i = 0; i < gameState.players.length; i++) {
    const checkIndex =
      (gameState.activePlayerIndex + 1 + i) % gameState.players.length;
    // Check if this player hasn't deployed (use updated array for current player)
    const checkPlayer =
      checkIndex === playerIndex ? updatedPlayer : updatedPlayers[checkIndex];
    if (!checkPlayer.hasDeployed) {
      nextActiveIndex = checkIndex;
      break;
    }
  }

  // Create log entry
  const logEntry: TurnLogEntry = {
    turn: gameState.turn,
    playerId,
    playerName: player.name,
    action: "Deploy",
    result: `Deployed to BH Ring 4, Sector ${sector}`,
  };

  return {
    success: true,
    gameState: {
      ...gameState,
      players: updatedPlayers,
      activePlayerIndex: nextActiveIndex,
      turnLog: [...gameState.turnLog, logEntry],
    },
    logEntry,
  };
}

/**
 * Process a deploy ship action
 */
export function processDeployAction(
  gameState: GameState,
  action: DeployShipAction
): DeploymentResult {
  return deployShip(gameState, action.playerId, action.data.sector);
}

/**
 * Check if all players have deployed
 */
export function checkAllDeployed(gameState: GameState): boolean {
  return gameState.players.every((player) => player.hasDeployed);
}

/**
 * Advance to the next player who needs to deploy
 * Returns the new active player index
 */
export function getNextDeploymentPlayer(gameState: GameState): number {
  // Find first player who hasn't deployed
  for (let i = 0; i < gameState.players.length; i++) {
    if (!gameState.players[i].hasDeployed) {
      return i;
    }
  }
  // All deployed - this shouldn't happen during deployment phase
  return 0;
}

/**
 * Transition from deployment phase to active phase
 * Called when all players have deployed
 */
export function transitionToActivePhase(gameState: GameState): GameState {
  if (!checkAllDeployed(gameState)) {
    return gameState; // Not ready to transition
  }

  return {
    ...gameState,
    phase: "active",
    activePlayerIndex: 0, // First player starts
    turn: 1,
  };
}

/**
 * Get deployment status for UI display
 */
export function getDeploymentStatus(gameState: GameState): {
  totalPlayers: number;
  deployedCount: number;
  currentPlayer: Player | null;
  availableSectors: number[];
} {
  const deployedCount = gameState.players.filter((p) => p.hasDeployed).length;
  const currentPlayer =
    gameState.phase === "deployment"
      ? gameState.players[gameState.activePlayerIndex]
      : null;

  return {
    totalPlayers: gameState.players.length,
    deployedCount,
    currentPlayer,
    availableSectors: getAvailableDeploymentSectors(gameState),
  };
}
