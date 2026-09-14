/**
 * Service instances wired to Redis and the WebSocket rooms. Everything else
 * (routes, socket handlers, the lobby) imports from here. `getRedis` is passed
 * lazily so importing this module opens no connection.
 */
import { resolve } from "node:path";
import { getRedis } from "./redis.ts";
import { redisKv } from "./kv.ts";
import { createRecordingArchive, createRecordingService } from "./recordingService.ts";
import { createGameService, type GameTransport } from "./gameService.ts";
import { broadcastViews, sendToPlayer } from "../websocket/rooms.ts";

/** Archive of finished recordings. Override with $RECORDINGS_DIR to share with the sim CLI. */
export const RECORDINGS_DIR = process.env.RECORDINGS_DIR
  ? resolve(process.env.RECORDINGS_DIR)
  : resolve(process.cwd(), "recordings");

export const kv = redisKv(getRedis);
export const recordingArchive = createRecordingArchive(RECORDINGS_DIR);
export const recordings = createRecordingService(kv, recordingArchive);

const wsTransport: GameTransport = {
  sendToPlayer: (gameId, playerId, message) => sendToPlayer("game", gameId, playerId, message),
  broadcastViews: (gameId, build) => broadcastViews("game", gameId, build),
};

export const gameService = createGameService({ kv, recordings, transport: wsTransport });
