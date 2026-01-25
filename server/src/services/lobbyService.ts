import { randomUUID } from "crypto";
import { getRedis } from "./redis.js";
import { broadcastToRoom } from "../websocket/roomHandler.js";
import type { CreateLobbyInput } from "../schemas/lobby.js";
import { getPlayer } from "./playerService.js";
import { createGame } from "./gameService.js";

const LOBBY_KEY_PREFIX = "lobby:";
const LOBBY_LIST_KEY = "lobbies";

export interface LobbyPlayer {
  playerId: string;
  playerName: string;
  isBot: boolean;
  isReady: boolean;
}

export interface Lobby {
  lobbyId: string;
  lobbyName: string;
  password?: string;
  maxPlayers: number;
  players: LobbyPlayer[];
  hostPlayerId: string;
  gameId?: string; // Set when game starts
  createdAt: number;
}

export async function createLobby(
  input: CreateLobbyInput,
  hostPlayerId: string
): Promise<Lobby> {
  const redis = getRedis();
  const lobbyId = randomUUID();

  // Get host player info
  const hostPlayer = await getPlayer(hostPlayerId);
  if (!hostPlayer) {
    throw new Error("Host player not found");
  }

  const lobby: Lobby = {
    lobbyId,
    lobbyName: input.lobbyName,
    password: input.password,
    maxPlayers: input.maxPlayers,
    players: [
      {
        playerId: hostPlayerId,
        playerName: hostPlayer.playerName,
        isBot: false,
        isReady: false,
      },
    ],
    hostPlayerId,
    createdAt: Date.now(),
  };

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));
  await redis.sadd(LOBBY_LIST_KEY, lobbyId);

  // Broadcast to global room
  broadcastToRoom("global", {
    type: "LOBBY_CREATED",
    payload: {
      lobbyId: lobby.lobbyId,
      lobbyName: lobby.lobbyName,
      hasPassword: !!lobby.password,
      maxPlayers: lobby.maxPlayers,
      currentPlayers: lobby.players.length,
      createdAt: lobby.createdAt,
    },
  });

  return lobby;
}

export async function getLobby(lobbyId: string): Promise<Lobby | null> {
  const redis = getRedis();
  const data = await redis.get(`${LOBBY_KEY_PREFIX}${lobbyId}`);

  if (!data) return null;

  return JSON.parse(data) as Lobby;
}

export async function listLobbies(): Promise<Lobby[]> {
  const redis = getRedis();
  const lobbyIds = await redis.smembers(LOBBY_LIST_KEY);

  const lobbies = await Promise.all(
    lobbyIds.map(async (id) => {
      const data = await redis.get(`${LOBBY_KEY_PREFIX}${id}`);
      return data ? (JSON.parse(data) as Lobby) : null;
    })
  );

  return lobbies.filter((l): l is Lobby => l !== null);
}

/**
 * Find the lobby that a player is currently in
 */
export async function findPlayerLobby(playerId: string): Promise<Lobby | null> {
  const lobbies = await listLobbies();

  for (const lobby of lobbies) {
    if (lobby.players.some((p) => p.playerId === playerId)) {
      return lobby;
    }
  }

  return null;
}

export async function joinLobby(
  lobbyId: string,
  playerId: string,
  password?: string
): Promise<{ success: boolean; error?: string; lobby?: Lobby }> {
  const redis = getRedis();
  const lobby = await getLobby(lobbyId);

  if (!lobby) {
    return { success: false, error: "Lobby not found" };
  }

  if (lobby.password && lobby.password !== password) {
    return { success: false, error: "Incorrect password" };
  }

  if (lobby.players.length >= lobby.maxPlayers) {
    return { success: false, error: "Lobby is full" };
  }

  // Check if player already in lobby
  if (lobby.players.some((p) => p.playerId === playerId)) {
    return { success: true, lobby }; // Already in lobby
  }

  if (lobby.gameId) {
    return { success: false, error: "Game already started" };
  }

  // Get player info
  const player = await getPlayer(playerId);
  if (!player) {
    return { success: false, error: "Player not found" };
  }

  // Add player to lobby
  const newPlayer: LobbyPlayer = {
    playerId,
    playerName: player.playerName,
    isBot: false,
    isReady: false,
  };
  lobby.players.push(newPlayer);
  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));

  // Broadcast to lobby room
  broadcastToRoom(
    "lobby",
    {
      type: "PLAYER_JOINED",
      payload: newPlayer,
    },
    lobbyId
  );

  // Broadcast lobby update to global room (for lobby browser to update player count)
  broadcastToRoom("global", {
    type: "LOBBY_UPDATED",
    payload: {
      lobbyId: lobby.lobbyId,
      currentPlayers: lobby.players.length,
      gameStarted: !!lobby.gameId,
    },
  });

  return { success: true, lobby };
}

