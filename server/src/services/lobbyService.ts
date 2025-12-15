import { randomUUID } from "crypto";
import { getRedis } from "./redis.js";
import { broadcastToRoom } from "../websocket/roomHandler.js";
import type { CreateLobbyInput } from "../schemas/lobby.js";
import { getPlayer } from "./playerService.js";

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
  hostPlayerId: string,
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
    }),
  );

  return lobbies.filter((l): l is Lobby => l !== null);
}

export async function joinLobby(
  lobbyId: string,
  playerId: string,
  password?: string,
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
    lobbyId,
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

export async function leaveLobby(
  lobbyId: string,
  playerId: string,
): Promise<boolean> {
  const redis = getRedis();
  console.log(`[leaveLobby] Attempting to leave - lobbyId: ${lobbyId}, playerId: ${playerId}`);

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

  if (lobby.players.length === 0) {
    // Delete empty lobby
    console.log(`[leaveLobby] Lobby is now empty, deleting: ${lobbyId}`);
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
    lobbyId,
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

export async function startGame(
  lobbyId: string,
  hostPlayerId: string,
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

  // Broadcast to lobby room
  broadcastToRoom(
    "lobby",
    {
      type: "GAME_STARTING",
      payload: { gameId },
    },
    lobbyId,
  );

  return gameId;
}

export async function deleteLobby(lobbyId: string): Promise<boolean> {
  const redis = getRedis();
  await redis.del(`${LOBBY_KEY_PREFIX}${lobbyId}`);
  await redis.srem(LOBBY_LIST_KEY, lobbyId);
  return true;
}
