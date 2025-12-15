import { getRedis } from "./redis.js";
import type {
  GameState,
  PlayerAction,
  Player,
} from "@dangerous-inclinations/engine";
import {
  executeTurn,
  createInitialShipState,
  createInitialStations,
  GRAVITY_WELLS,
  deployShip,
  checkAllDeployed,
  transitionToActivePhase,
} from "@dangerous-inclinations/engine";
import { getPlayer } from "./playerService.js";
import { broadcastToRoom } from "../websocket/roomHandler.js";
import type { DeploymentResult } from "@dangerous-inclinations/engine";

const GAME_KEY_PREFIX = "game:";

// Player colors for up to 6 players
const PLAYER_COLORS = [
  "#2196f3", // Blue
  "#f44336", // Red
  "#4caf50", // Green
  "#ff9800", // Orange
  "#9c27b0", // Purple
  "#00bcd4", // Cyan
];

export async function createGame(
  gameId: string,
  lobbyPlayerIds: string[]
): Promise<GameState> {
  // Create players with initial ship states (not deployed yet)
  const players: Player[] = await Promise.all(
    lobbyPlayerIds.map(async (playerId, index) => {
      const playerData = await getPlayer(playerId);
      return {
        id: playerId,
        name: playerData?.playerName || `Player ${index + 1}`,
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        ship: createInitialShipState({
          wellId: "blackhole",
          ring: 4, // Start at BH Ring 4 (deployment ring)
          sector: 0, // Will be set during deployment
          facing: "prograde",
        }),
        missions: [], // Missions will be assigned after deployment
        completedMissionCount: 0,
        cargo: [],
        hasDeployed: false, // Not deployed yet
      };
    })
  );

  // Create initial stations for all planets
  const stations = createInitialStations(GRAVITY_WELLS);

  const initialState: GameState = {
    turn: 0, // Turn 0 = deployment phase
    activePlayerIndex: 0,
    players,
    turnLog: [],
    missiles: [],
    phase: "deployment",
    stations,
  };

  await saveGameState(gameId, initialState);
  return initialState;
}

export async function getGameState(gameId: string): Promise<GameState | null> {
  const redis = getRedis();
  const data = await redis.get(`${GAME_KEY_PREFIX}${gameId}`);

  if (!data) return null;

  return JSON.parse(data) as GameState;
}

export async function saveGameState(
  gameId: string,
  state: GameState
): Promise<void> {
  const redis = getRedis();
  await redis.set(`${GAME_KEY_PREFIX}${gameId}`, JSON.stringify(state));
}

export async function processPlayerTurn(
  gameId: string,
  playerId: string,
  actions: PlayerAction[]
): Promise<GameState | null> {
  const currentState = await getGameState(gameId);

  if (!currentState) return null;

  // Validate it's this player's turn
  const activePlayer = currentState.players[currentState.activePlayerIndex];
  if (activePlayer.id !== playerId) {
    throw new Error("Not your turn");
  }

  // Execute turn using the game engine
  const turnResult = executeTurn(currentState, actions);

  // Extract the new game state from the turn result
  const newState = turnResult.gameState;

  await saveGameState(gameId, newState);

  return newState;
}

export async function processDeployment(
  gameId: string,
  playerId: string,
  sector: number
): Promise<DeploymentResult> {
  const currentState = await getGameState(gameId);

  if (!currentState) {
    return {
      success: false,
      error: "Game not found",
      gameState: {} as GameState,
    };
  }

  // Process deployment using engine function
  const result = deployShip(currentState, playerId, sector);

  if (!result.success) {
    return result;
  }

  // Check if all players have deployed
  let finalState = result.gameState;
  if (checkAllDeployed(finalState)) {
    finalState = transitionToActivePhase(finalState);
  }

  // Save updated game state
  await saveGameState(gameId, finalState);

  // Broadcast updated game state to all players in the game room
  broadcastToRoom(
    "game",
    {
      type: "GAME_STATE_UPDATED",
      payload: finalState,
    },
    gameId
  );

  return {
    ...result,
    gameState: finalState,
  };
}
