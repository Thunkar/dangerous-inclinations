import { getRedis } from "./redis.js";
import type {
  GameState,
  PlayerAction,
  Player,
  ShipLoadout,
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
  validateLoadout,
  DEFAULT_LOADOUT,
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
} from "@dangerous-inclinations/engine";
import { getPlayer } from "./playerService.js";
import { broadcastToRoom } from "../websocket/roomHandler.js";
import type { DeploymentResult } from "@dangerous-inclinations/engine";

const GAME_KEY_PREFIX = "game:";
const GAME_HUMANS_KEY_PREFIX = "game-humans:";

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
        hasSubmittedLoadout: false, // Not submitted yet
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
    turn: 0, // Turn 0 = loadout/deployment phase
    activePlayerIndex: 0,
    players: playersWithMissions,
    turnLog: [],
    missiles: [],
    phase: "loadout", // Start in loadout phase (players choose subsystems)
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

/**
 * Delete a game and all associated data from Redis
 * Called when all human players have disconnected
 */
export async function deleteGame(gameId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${GAME_KEY_PREFIX}${gameId}`);
  await redis.del(`${GAME_HUMANS_KEY_PREFIX}${gameId}`);
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

/**
 * Result of a loadout submission
 */
export interface LoadoutResult {
  success: boolean;
  error?: string;
  errors?: string[];
  gameState: GameState;
}

/**
 * Submit a player's ship loadout
 * Called during the loadout phase (after missions are dealt, before deployment)
 */
export async function submitLoadout(
  gameId: string,
  playerId: string,
  loadout: ShipLoadout
): Promise<LoadoutResult> {
  const currentState = await getGameState(gameId);

  if (!currentState) {
    return {
      success: false,
      error: "Game not found",
      gameState: {} as GameState,
    };
  }

  // Validate game phase
  if (currentState.phase !== "loadout") {
    return {
      success: false,
      error: `Cannot submit loadout: game is in ${currentState.phase} phase`,
      gameState: currentState,
    };
  }

  // Find the player
  const playerIndex = currentState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    return {
      success: false,
      error: "Player not found in game",
      gameState: currentState,
    };
  }

  // Validate the loadout
  const validation = validateLoadout(loadout);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      gameState: currentState,
    };
  }

  // Calculate ship stats from loadout
  const stats = calculateShipStatsFromLoadout(loadout);

  // Update the player's ship with the loadout
  const player = currentState.players[playerIndex];
  const updatedShip = {
    ...player.ship,
    loadout,
    subsystems: createSubsystemsFromLoadout(loadout),
    dissipationCapacity: stats.dissipationCapacity,
    reactionMass: stats.reactionMass,
    criticalChance: stats.criticalChance,
  };

  const updatedPlayer = {
    ...player,
    ship: updatedShip,
    hasSubmittedLoadout: true,
  };

  const updatedPlayers = [...currentState.players];
  updatedPlayers[playerIndex] = updatedPlayer;

  const updatedState: GameState = {
    ...currentState,
    players: updatedPlayers,
  };

  await saveGameState(gameId, updatedState);

  return {
    success: true,
    gameState: updatedState,
  };
}

/**
 * Check if all players have submitted their loadouts
 * Uses the hasSubmittedLoadout flag on each player in game state
 */
function checkAllLoadoutsSubmitted(gameState: GameState): boolean {
  return gameState.players.every((p) => p.hasSubmittedLoadout);
}

/**
 * Transition from loadout phase to deployment phase
 * Called when all players have submitted their loadouts
 */
export async function transitionToDeploymentPhase(
  gameId: string
): Promise<GameState | null> {
  const currentState = await getGameState(gameId);
  if (!currentState) return null;

  if (currentState.phase !== "loadout") {
    return currentState;
  }

  const updatedState: GameState = {
    ...currentState,
    phase: "deployment",
  };

  await saveGameState(gameId, updatedState);

  // Broadcast the transition to game room
  // UI detects phase change from GAME_STATE_UPDATED payload
  broadcastToRoom(
    "game",
    {
      type: "GAME_STATE_UPDATED",
      payload: updatedState,
    },
    gameId
  );

  return updatedState;
}

/**
 * Submit loadout and check if all players are ready
 * If all players have submitted, transition to deployment
 */
export async function submitLoadoutAndCheckReady(
  gameId: string,
  playerId: string,
  loadout: ShipLoadout,
  humanPlayerIds: Set<string>
): Promise<LoadoutResult> {
  // First, submit the loadout
  let result = await submitLoadout(gameId, playerId, loadout);
  if (!result.success) {
    return result;
  }

  // Auto-submit DEFAULT_LOADOUT for bots that haven't submitted yet
  let currentState = result.gameState;
  for (const player of currentState.players) {
    if (!humanPlayerIds.has(player.id) && !player.hasSubmittedLoadout) {
      // Bot uses default loadout
      const botResult = await submitLoadout(gameId, player.id, DEFAULT_LOADOUT);
      if (botResult.success) {
        currentState = botResult.gameState;
      }
    }
  }

  // Check if all players have submitted
  if (checkAllLoadoutsSubmitted(currentState)) {
    const finalState = await transitionToDeploymentPhase(gameId);
    if (finalState) {
      return {
        success: true,
        gameState: finalState,
      };
    }
  }

  // Return the current state (still in loadout phase)
  return {
    success: true,
    gameState: currentState,
  };
}

