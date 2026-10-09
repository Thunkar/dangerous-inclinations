/**
 * WebSocket endpoints: global (lobby list), lobby, and game rooms.
 * Game messages follow docs/protocol.md.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { getPlayer } from "../services/playerService.ts";
import { getLobby, findLobbyByGameId, deleteLobby } from "../services/lobbyService.ts";
import { gameService } from "../services/live.ts";
import { StaleGameError } from "../services/gameService.ts";
import type { ServerGameMessage } from "../protocol.ts";
import { answerSubmission, connectedMessage } from "./submission.ts";
import {
  getConnectedPlayers,
  registerConnection,
  releaseConnection,
  unregisterConnection,
} from "./rooms.ts";

function send(
  ws: WebSocket,
  message: ServerGameMessage | { type: string; room: string; roomId?: string }
): void {
  ws.send(JSON.stringify(message));
}

/**
 * Abandoned-game teardown. When the last human socket of a game closes we wait
 * ABANDON_GRACE_MS before deleting the game and its lobby, so a page reload or
 * a flaky connection doesn't destroy a game in progress. Any human reconnecting
 * cancels the timer.
 */
const ABANDON_GRACE_MS = 90_000;
const abandonTimers = new Map<string, NodeJS.Timeout>();

function cancelAbandonTimer(gameId: string): void {
  const t = abandonTimers.get(gameId);
  if (t) {
    clearTimeout(t);
    abandonTimers.delete(gameId);
  }
}

async function humansStillConnected(gameId: string): Promise<boolean> {
  const connected = getConnectedPlayers("game", gameId);
  const humans = await gameService.getHumanPlayerIds(gameId);
  return [...connected].some((id) => humans.has(id));
}

function scheduleAbandonCheck(gameId: string): void {
  cancelAbandonTimer(gameId);
  abandonTimers.set(
    gameId,
    setTimeout(async () => {
      abandonTimers.delete(gameId);
      try {
        if (await humansStillConnected(gameId)) return;
        const lobby = await findLobbyByGameId(gameId);
        if (lobby) await deleteLobby(lobby.lobbyId);
        await gameService.deleteGame(gameId);
      } catch {
        // Best effort: a failed cleanup is retried on the next disconnect.
      }
    }, ABANDON_GRACE_MS)
  );
}

/**
 * The teardown timers live in memory, so a game whose timer was lost (the
 * server restarted inside the grace) or never started (no human ever opened
 * its socket) would sit "in play" for ever. The sweep finds every game with no
 * human connected and no teardown pending and gives it the same grace a
 * closing socket would: at startup, when nobody can be connected yet, and once
 * a minute after that.
 */
const SWEEP_INTERVAL_MS = 60_000;

async function sweepAbandonedGames(): Promise<void> {
  for (const gameId of await gameService.listGameIds()) {
    if (abandonTimers.has(gameId)) continue;
    try {
      if (!(await humansStillConnected(gameId))) scheduleAbandonCheck(gameId);
    } catch {
      // A game that cannot be read is left for the next sweep.
    }
  }
}

