import type { FastifyInstance } from "fastify";
import {
  executeBotsIfNeeded,
  forkGameFromRecording,
  getGameState,
  processDeployment,
  rewindGame,
  submitLoadoutAndCheckReady,
} from "../services/gameService.ts";
import { getHumanPlayerIds } from "../services/lobbyService.ts";
import { broadcastToRoom } from "../websocket/roomHandler.ts";
import type { ShipLoadout } from "@dangerous-inclinations/engine";
import { getPlayer } from "../services/playerService.ts";

export async function gameRoutes(fastify: FastifyInstance) {
  // Get game state
  fastify.get<{
    Headers: { "x-player-id": string };
    Params: { gameId: string };
  }>("/api/games/:gameId", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { gameId } = request.params;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }

    const gameState = await getGameState(gameId);

    if (!gameState) {
      return reply.code(404).send({ error: "Game not found" });
    }

    // Verify player is in this game
    const isPlayerInGame = gameState.players.some((p) => p.id === playerId);
    if (!isPlayerInGame) {
      return reply.code(403).send({ error: "Not a player in this game" });
    }

    return reply.send(gameState);
  });

  // Deploy ship during deployment phase
  fastify.post<{
    Headers: { "x-player-id": string };
    Params: { gameId: string };
    Body: { sector: number };
  }>("/api/games/:gameId/deploy", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { gameId } = request.params;
    const { sector } = request.body;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }

    if (typeof sector !== "number") {
      return reply.code(400).send({ error: "Sector must be a number" });
    }

    try {
      // Get human player IDs for bot detection
      const humanPlayerIds = await getHumanPlayerIds(gameId);
      const result = await processDeployment(gameId, playerId, sector, humanPlayerIds);

      if (!result.success) {
        return reply.code(400).send({ error: result.error });
      }

      return reply.send(result.gameState);
    } catch (error) {
      fastify.log.error({ error }, "Error processing deployment");
      return reply.code(500).send({ error: "Failed to process deployment" });
    }
  });

  // Submit loadout during loadout phase
  fastify.post<{
    Headers: { "x-player-id": string };
    Params: { gameId: string };
    Body: { loadout: ShipLoadout; selectedMissionIds?: string[] };
  }>("/api/games/:gameId/loadout", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { gameId } = request.params;
    const { loadout, selectedMissionIds } = request.body;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }

    if (!loadout || !loadout.forwardSlots || !loadout.sideSlots) {
      return reply.code(400).send({ error: "Invalid loadout format" });
    }

    try {
      // Get human player IDs for bot handling
      const humanPlayerIds = await getHumanPlayerIds(gameId);
      const result = await submitLoadoutAndCheckReady(
        gameId,
        playerId,
        loadout,
        humanPlayerIds,
        selectedMissionIds
      );

      if (!result.success) {
        if (result.errors) {
          return reply.code(400).send({ errors: result.errors });
        }
        return reply.code(400).send({ error: result.error });
      }

      return reply.send({
        success: true,
        gameState: result.gameState,
      });
    } catch (error) {
      fastify.log.error({ error }, "Error submitting loadout");
      return reply.code(500).send({ error: "Failed to submit loadout" });
    }
  });

  // Rewind a live game to a recorded turn snapshot. The caller passes a
  // turn index from the live recording; the engine state is restored to
  // that snapshot, the recording is truncated, and the bot loop is
  // nudged so the game continues from there. Broadcasts the new state
  // to every client in the game's room so connected players see the
  // rewind immediately.
  fastify.post<{
    Headers: { "x-player-id": string };
    Params: { gameId: string };
    Body: { turnIndex: number };
  }>("/api/games/:gameId/rewind", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { gameId } = request.params;
    const { turnIndex } = request.body;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }
    if (typeof turnIndex !== "number") {
      return reply.code(400).send({ error: "turnIndex must be a number" });
    }

    try {
      const result = await rewindGame(gameId, turnIndex);
      if (!result.success || !result.gameState) {
        return reply.code(400).send({ error: result.error });
      }

      // Tell every connected client about the rewind so their UI re-renders
      // from the restored state. Reuses the TURN_EXECUTED frame so the
      // existing animation queue / state-merge path handles it. The
      // synthetic action list is empty — there's no executable action,
      // just a snapshot replacement.
      broadcastToRoom(
        "game",
        {
          type: "TURN_EXECUTED",
          payload: {
            gameState: result.gameState,
            actions: [],
            playerId,
            turnNumber: result.gameState.turn,
            rewind: true,
          },
        },
        gameId
      );

      // If the active player after rewind is a bot, kick the bot loop so
      // the game continues without waiting for input nobody will provide.
      const humanPlayerIds = await getHumanPlayerIds(gameId);
      await executeBotsIfNeeded(gameId, result.gameState, humanPlayerIds);

      return reply.send({ success: true, gameState: result.gameState });
    } catch (error) {
      fastify.log.error({ error }, "Error rewinding game");
      return reply.code(500).send({ error: "Failed to rewind game" });
    }
  });

  // Fork a recording into a new live game. The caller picks a turn
  // index and (optionally) which player to step into. The new game is
  // created in Redis with a fresh gameId; the response carries it back
  // so the client can navigate into the new game's room.
  fastify.post<{
    Headers: { "x-player-id": string };
    Body: {
      recordingId: string;
      turnIndex: number;
      impersonateOriginalPlayerId?: string;
    };
  }>("/api/games/fork", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { recordingId, turnIndex, impersonateOriginalPlayerId } = request.body;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }
    if (!recordingId || typeof turnIndex !== "number") {
      return reply
        .code(400)
        .send({ error: "recordingId and turnIndex are required" });
    }

    try {
      // Look up the player record to thread their display name into the
      // impersonated game-player; if the lookup fails, fall back to the
      // raw id as a last-resort label.
      const player = await getPlayer(playerId);
      const result = await forkGameFromRecording(recordingId, turnIndex, {
        impersonateOriginalPlayerId,
        humanPlayerId: playerId,
        humanPlayerName: player?.playerName ?? playerId,
      });

      if (!result.success) {
        return reply.code(400).send({ error: result.error });
      }

      return reply.send({
        success: true,
        gameId: result.gameId,
        gameState: result.gameState,
      });
    } catch (error) {
      fastify.log.error({ error }, "Error forking recording");
      return reply.code(500).send({ error: "Failed to fork recording" });
    }
  });
}
