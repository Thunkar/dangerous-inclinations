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
  botDecideActions,
  dealMissions,
  getAvailableDeploymentSectors,
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
        missions: [],
        completedMissionCount: 0,
        cargo: [],
        hasDeployed: false, // Not deployed yet
      };
    })
  );

  // Get planets for mission generation
  const planets = GRAVITY_WELLS.filter((well) => well.type === "planet");

  // Deal missions to all players so they can see them during deployment
  const { playerMissions, playerCargo } = dealMissions(players, planets);

  // Update players with their missions and cargo
  const playersWithMissions = players.map((player) => ({
    ...player,
    missions: playerMissions.get(player.id) || [],
    cargo: playerCargo.get(player.id) || [],
  }));

  // Create initial stations for all planets
  const stations = createInitialStations(GRAVITY_WELLS);

  const initialState: GameState = {
    turn: 0, // Turn 0 = deployment phase
    activePlayerIndex: 0,
    players: playersWithMissions,
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

export interface TurnResult {
  success: boolean;
  gameState?: GameState;
  turnNumber?: number;
  error?: string;
  errors?: string[];
}

export async function processPlayerTurn(
  gameId: string,
  playerId: string,
  actions: PlayerAction[]
): Promise<TurnResult> {
  const currentState = await getGameState(gameId);

  if (!currentState) {
    return { success: false, error: "Game not found" };
  }

  // Validate it's this player's turn
  const activePlayer = currentState.players[currentState.activePlayerIndex];
  if (activePlayer.id !== playerId) {
    return { success: false, error: "Not your turn" };
  }

  const turnNumber = currentState.turn;

  // Execute turn using the game engine
  const turnResult = executeTurn(currentState, actions);

  // Check for engine errors
  if (turnResult.errors && turnResult.errors.length > 0) {
    return { success: false, errors: turnResult.errors };
  }

  const newState = turnResult.gameState;
  await saveGameState(gameId, newState);

  return { success: true, gameState: newState, turnNumber };
}

/**
 * Check if the current active player is a bot (non-human)
 * @param state - Current game state
 * @param humanPlayerIds - Set of player IDs that are humans (not bots)
 */
function isActivePlayerBot(
  state: GameState,
  humanPlayerIds: Set<string>
): boolean {
  const activePlayer = state.players[state.activePlayerIndex];
  // Check if active player is NOT in the human players set
  // Also check game is still active and player is alive
  return (
    activePlayer &&
    !humanPlayerIds.has(activePlayer.id) &&
    state.phase === "active" &&
    activePlayer.ship.hitPoints > 0
  );
}

/**
 * Execute bot turns until a human player is active
 * Broadcasts each bot turn to all clients for animation
 * @param gameId - The game ID
 * @param gameState - Current game state
 * @param humanPlayerIds - Set of player IDs that are humans (not bots)
 */
export async function executeBotsIfNeeded(
  gameId: string,
  gameState: GameState,
  humanPlayerIds: Set<string>
): Promise<GameState> {
  let state = gameState;

  while (isActivePlayerBot(state, humanPlayerIds)) {
    const botPlayer = state.players[state.activePlayerIndex];
    const botPlayerId = botPlayer.id;
    const turnNumber = state.turn;

    // Get bot's decision
    const botDecision = botDecideActions(state, botPlayerId);

    // Execute the bot's turn
    const result = executeTurn(state, botDecision.actions);

    if (result.errors && result.errors.length > 0) {
      console.error(`[Bot ${botPlayerId}] Turn errors:`, result.errors);
      // Skip this bot's turn on error - shouldn't happen but be safe
      break;
    }

    state = result.gameState;

    // Broadcast bot turn with actions for animations
    broadcastToRoom(
      "game",
      {
        type: "TURN_EXECUTED",
        payload: {
          gameState: state,
          actions: botDecision.actions,
          playerId: botPlayerId,
          turnNumber: turnNumber,
        },
      },
      gameId
    );

    await saveGameState(gameId, state);
  }

  return state;
}

/**
 * Check if the current active player in deployment phase is a bot
 */
function isActiveDeploymentPlayerBot(
  state: GameState,
  humanPlayerIds: Set<string>
): boolean {
  if (state.phase !== "deployment") return false;

  const activePlayer = state.players[state.activePlayerIndex];
  return activePlayer && !activePlayer.hasDeployed && !humanPlayerIds.has(activePlayer.id);
}

/**
 * Execute bot deployments until a human player needs to deploy
 * @param gameId - The game ID
 * @param gameState - Current game state
 * @param humanPlayerIds - Set of player IDs that are humans (not bots)
 */
async function executeBotDeploymentsIfNeeded(
  gameId: string,
  gameState: GameState,
  humanPlayerIds: Set<string>
): Promise<GameState> {
  let state = gameState;

  while (isActiveDeploymentPlayerBot(state, humanPlayerIds)) {
    const botPlayer = state.players[state.activePlayerIndex];
    const availableSectors = getAvailableDeploymentSectors(state);

    if (availableSectors.length === 0) {
      console.error(`[Bot ${botPlayer.id}] No available sectors for deployment`);
      break;
    }

    // Pick a random available sector
    const randomIndex = Math.floor(Math.random() * availableSectors.length);
    const chosenSector = availableSectors[randomIndex];

    // Deploy the bot
    const result = deployShip(state, botPlayer.id, chosenSector);

    if (!result.success) {
      console.error(`[Bot ${botPlayer.id}] Deployment failed:`, result.error);
      break;
    }

    state = result.gameState;

    // Broadcast bot deployment
    broadcastToRoom(
      "game",
      {
        type: "GAME_STATE_UPDATED",
        payload: state,
      },
      gameId
    );

    await saveGameState(gameId, state);
  }

  return state;
}

export async function processDeployment(
  gameId: string,
  playerId: string,
  sector: number,
  humanPlayerIds?: Set<string>
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

  let finalState = result.gameState;

  // If we have humanPlayerIds, execute any bot deployments
  if (humanPlayerIds) {
    finalState = await executeBotDeploymentsIfNeeded(gameId, finalState, humanPlayerIds);
  }

  // Check if all players have deployed
  if (checkAllDeployed(finalState)) {
    finalState = transitionToActivePhase(finalState);
    await saveGameState(gameId, finalState);

    // Broadcast the transition to active phase
    broadcastToRoom(
      "game",
      {
        type: "GAME_STATE_UPDATED",
        payload: finalState,
      },
      gameId
    );
  } else {
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
  }

  return {
    ...result,
    gameState: finalState,
  };
}

