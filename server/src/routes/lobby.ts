import type { FastifyInstance } from "fastify";
import {
  CreateLobbySchema,
  JoinLobbySchema,
  LobbyActionSchema,
} from "../schemas/lobby.js";
import {
  createLobby,
  getLobby,
  listLobbies,
  joinLobby,
  leaveLobby,
  startGame,
} from "../services/lobbyService.js";
import { getPlayer } from "../services/playerService.js";

export async function lobbyRoutes(fastify: FastifyInstance) {
  // Create lobby
  fastify.post<{ Headers: { "x-player-id": string } }>(
    "/api/lobbies",
    async (request, reply) => {
      const playerId = request.headers["x-player-id"];

      if (!playerId) {
        return reply.code(401).send({ error: "Player ID required" });
      }

      const player = await getPlayer(playerId);
      if (!player) {
        return reply.code(401).send({ error: "Invalid player" });
      }

      const result = CreateLobbySchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          error: "Invalid request",
          details: result.error.errors,
        });
      }

      const lobby = await createLobby(result.data, playerId);
      return reply.send(lobby);
    },
  );

  // List lobbies
  fastify.get("/api/lobbies", async (request, reply) => {
    const lobbies = await listLobbies();

    // Don't expose passwords in list
    const sanitized = lobbies.map((l) => ({
      lobbyId: l.lobbyId,
      lobbyName: l.lobbyName,
      hasPassword: !!l.password,
      maxPlayers: l.maxPlayers,
      currentPlayers: l.players.length,
      gameStarted: !!l.gameId,
      createdAt: l.createdAt,
    }));

    return reply.send(sanitized);
  });

  // Get lobby details
  fastify.get<{ Params: { lobbyId: string } }>(
    "/api/lobbies/:lobbyId",
    async (request, reply) => {
      const { lobbyId } = request.params;
      const lobby = await getLobby(lobbyId);

      if (!lobby) {
        return reply.code(404).send({ error: "Lobby not found" });
      }

      // Don't expose password
      const { password, ...safeLobby } = lobby;
      return reply.send({ ...safeLobby, hasPassword: !!password });
    },
  );

  // Join lobby
  fastify.post<{ Headers: { "x-player-id": string } }>(
    "/api/lobbies/join",
    async (request, reply) => {
      const playerId = request.headers["x-player-id"];

      if (!playerId) {
        return reply.code(401).send({ error: "Player ID required" });
      }

      const player = await getPlayer(playerId);
      if (!player) {
        return reply.code(401).send({ error: "Invalid player" });
      }

      const result = JoinLobbySchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          error: "Invalid request",
          details: result.error.errors,
        });
      }

      const joinResult = await joinLobby(
        result.data.lobbyId,
        playerId,
        result.data.password,
      );

      if (!joinResult.success) {
        return reply.code(400).send({ error: joinResult.error });
      }

      const { password, ...safeLobby } = joinResult.lobby!;
      return reply.send({ ...safeLobby, hasPassword: !!password });
    },
  );

  // Leave lobby
  fastify.post<{
    Headers: { "x-player-id": string };
    Params: { lobbyId: string };
  }>("/api/lobbies/:lobbyId/leave", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { lobbyId } = request.params;

    fastify.log.info(`[Leave Lobby] Request - lobbyId: ${lobbyId}, playerId: ${playerId}`);

    if (!playerId) {
      fastify.log.warn(`[Leave Lobby] No player ID in headers`);
      return reply.code(401).send({ error: "Player ID required" });
    }

    const success = await leaveLobby(lobbyId, playerId);

    if (!success) {
      fastify.log.warn(`[Leave Lobby] Failed - lobby not found or error`);
      return reply.code(404).send({ error: "Lobby not found" });
    }

    fastify.log.info(`[Leave Lobby] Success`);
    return reply.send({ success: true });
  });

  // Start game (host only)
  fastify.post<{
    Headers: { "x-player-id": string };
    Params: { lobbyId: string };
  }>("/api/lobbies/:lobbyId/start", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { lobbyId } = request.params;

    if (!playerId) {
      return reply.code(401).send({ error: "Player ID required" });
    }

    const gameId = await startGame(lobbyId, playerId);

    if (!gameId) {
      return reply.code(400).send({ error: "Cannot start game" });
    }

    return reply.send({ gameId });
  });
}