export async function setupWebSocketRooms(fastify: FastifyInstance) {
  void sweepAbandonedGames();
  setInterval(() => void sweepAbandonedGames(), SWEEP_INTERVAL_MS).unref();

  /**
   * Global room - lobby list updates. URL: /ws/global?playerId=xxx
   */
  fastify.get("/ws/global", { websocket: true }, async (socket, request) => {
    const { playerId } = request.query as { playerId?: string };
    if (!playerId) return socket.close(1008, "Player ID required");

    const player = await getPlayer(playerId);
    if (!player) return socket.close(1008, "Invalid player");

    registerConnection("global", undefined, playerId, socket);
    fastify.log.info(`Player ${player.playerName} (${playerId}) connected to global room`);
    send(socket, { type: "CONNECTED", room: "global" });

    socket.on("close", () => {
      unregisterConnection("global", undefined, playerId, socket);
      fastify.log.info(`Player ${player.playerName} (${playerId}) disconnected from global room`);
    });
  });

  /**
   * Lobby room. URL: /ws/lobby?playerId=xxx&roomId=lobbyId
   */
  fastify.get("/ws/lobby", { websocket: true }, async (socket, request) => {
    const { playerId, roomId: lobbyId } = request.query as { playerId?: string; roomId?: string };
    if (!playerId) return socket.close(1008, "Player ID required");
    if (!lobbyId) return socket.close(1008, "Lobby ID required");

    const player = await getPlayer(playerId);
    if (!player) return socket.close(1008, "Invalid player");

    const lobby = await getLobby(lobbyId);
    if (!lobby) return socket.close(1008, "Lobby not found");
    if (!lobby.players.some((p) => p.playerId === playerId))
      return socket.close(1008, "Player not in lobby");

    registerConnection("lobby", lobbyId, playerId, socket);
    fastify.log.info(`Player ${player.playerName} (${playerId}) connected to lobby ${lobbyId}`);
    send(socket, { type: "CONNECTED", room: "lobby", roomId: lobbyId });

    // Seats change through the lobby service (PLAYER_JOINED, PLAYER_LEFT), not
    // through sockets: a closed socket leaves the seat in the lobby.
    socket.on("close", () => {
      unregisterConnection("lobby", lobbyId, playerId, socket);
      fastify.log.info(
        `Player ${player.playerName} (${playerId}) disconnected from lobby ${lobbyId}`
      );
    });
  });

  /**
   * Game room. URL: /ws/game?playerId=xxx&roomId=gameId
   * Only players of the game may join; each receives its own view.
   */
  fastify.get("/ws/game", { websocket: true }, async (socket, request) => {
    const { playerId, roomId: gameId } = request.query as { playerId?: string; roomId?: string };
    if (!playerId) return socket.close(1008, "Player ID required");
    if (!gameId) return socket.close(1008, "Game ID required");

    const player = await getPlayer(playerId);
    if (!player) return socket.close(1008, "Invalid player");

    let game;
    try {
      game = await gameService.getGame(gameId);
    } catch (error) {
      if (error instanceof StaleGameError) return socket.close(1008, "Game saved under older rules");
      throw error;
    }
    if (!game) return socket.close(1008, "Game not found");
    if (!game.players.some((p) => p.id === playerId))
      return socket.close(1008, "Player not in game");

    fastify.log.info(`Player ${player.playerName} (${playerId}) connected to game ${gameId}`);
    send(socket, connectedMessage(gameId));

    async function handleSubmission(raw: Buffer): Promise<void> {
      try {
        const reply = await answerSubmission(gameService, gameId!, playerId!, raw.toString());
        if (reply) send(socket, reply);
      } catch (error) {
        fastify.log.error({ error, gameId, playerId }, "WebSocket message error");
        send(socket, {
          type: "TURN_ERROR",
          payload: { error: "Internal server error processing turn" },
        });
      }
    }

    // The listener goes on before the initial view is awaited: a SUBMIT_TURN
    // that arrives during the handshake is queued, not dropped.
    let handshakeDone = false;
    const queued: Buffer[] = [];
    socket.on("message", (raw: Buffer) => {
      if (!handshakeDone) {
        queued.push(raw);
        return;
      }
      void handleSubmission(raw);
    });

    // A human reconnecting cancels any pending teardown of this game.
    cancelAbandonTimer(gameId);

    // Installed before the handshake completes so a socket that closes mid-join
    // is still cleaned up.
    let closed = false;
    socket.on("close", () => {
      closed = true;
      unregisterConnection("game", gameId, playerId, socket);
      fastify.log.info(
        `Player ${player.playerName} (${playerId}) disconnected from game ${gameId}`
      );
      scheduleAbandonCheck(gameId);
    });

    // The room is joined inside the same critical section that snapshots the
    // view, and the socket buffers until that view has been sent, so a
    // TURN_EXECUTED can neither overtake the initial GAME_VIEW nor be lost.
    const initial = await gameService.getViewWithHistory(gameId, playerId, () =>
      registerConnection("game", gameId, playerId, socket, { buffered: true })
    );
    if (!initial) {
      fastify.log.info(`Game ${gameId} disappeared before ${playerId} could join`);
      return socket.close(1001, "Game not found");
    }
    if (closed) return unregisterConnection("game", gameId, playerId, socket);

    send(socket, { type: "GAME_VIEW", payload: initial });
    releaseConnection("game", gameId, playerId, socket);
    handshakeDone = true;
    for (const raw of queued.splice(0)) await handleSubmission(raw);

    // A game left with a bot to act (server restart) continues now that someone is watching.
    gameService
      .resumeBots(gameId)
      .catch((error) => fastify.log.error({ error, gameId }, "Failed to resume bot turns"));
  });
}
