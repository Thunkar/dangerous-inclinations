import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { playerRoutes } from "./routes/player.ts";
import { lobbyRoutes } from "./routes/lobby.ts";
import { gameRoutes } from "./routes/game.ts";
import { recordingRoutes } from "./routes/recordings.ts";
import { setupWebSocketRooms } from "./websocket/roomHandler.ts";
import { closeRedis } from "./services/redis.ts";
import { setLogger } from "./services/logger.ts";
import { gameService, recordings, RECORDINGS_DIR } from "./services/live.ts";

const fastify = Fastify({
  logger: true,
});

// Services log through Fastify's logger once it exists.
setLogger({
  info: (msg) => fastify.log.info(msg),
  warn: (msg) => fastify.log.warn(msg),
  error: (msg) => fastify.log.error(msg),
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
});

await fastify.register(websocket);

await fastify.register(playerRoutes);
await fastify.register(lobbyRoutes);
await fastify.register(gameRoutes);
await fastify.register(recordingRoutes);

await setupWebSocketRooms(fastify);

/**
 * Health and liveness. `botInvalidTurns` counts live bot turns the engine
 * rejected (each was replaced by an empty turn so the game could go on);
 * anything above 0 is a bug in the AI or the rules worth chasing.
 *
 * The tick doubles as the retry for finished games whose archive write failed:
 * `pendingFinalizations` is how many are still waiting.
 */
fastify.get("/api/health", async () => {
  let pendingFinalizations = 0;
  try {
    ({ pending: pendingFinalizations } = await recordings.retryPendingFinalizations());
  } catch (error) {
    fastify.log.error({ error }, "Failed to retry pending recording finalizations");
  }
  return {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    botInvalidTurns: gameService.getBotInvalidTurnCount(),
    pendingFinalizations,
    recordingsDir: RECORDINGS_DIR,
  };
});

// Legacy path kept for existing probes.
fastify.get("/health", async () => ({ status: "ok" }));

const signals = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    await closeRedis();
    await fastify.close();
    process.exit(0);
  });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3000");
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    await closeRedis();
    process.exit(1);
  }
};

start();
