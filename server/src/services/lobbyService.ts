/**
 * Lobbies: the pre-game room where humans gather, bots are added and the host
 * starts the game. Lobby messages carry no game state, so they are broadcast
 * as one string to the whole room; `GAME_STARTING` only names the game and
 * every client then fetches its own view.
 */
import { randomUUID } from "node:crypto";
import type { PlayerSpec } from "@dangerous-inclinations/engine";
import { MAX_PLAYERS, MIN_PLAYERS } from "@dangerous-inclinations/engine";
import { getRedis } from "./redis.ts";
import { createKeyedLock } from "./lock.ts";
import { broadcastToRoom } from "../websocket/rooms.ts";
import type { CreateLobbyInput } from "../schemas/lobby.ts";
import { getPlayer } from "./playerService.ts";
import type { AgentInfo, PlayerAuth } from "../schemas/player.ts";
import { gameService } from "./live.ts";
import { log } from "./logger.ts";

const LOBBY_KEY_PREFIX = "lobby:";
const LOBBY_LIST_KEY = "lobbies";

export interface LobbyPlayer {
  playerId: string;
  playerName: string;
  /** The server's own AI. */
  isBot: boolean;
  isReady: boolean;
  /** An outside agent (Claude, Codex) playing this seat; absent for people and bots. */
  agent?: AgentInfo;
}

export interface Lobby {
  lobbyId: string;
  lobbyName: string;
  password?: string;
  maxPlayers: number;
  players: LobbyPlayer[];
  hostPlayerId: string;
  /** Set when the host starts the game. */
  gameId?: string;
  createdAt: number;
}

const lobbyKey = (lobbyId: string) => `${LOBBY_KEY_PREFIX}${lobbyId}`;

/**
 * Per-lobby serialization. Every mutation is read-modify-write on one Redis
 * key, so two concurrent joins would otherwise overwrite each other and two
 * concurrent starts would create two games for the same lobby.
 *
 * `deleteLobby` is deliberately not locked: it is called from inside
 * `leaveLobby`, which already holds the lock.
 */
const withLobbyLock = createKeyedLock();

/** A person's or an agent's seat, as the lobby shows it to everyone. */
function seatFor(playerId: string, player: PlayerAuth): LobbyPlayer {
  return {
    playerId,
    playerName: player.playerName,
    isBot: false,
    isReady: false,
    ...(player.agent ? { agent: player.agent } : {}),
  };
}

async function saveLobby(lobby: Lobby): Promise<void> {
  await getRedis().set(lobbyKey(lobby.lobbyId), JSON.stringify(lobby));
}

/** Player count / started flag for the lobby browser. */
function broadcastLobbyUpdate(lobby: Lobby): void {
  broadcastToRoom("global", {
    type: "LOBBY_UPDATED",
    payload: {
      lobbyId: lobby.lobbyId,
      currentPlayers: lobby.players.length,
      gameStarted: !!lobby.gameId,
    },
  });
}

export async function createLobby(input: CreateLobbyInput, hostPlayerId: string): Promise<Lobby> {
  const hostPlayer = await getPlayer(hostPlayerId);
  if (!hostPlayer) throw new Error("Host player not found");

  const lobby: Lobby = {
    lobbyId: randomUUID(),
    lobbyName: input.lobbyName,
    password: input.password,
    // Belt and braces: the schema bounds this too, but a lobby that can never
    // start a game is worse than a clamped one.
    maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.trunc(input.maxPlayers))),
    players: [seatFor(hostPlayerId, hostPlayer)],
    hostPlayerId,
    createdAt: Date.now(),
  };

  await saveLobby(lobby);
  await getRedis().sadd(LOBBY_LIST_KEY, lobby.lobbyId);

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
  const data = await getRedis().get(lobbyKey(lobbyId));
  return data ? (JSON.parse(data) as Lobby) : null;
}

export async function listLobbies(): Promise<Lobby[]> {
  const redis = getRedis();
  const lobbyIds = await redis.smembers(LOBBY_LIST_KEY);
  const lobbies = await Promise.all(
    lobbyIds.map(async (id) => {
      const data = await redis.get(lobbyKey(id));
      return data ? (JSON.parse(data) as Lobby) : null;
    }),
  );
  return lobbies.filter((l): l is Lobby => l !== null);
}

/** The lobby a player is currently in, if any. */
export async function findPlayerLobby(playerId: string): Promise<Lobby | null> {
  const lobbies = await listLobbies();
  return lobbies.find((lobby) => lobby.players.some((p) => p.playerId === playerId)) ?? null;
}

export async function findLobbyByGameId(gameId: string): Promise<Lobby | null> {
  const lobbies = await listLobbies();
  return lobbies.find((lobby) => lobby.gameId === gameId) ?? null;
}

export function joinLobby(
  lobbyId: string,
  playerId: string,
  password?: string,
): Promise<{ success: boolean; error?: string; lobby?: Lobby }> {
  return withLobbyLock(lobbyId, async () => {
    const lobby = await getLobby(lobbyId);
    if (!lobby) return { success: false, error: "Lobby not found" };
    if (lobby.password && lobby.password !== password) return { success: false, error: "Incorrect password" };
    if (lobby.players.some((p) => p.playerId === playerId)) return { success: true, lobby };
    if (lobby.players.length >= lobby.maxPlayers) return { success: false, error: "Lobby is full" };
    if (lobby.gameId) return { success: false, error: "Game already started" };

    const player = await getPlayer(playerId);
    if (!player) return { success: false, error: "Player not found" };

    const newPlayer = seatFor(playerId, player);
    lobby.players.push(newPlayer);
    await saveLobby(lobby);

    broadcastToRoom("lobby", { type: "PLAYER_JOINED", payload: newPlayer }, lobbyId);
    broadcastLobbyUpdate(lobby);
    return { success: true, lobby };
  });
}

