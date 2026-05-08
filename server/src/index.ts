import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { playerRoutes } from "./routes/player.ts";
import { lobbyRoutes } from "./routes/lobby.ts";
import { gameRoutes } from "./routes/game.ts";
import { recordingRoutes } from "./routes/recordings.ts";
import { setupWebSocketRooms } from "./websocket/roomHandler.ts";
import { closeRedis } from "./services/redis.ts";

const fastify = Fastify({
  logger: true,
});

// Register CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
});

// Register WebSocket support
await fastify.register(websocket);

// Register routes
await fastify.register(playerRoutes);
await fastify.register(lobbyRoutes);
await fastify.register(gameRoutes);
await fastify.register(recordingRoutes);

// Setup WebSocket handlers
await setupWebSocketRooms(fastify);

// Health check
fastify.get("/health", async () => {
  return { status: "ok" };
});

// Graceful shutdown
const signals = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    await closeRedis();
    await fastify.close();
    process.exit(0);
  });
});

// Start server
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
