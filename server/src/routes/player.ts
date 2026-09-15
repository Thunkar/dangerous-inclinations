import type { FastifyInstance } from "fastify";
import { CreatePlayerSchema, UpdatePlayerSchema } from "../schemas/player.ts";
import { checkStatusAccess, createPlayer, getPlayer, updatePlayerName } from "../services/playerService.ts";
import { findPlayerLobby } from "../services/lobbyService.ts";
import { gameService } from "../services/live.ts";

export async function playerRoutes(fastify: FastifyInstance) {
  // Create or authenticate player
  fastify.post("/api/players", async (request, reply) => {
    const result = CreatePlayerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Invalid request", details: result.error.errors });
    }

    const { playerId, playerName, agent } = result.data;
    if (playerId) {
      const existing = await getPlayer(playerId);
      if (existing) return reply.send(existing);
      return reply.send(await createPlayer(playerName, playerId, agent));
    }
    return reply.send(await createPlayer(playerName, undefined, agent));
  });

  fastify.get<{ Params: { playerId: string } }>("/api/players/:playerId", async (request, reply) => {
    const player = await getPlayer(request.params.playerId);
    if (!player) return reply.code(404).send({ error: "Player not found" });
    return reply.send(player);
  });

  fastify.put<{ Params: { playerId: string } }>("/api/players/:playerId", async (request, reply) => {
    const { playerId } = request.params;
    const result = UpdatePlayerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Invalid request", details: result.error.errors });
    }
    const success = await updatePlayerName(playerId, result.data.playerName);
    if (!success) return reply.code(404).send({ error: "Player not found" });
    return reply.send(await getPlayer(playerId));
  });

  /**
   * The caller's current session: lobby (if any) and, when its game has
   * started, the caller's own view of it. The view is always built for
   * `x-player-id`, never for the id in the URL — asking for someone else's
   * status is a 403, not another player's view.
   */
  fastify.get<{ Headers: { "x-player-id"?: string }; Params: { playerId: string } }>(
    "/api/players/:playerId/status",
    async (request, reply) => {
      const access = checkStatusAccess(request.headers["x-player-id"], request.params.playerId);
      if (!access.ok) return reply.code(access.code).send({ error: access.error });

      const { playerId } = access;
      const player = await getPlayer(playerId);
      if (!player) return reply.code(404).send({ error: "Player not found" });

      const lobby = await findPlayerLobby(playerId);
      if (!lobby) return reply.send({ player, lobby: null, view: null });

      const { password, ...safeLobby } = lobby;
      const lobbyResponse = { ...safeLobby, hasPassword: !!password };
      const view = lobby.gameId ? await gameService.getView(lobby.gameId, playerId) : null;
      return reply.send({ player, lobby: lobbyResponse, view });
    },
  );
}
