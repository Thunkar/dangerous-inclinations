import { randomUUID } from "crypto";
import { getRedis } from "./redis.ts";
import type { PlayerAuth } from "../schemas/player.ts";

const PLAYER_KEY_PREFIX = "player:";

export async function createPlayer(
  playerName: string,
  playerId?: string,
): Promise<PlayerAuth> {
  const redis = getRedis();
  const id = playerId || randomUUID();

  const player: PlayerAuth = {
    playerId: id,
    playerName,
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
 * Who a `/api/players/:playerId/...` request may speak for. The session and
 * the game view are always the CALLER's (`x-player-id`); the URL id is only
 * there to address the route, so a caller asking for someone else's status is
 * refused rather than quietly served another player's view.
 */
export type StatusAccess = { ok: true; playerId: string } | { ok: false; code: 401 | 403; error: string };

export function checkStatusAccess(callerId: string | undefined, targetPlayerId: string): StatusAccess {
  if (!callerId) return { ok: false, code: 401, error: "Player ID required" };
  if (callerId !== targetPlayerId) return { ok: false, code: 403, error: "Cannot read another player's status" };
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
