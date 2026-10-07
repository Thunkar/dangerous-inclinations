import type { FastifyInstance } from "fastify";
import { CreatePlayerSchema, UpdatePlayerSchema } from "../schemas/player.ts";
import { checkPlayerAccess, createPlayer, getPlayer, updatePlayerName } from "../services/playerService.ts";
import { findPlayerLobby, leaveLobby, publicLobby } from "../services/lobbyService.ts";
import { gameService } from "../services/live.ts";
import { StaleGameError } from "../services/gameService.ts";

export async function playerRoutes(fastify: FastifyInstance) {
  // Create a player; the server picks its id.
  fastify.post("/api/players", async (request, reply) => {
    const result = CreatePlayerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Invalid request", details: result.error.errors });
    }
    return reply.send(await createPlayer(result.data.playerName, result.data.agent));
  });

  fastify.get<{ Params: { playerId: string } }>("/api/players/:playerId", async (request, reply) => {
    const player = await getPlayer(request.params.playerId);
    if (!player) return reply.code(404).send({ error: "Player not found" });
    return reply.send(player);
  });

  // Rename: only the player itself may.
  fastify.put<{ Headers: { "x-player-id"?: string }; Params: { playerId: string } }>(
    "/api/players/:playerId",
    async (request, reply) => {
      const access = checkPlayerAccess(request.headers["x-player-id"], request.params.playerId);
      if (!access.ok) return reply.code(access.code).send({ error: access.error });
      const result = UpdatePlayerSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Invalid request", details: result.error.errors });
      }
      const success = await updatePlayerName(access.playerId, result.data.playerName);
      if (!success) return reply.code(404).send({ error: "Player not found" });
      return reply.send(await getPlayer(access.playerId));
    },
  );

  /**
   * The caller's current session: lobby (if any) and, when its game has
   * started, the caller's own view of it. The view is always built for
   * `x-player-id`, never for the id in the URL: asking for someone else's
   * status is a 403, not another player's view.
   *
   * A game saved under older rules is a 410, once: the player leaves its
   * lobby on the way out, so the next status finds no lobby and the notice
   * is not shown again on every reload.
   */
  fastify.get<{ Headers: { "x-player-id"?: string }; Params: { playerId: string } }>(
    "/api/players/:playerId/status",
    async (request, reply) => {
      const access = checkPlayerAccess(request.headers["x-player-id"], request.params.playerId);
      if (!access.ok) return reply.code(access.code).send({ error: access.error });

      const { playerId } = access;
      const player = await getPlayer(playerId);
      if (!player) return reply.code(404).send({ error: "Player not found" });

      const lobby = await findPlayerLobby(playerId);
      if (!lobby) return reply.send({ player, lobby: null, view: null });

      const lobbyResponse = publicLobby(lobby);
      try {
        const view = lobby.gameId ? await gameService.getView(lobby.gameId, playerId) : null;
        return reply.send({ player, lobby: lobbyResponse, view });
      } catch (error) {
        if (!(error instanceof StaleGameError)) throw error;
        await leaveLobby(lobby.lobbyId, playerId);
        return reply.code(410).send({ error: error.message });
      }
    },
  );
}