export async function addBot(
  lobbyId: string,
  hostPlayerId: string,
  botName?: string
): Promise<{ success: boolean; error?: string; lobby?: Lobby }> {
  const redis = getRedis();
  const lobby = await getLobby(lobbyId);

  if (!lobby) {
    return { success: false, error: "Lobby not found" };
  }

  // Only host can add bots
  if (lobby.hostPlayerId !== hostPlayerId) {
    return { success: false, error: "Only the host can add bots" };
  }

  if (lobby.players.length >= lobby.maxPlayers) {
    return { success: false, error: "Lobby is full" };
  }

  if (lobby.gameId) {
    return { success: false, error: "Game already started" };
  }

  // Generate bot player
  const botId = `bot-${randomUUID()}`;
  const botNumber = lobby.players.filter((p) => p.isBot).length + 1;
  const newBot: LobbyPlayer = {
    playerId: botId,
    playerName: botName || `Bot ${botNumber}`,
    isBot: true,
    isReady: true, // Bots are always ready
  };

  lobby.players.push(newBot);
  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));

  // Broadcast to lobby room
  broadcastToRoom(
    "lobby",
    {
      type: "PLAYER_JOINED",
      payload: newBot,
    },
    lobbyId
  );

  // Broadcast lobby update to global room
  broadcastToRoom("global", {
    type: "LOBBY_UPDATED",
    payload: {
      lobbyId: lobby.lobbyId,
      currentPlayers: lobby.players.length,
      gameStarted: !!lobby.gameId,
    },
  });

  return { success: true, lobby };
}

export async function removeBot(
  lobbyId: string,
  hostPlayerId: string,
  botId: string
): Promise<{ success: boolean; error?: string }> {
  const redis = getRedis();
  const lobby = await getLobby(lobbyId);

  if (!lobby) {
    return { success: false, error: "Lobby not found" };
  }

  // Only host can remove bots
  if (lobby.hostPlayerId !== hostPlayerId) {
    return { success: false, error: "Only the host can remove bots" };
  }

  if (lobby.gameId) {
    return { success: false, error: "Game already started" };
  }

  // Find the bot
  const botIndex = lobby.players.findIndex(
    (p) => p.playerId === botId && p.isBot
  );
  if (botIndex === -1) {
    return { success: false, error: "Bot not found" };
  }

  // Remove the bot
  lobby.players.splice(botIndex, 1);
  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));

  // Broadcast to lobby room
  broadcastToRoom(
    "lobby",
    {
      type: "PLAYER_LEFT",
      payload: { playerId: botId },
    },
    lobbyId
  );

  // Broadcast lobby update to global room
  broadcastToRoom("global", {
    type: "LOBBY_UPDATED",
    payload: {
      lobbyId: lobby.lobbyId,
      currentPlayers: lobby.players.length,
      gameStarted: !!lobby.gameId,
    },
  });

  return { success: true };
}

