import type { FastifyReply } from "fastify";
import { getPlayer } from "../services/playerService.ts";
import type { PlayerAuth } from "../schemas/player.ts";

/**
 * Resolve the caller from its `x-player-id` header, replying 401 when the
 * header is missing or names no registered player.
 */
export async function requirePlayer(
  playerId: string | undefined,
  reply: FastifyReply
): Promise<PlayerAuth | null> {
  if (!playerId) {
    await reply.code(401).send({ error: "Player ID required" });
    return null;
  }
  const player = await getPlayer(playerId);
  if (!player) {
    await reply.code(401).send({ error: "Invalid player" });
    return null;
  }
  return player;
}
