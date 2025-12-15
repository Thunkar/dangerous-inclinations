import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { playerRoutes } from "./routes/player.js";
import { lobbyRoutes } from "./routes/lobby.js";
import { setupGameWebSocket } from "./websocket/gameHandler.js";
import { setupWebSocketRooms } from "./websocket/roomHandler.js";
import { closeRedis } from "./services/redis.js";

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

// Setup WebSocket handlers
await setupWebSocketRooms(fastify);
await setupGameWebSocket(fastify);

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
