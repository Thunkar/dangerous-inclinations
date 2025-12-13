import { getRedis } from "./redis.js";
import type { GameState, PlayerAction } from "@dangerous-inclinations/engine";
import { executeTurn } from "@dangerous-inclinations/engine";

const GAME_KEY_PREFIX = "game:";

export async function createGame(
  gameId: string,
  playerIds: string[],
): Promise<GameState> {
  // TODO: Initialize game state using the engine's initialization logic
  // This should create players, ships, and set up the initial game board
  const initialState: GameState = {
    players: playerIds.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      // ... initialize player state from engine
    })),
    // ... other game state
  } as any; // Placeholder - will need proper initialization

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
  state: GameState,
): Promise<void> {
  const redis = getRedis();
  await redis.set(`${GAME_KEY_PREFIX}${gameId}`, JSON.stringify(state));
}

export async function processPlayerTurn(
  gameId: string,
  playerId: string,
  actions: PlayerAction[],
): Promise<GameState | null> {
  const currentState = await getGameState(gameId);

  if (!currentState) return null;

  // Validate it's this player's turn
  const activePlayer = currentState.players[currentState.activePlayerIndex];
  if (activePlayer.id !== playerId) {
    throw new Error("Not your turn");
  }

  // Execute turn using the game engine
  const newState = executeTurn(currentState, actions);

  await saveGameState(gameId, newState);

  return newState;
}
