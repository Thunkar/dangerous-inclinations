/**
 * WebSocket endpoints: global (lobby list), lobby, and game rooms.
 * Game messages follow docs/protocol.md.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { PlayerAction } from "@dangerous-inclinations/engine";
import { getPlayer } from "../services/playerService.ts";
import { getLobby, findLobbyByGameId, deleteLobby } from "../services/lobbyService.ts";
import { gameService } from "../services/live.ts";
import { SubmitTurnSchema } from "../schemas/game.ts";
import type { ServerGameMessage } from "../protocol.ts";
import {
  broadcastToRoom,
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

export async function setupWebSocketRooms(fastify: FastifyInstance) {
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

    // PLAYER_JOINED is broadcast by lobbyService.joinLobby with the full LobbyPlayer.
    socket.on("close", () => {
      unregisterConnection("lobby", lobbyId, playerId, socket);
      // Another tab of the same player may still be in the lobby.
      if (!getConnectedPlayers("lobby", lobbyId).has(playerId)) {
        broadcastToRoom("lobby", { type: "PLAYER_LEFT", payload: { playerId } }, lobbyId);
      }
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

    const game = await gameService.getGame(gameId);
    if (!game) return socket.close(1008, "Game not found");
    if (!game.players.some((p) => p.id === playerId))
      return socket.close(1008, "Player not in game");

    fastify.log.info(`Player ${player.playerName} (${playerId}) connected to game ${gameId}`);
    send(socket, { type: "CONNECTED", room: "game", roomId: gameId });

    async function handleSubmission(raw: Buffer): Promise<void> {
      try {
        const parsed = SubmitTurnSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) {
          // A malformed action fails the whole submission: never a silent coast.
          const errors = parsed.error.errors.map(
            (issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`
          );
          return send(socket, {
            type: "TURN_ERROR",
            payload: { error: "Invalid SUBMIT_TURN message", errors },
          });
        }
        const { actions, turn, activePlayerId } = parsed.data.payload;
        const result = await gameService.submitTurn(gameId!, playerId!, actions as PlayerAction[], {
          turn,
          activePlayerId,
        });
        if (!result.ok) {
          send(socket, {
            type: "TURN_ERROR",
            payload: { error: result.error, errors: result.errors },
          });
        }
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