export async function leaveLobby(
  lobbyId: string,
  playerId: string
): Promise<boolean> {
  const redis = getRedis();
  console.log(
    `[leaveLobby] Attempting to leave - lobbyId: ${lobbyId}, playerId: ${playerId}`
  );

  const lobby = await getLobby(lobbyId);

  if (!lobby) {
    console.log(`[leaveLobby] Lobby not found: ${lobbyId}`);
    return false;
  }

  console.log(`[leaveLobby] Current lobby players:`, lobby.players);
  const playerInLobby = lobby.players.some((p) => p.playerId === playerId);
  console.log(`[leaveLobby] Player is in lobby:`, playerInLobby);

  // Remove player from lobby
  lobby.players = lobby.players.filter((p) => p.playerId !== playerId);

  // Check if lobby should be deleted
  const hasHumanPlayers = lobby.players.some((p) => !p.isBot);

  if (lobby.players.length === 0 || !hasHumanPlayers) {
    // Delete lobby if empty OR if only bots remain
    console.log(
      `[leaveLobby] Lobby has no humans remaining, deleting: ${lobbyId}`
    );

    // If there's an active game, delete it too
    if (lobby.gameId) {
      console.log(`[leaveLobby] Also deleting associated game: ${lobby.gameId}`);
      await redis.del(`game:${lobby.gameId}`);
      await redis.del(`${GAME_HUMANS_KEY_PREFIX}${lobby.gameId}`);
    }

    await redis.del(`${LOBBY_KEY_PREFIX}${lobbyId}`);
    await redis.srem(LOBBY_LIST_KEY, lobbyId);

    // Broadcast lobby deleted to global room
    broadcastToRoom("global", {
      type: "LOBBY_DELETED",
      payload: { lobbyId },
    });

    console.log(`[leaveLobby] Lobby deleted and LOBBY_DELETED broadcast sent`);
    return true;
  }

  // If host left, assign new host
  if (lobby.hostPlayerId === playerId) {
    lobby.hostPlayerId = lobby.players[0].playerId;
  }

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));

  // Broadcast to lobby room
  broadcastToRoom(
    "lobby",
    {
      type: "PLAYER_LEFT",
      payload: { playerId },
    },
    lobbyId
  );

  // Broadcast lobby update to global room (for lobby browser to update player count)
  broadcastToRoom("global", {
    type: "LOBBY_UPDATED",
    payload: {
      lobbyId: lobby.lobbyId,
      currentPlayers: lobby.players.length,
      gameStarted: !!lobby.gameId,
    },
  });

  return true;
}

const GAME_HUMANS_KEY_PREFIX = "game-humans:";

export async function startGame(
  lobbyId: string,
  hostPlayerId: string
): Promise<string | null> {
  const redis = getRedis();
  const lobby = await getLobby(lobbyId);

  if (!lobby) return null;
  if (lobby.hostPlayerId !== hostPlayerId) return null; // Only host can start
  if (lobby.players.length < 2) return null; // Need at least 2 players
  if (lobby.gameId) return null; // Game already started

  const gameId = randomUUID();
  lobby.gameId = gameId;

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby));

  // Store human player IDs for this game (needed for bot detection)
  const humanPlayerIds = lobby.players
    .filter((p) => !p.isBot)
    .map((p) => p.playerId);
  await redis.set(
    `${GAME_HUMANS_KEY_PREFIX}${gameId}`,
    JSON.stringify(humanPlayerIds)
  );

  // Create initial game state
  const playerIds = lobby.players.map((p) => p.playerId);
  const gameState = await createGame(gameId, playerIds);

  // Broadcast to lobby room with game state
  broadcastToRoom(
    "lobby",
    {
      type: "GAME_STARTING",
      payload: { gameId, gameState },
    },
    lobbyId
  );

  return gameId;
}

/**
 * Get the set of human player IDs for a game
 */
export async function getHumanPlayerIds(gameId: string): Promise<Set<string>> {
  const redis = getRedis();
  const data = await redis.get(`${GAME_HUMANS_KEY_PREFIX}${gameId}`);

  if (!data) return new Set();

  const playerIds = JSON.parse(data) as string[];
  return new Set(playerIds);
}

/**
 * Find the lobby associated with a game
 */
export async function findLobbyByGameId(gameId: string): Promise<Lobby | null> {
  const lobbies = await listLobbies();

  for (const lobby of lobbies) {
    if (lobby.gameId === gameId) {
      return lobby;
    }
  }

  return null;
}

/**
 * Delete a lobby completely
 */
export async function deleteLobby(lobbyId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${LOBBY_KEY_PREFIX}${lobbyId}`);
  await redis.srem(LOBBY_LIST_KEY, lobbyId);

  // Broadcast lobby deleted to global room
  broadcastToRoom("global", {
    type: "LOBBY_DELETED",
    payload: { lobbyId },
  });
}
