import type { FastifyInstance } from "fastify";
import { CreatePlayerSchema } from "../schemas/player.js";
import { createPlayer, getPlayer } from "../services/playerService.js";
import { findPlayerLobby } from "../services/lobbyService.js";
import { getGameState } from "../services/gameService.js";

export async function playerRoutes(fastify: FastifyInstance) {
  // Create or authenticate player
  fastify.post("/api/players", async (request, reply) => {
    const result = CreatePlayerSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: result.error.errors,
      });
    }

    const { playerId, playerName } = result.data;

    // If playerId provided, verify it exists
    if (playerId) {
      const existing = await getPlayer(playerId);
      if (existing) {
        return reply.send(existing);
      }
      // If not found, create with the provided ID
      const player = await createPlayer(playerName, playerId);
      return reply.send(player);
    }

    // Create new player
    const player = await createPlayer(playerName);
    return reply.send(player);
  });

  // Get player info
  fastify.get<{ Params: { playerId: string } }>(
    "/api/players/:playerId",
    async (request, reply) => {
      const { playerId } = request.params;
      const player = await getPlayer(playerId);

      if (!player) {
        return reply.code(404).send({ error: "Player not found" });
      }

      return reply.send(player);
    },
  );

  // Get player's current session status (lobby and/or game)
  fastify.get<{ Params: { playerId: string } }>(
    "/api/players/:playerId/status",
    async (request, reply) => {
      const { playerId } = request.params;
      const player = await getPlayer(playerId);

      if (!player) {
        return reply.code(404).send({ error: "Player not found" });
      }

      // Find if player is in a lobby
      const lobby = await findPlayerLobby(playerId);

      if (!lobby) {
        // Player exists but not in any lobby
        return reply.send({
          player,
          lobby: null,
          gameState: null,
        });
      }

      // Remove password from response
      const { password, ...safeLobby } = lobby;
      const lobbyResponse = { ...safeLobby, hasPassword: !!password };

      // If lobby has a game, get the game state
      if (lobby.gameId) {
        const gameState = await getGameState(lobby.gameId);
        return reply.send({
          player,
          lobby: lobbyResponse,
          gameState,
        });
      }

      // In lobby but game not started
      return reply.send({
        player,
        lobby: lobbyResponse,
        gameState: null,
      });
    },
  );
}
