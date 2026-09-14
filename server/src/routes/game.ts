import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { gameService } from "../services/live.ts";
import { getPlayer } from "../services/playerService.ts";
import { DeploySchema, ForkSchema, LoadoutSubmissionSchema, RewindSchema } from "../schemas/game.ts";

interface GameRequest {
  Headers: { "x-player-id"?: string };
  Params: { gameId: string };
}

/**
 * Resolve the caller and the game, replying 401/404/403 when the caller is
 * missing, the game does not exist, or the caller is not one of its players.
 * The state stays here: handlers get ids and answer with views.
 */
async function requireMember(
  request: FastifyRequest<GameRequest>,
  reply: FastifyReply,
): Promise<{ playerId: string; gameId: string } | null> {
  const playerId = request.headers["x-player-id"];
  const { gameId } = request.params;
  if (!playerId) {
    await reply.code(401).send({ error: "Player ID required" });
    return null;
  }
  const state = await gameService.getGame(gameId);
  if (!state) {
    await reply.code(404).send({ error: "Game not found" });
    return null;
  }
  if (!state.players.some((p) => p.id === playerId)) {
    await reply.code(403).send({ error: "Not a player in this game" });
    return null;
  }
  return { playerId, gameId };
}

export async function gameRoutes(fastify: FastifyInstance) {
  // The caller's view and the full (filtered) event history.
  fastify.get<GameRequest>("/api/games/:gameId", async (request, reply) => {
    const member = await requireMember(request, reply);
    if (!member) return;
    const payload = await gameService.getViewWithHistory(member.gameId, member.playerId);
    if (!payload) return reply.code(404).send({ error: "Game not found" });
    return reply.send(payload);
  });

  // Loadout phase: ship loadout and the 3 missions kept from the 5 offered.
  fastify.post<GameRequest>("/api/games/:gameId/loadout", async (request, reply) => {
    const member = await requireMember(request, reply);
    if (!member) return;
    const body = LoadoutSubmissionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request", details: body.error.errors });

    const result = await gameService.submitLoadout(member.gameId, member.playerId, body.data);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ view: result.view });
  });

  // Deployment phase: place the ship (and Home) on a planet's outer ring.
  fastify.post<GameRequest>("/api/games/:gameId/deploy", async (request, reply) => {
    const member = await requireMember(request, reply);
    if (!member) return;
    const body = DeploySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request", details: body.error.errors });

    const result = await gameService.deploy(member.gameId, member.playerId, body.data.wellId, body.data.sector);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ view: result.view });
  });

  // Dev tool: rewind the game to a recorded turn. Connected players get a
  // TURN_EXECUTED with `rewind: true`; bots continue if one is to act.
  fastify.post<GameRequest>("/api/games/:gameId/rewind", async (request, reply) => {
    const member = await requireMember(request, reply);
    if (!member) return;
    const body = RewindSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request", details: body.error.errors });

    const result = await gameService.rewindGame(member.gameId, member.playerId, body.data.turnIndex);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ view: result.view });
  });

  // Dev tool: fork a recording into a new live game with the caller in one of the seats.
  fastify.post<{ Headers: { "x-player-id"?: string } }>("/api/games/fork", async (request, reply) => {
    const playerId = request.headers["x-player-id"];
    if (!playerId) return reply.code(401).send({ error: "Player ID required" });
    const player = await getPlayer(playerId);
    if (!player) return reply.code(401).send({ error: "Invalid player" });
    const body = ForkSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request", details: body.error.errors });

    const result = await gameService.forkGameFromRecording(body.data.recordingId, body.data.turnIndex, {
      impersonateOriginalPlayerId: body.data.impersonateOriginalPlayerId,
      humanPlayerId: playerId,
      humanPlayerName: player.playerName,
    });
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ gameId: result.gameId, view: result.view });
  });
}
