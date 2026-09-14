import type { FastifyInstance } from "fastify";
import { recordingArchive } from "../services/live.ts";

/**
 * Read-only access to finished recordings. Live recordings hold every
 * player's hidden information and are never served.
 */
export async function recordingRoutes(fastify: FastifyInstance) {
  fastify.get("/api/recordings", async (_request, reply) => {
    return reply.send({ recordings: await recordingArchive.list() });
  });

  fastify.get<{ Params: { id: string } }>("/api/recordings/:id", async (request, reply) => {
    const recording = await recordingArchive.load(request.params.id);
    if (!recording) return reply.code(404).send({ error: "Recording not found" });
    return reply.send(recording);
  });
}
