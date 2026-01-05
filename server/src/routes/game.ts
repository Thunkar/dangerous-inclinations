import type { FastifyInstance } from "fastify";
import { getGameState, processDeployment, submitLoadoutAndCheckReady } from "../services/gameService.js";
import { getHumanPlayerIds } from "../services/lobbyService.js";
import type { ShipLoadout } from "@dangerous-inclinations/engine";

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
    Body: { loadout: ShipLoadout };
  }>("/api/games/:gameId/loadout", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    const { gameId } = request.params;
    const { loadout } = request.body;

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
        humanPlayerIds
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
}