export function addBot(
  lobbyId: string,
  hostPlayerId: string,
  botName?: string,
): Promise<{ success: boolean; error?: string; lobby?: Lobby }> {
  return withLobbyLock(lobbyId, async () => {
    const lobby = await getLobby(lobbyId);
    if (!lobby) return { success: false, error: "Lobby not found" };
    if (lobby.hostPlayerId !== hostPlayerId) return { success: false, error: "Only the host can add bots" };
    if (lobby.players.length >= lobby.maxPlayers) return { success: false, error: "Lobby is full" };
    if (lobby.gameId) return { success: false, error: "Game already started" };

    const newBot: LobbyPlayer = {
      playerId: `bot-${randomUUID()}`,
      playerName: botName || `Bot ${lobby.players.filter((p) => p.isBot).length + 1}`,
      isBot: true,
      isReady: true, // bots are always ready
    };
    lobby.players.push(newBot);
    await saveLobby(lobby);

    broadcastToRoom("lobby", { type: "PLAYER_JOINED", payload: newBot }, lobbyId);
    broadcastLobbyUpdate(lobby);
    return { success: true, lobby };
  });
}

export function removeBot(
  lobbyId: string,
  hostPlayerId: string,
  botId: string,
): Promise<{ success: boolean; error?: string }> {
  return withLobbyLock(lobbyId, async () => {
    const lobby = await getLobby(lobbyId);
    if (!lobby) return { success: false, error: "Lobby not found" };
    if (lobby.hostPlayerId !== hostPlayerId) return { success: false, error: "Only the host can remove bots" };
    if (lobby.gameId) return { success: false, error: "Game already started" };

    const botIndex = lobby.players.findIndex((p) => p.playerId === botId && p.isBot);
    if (botIndex === -1) return { success: false, error: "Bot not found" };

    lobby.players.splice(botIndex, 1);
    await saveLobby(lobby);

    broadcastToRoom("lobby", { type: "PLAYER_LEFT", payload: { playerId: botId } }, lobbyId);
    broadcastLobbyUpdate(lobby);
    return { success: true };
  });
}

/**
 * Remove a player. A lobby with no humans left is deleted along with its game
 * (bots do not keep a game alive).
 */
export function leaveLobby(lobbyId: string, playerId: string): Promise<boolean> {
  return withLobbyLock(lobbyId, async () => {
    const lobby = await getLobby(lobbyId);
    if (!lobby) {
      log.warn(`leaveLobby: lobby ${lobbyId} not found`);
      return false;
    }

    lobby.players = lobby.players.filter((p) => p.playerId !== playerId);

    if (!lobby.players.some((p) => !p.isBot)) {
      log.info(`leaveLobby: no humans left in lobby ${lobbyId}, deleting it`);
      if (lobby.gameId) await gameService.deleteGame(lobby.gameId);
      await deleteLobby(lobbyId);
      return true;
    }

    if (lobby.hostPlayerId === playerId) lobby.hostPlayerId = lobby.players[0].playerId;
    await saveLobby(lobby);

    broadcastToRoom("lobby", { type: "PLAYER_LEFT", payload: { playerId } }, lobbyId);
    broadcastLobbyUpdate(lobby);
    return true;
  });
}

/**
 * Host starts the game: the engine deals mission offers and the lobby moves to
 * the loadout phase. `GAME_STARTING` carries only the id — each client then
 * connects to the game room and receives its own view.
 */
export function startGame(lobbyId: string, hostPlayerId: string): Promise<string | null> {
  // Under the lobby lock: two clicks on "start" must create one game, not two.
  return withLobbyLock(lobbyId, async () => {
    const lobby = await getLobby(lobbyId);
    if (!lobby) return null;
    if (lobby.hostPlayerId !== hostPlayerId) return null;
    if (lobby.players.length < MIN_PLAYERS || lobby.players.length > MAX_PLAYERS) {
      log.warn(`startGame: lobby ${lobbyId} has ${lobby.players.length} players (need ${MIN_PLAYERS}-${MAX_PLAYERS})`);
      return null;
    }
    if (lobby.gameId) return null;
    if (!lobby.players.some((p) => !p.isBot)) {
      log.warn(`startGame: lobby ${lobbyId} has no human players`);
      return null;
    }

    const gameId = randomUUID();
    const specs: PlayerSpec[] = lobby.players.map((p) => ({ id: p.playerId, name: p.playerName }));
    const humanPlayerIds = lobby.players.filter((p) => !p.isBot).map((p) => p.playerId);

    await gameService.createGame(gameId, specs, humanPlayerIds);

    lobby.gameId = gameId;
    await saveLobby(lobby);

    broadcastToRoom("lobby", { type: "GAME_STARTING", payload: { gameId } }, lobbyId);
    broadcastLobbyUpdate(lobby);
    log.info(`Game ${gameId} started from lobby ${lobbyId} (${specs.length} players, ${humanPlayerIds.length} human)`);
    return gameId;
  });
}

export async function deleteLobby(lobbyId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(lobbyKey(lobbyId));
  await redis.srem(LOBBY_LIST_KEY, lobbyId);
  broadcastToRoom("global", { type: "LOBBY_DELETED", payload: { lobbyId } });
}
