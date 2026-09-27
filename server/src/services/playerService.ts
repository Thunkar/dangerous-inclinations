import { randomUUID } from "crypto";
import { getRedis } from "./redis.ts";
import type { AgentInfo, PlayerAuth } from "../schemas/player.ts";

const PLAYER_KEY_PREFIX = "player:";

export async function createPlayer(playerName: string, agent?: AgentInfo): Promise<PlayerAuth> {
  const redis = getRedis();
  const id = randomUUID();

  const player: PlayerAuth = {
    playerId: id,
    playerName,
    ...(agent ? { agent } : {}),
    createdAt: Date.now(),
  };

  await redis.set(`${PLAYER_KEY_PREFIX}${id}`, JSON.stringify(player));

  return player;
}

export async function getPlayer(playerId: string): Promise<PlayerAuth | null> {
  const redis = getRedis();
  const data = await redis.get(`${PLAYER_KEY_PREFIX}${playerId}`);

  if (!data) return null;

  return JSON.parse(data) as PlayerAuth;
}

/**
 * Who a `/api/players/:playerId` request may speak for: only the caller
 * (`x-player-id`). The URL id only addresses the route, so reading someone
 * else's status or renaming someone else is refused rather than quietly done.
 */
export type PlayerAccess = { ok: true; playerId: string } | { ok: false; code: 401 | 403; error: string };

export function checkPlayerAccess(callerId: string | undefined, targetPlayerId: string): PlayerAccess {
  if (!callerId) return { ok: false, code: 401, error: "Player ID required" };
  if (callerId !== targetPlayerId) return { ok: false, code: 403, error: "You can only act as yourself" };
  return { ok: true, playerId: callerId };
}

export async function updatePlayerName(
  playerId: string,
  playerName: string,
): Promise<boolean> {
  const redis = getRedis();
  const player = await getPlayer(playerId);

  if (!player) return false;

  player.playerName = playerName;
  await redis.set(`${PLAYER_KEY_PREFIX}${playerId}`, JSON.stringify(player));

  return true;
}
