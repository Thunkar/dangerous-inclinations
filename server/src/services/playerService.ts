import { randomUUID } from "crypto";
import { getRedis } from "./redis.js";
import type { PlayerAuth } from "../schemas/player.js";

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
