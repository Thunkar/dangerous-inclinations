import type { FastifyInstance } from "fastify";
import { staleRecordingReason } from "@dangerous-inclinations/engine";
import { recordingArchive } from "../services/live.ts";

/**
 * Read-only access to finished recordings. Live recordings hold every
 * player's hidden information and are never served. A recording made under
 * older rules is listed as stale and refused here, never migrated.
 */
export async function recordingRoutes(fastify: FastifyInstance) {
  fastify.get("/api/recordings", async (_request, reply) => {
    return reply.send({ recordings: await recordingArchive.list() });
  });

  fastify.get<{ Params: { id: string } }>("/api/recordings/:id", async (request, reply) => {
    const recording = await recordingArchive.load(request.params.id);
    if (!recording) return reply.code(404).send({ error: "Recording not found" });
    const stale = staleRecordingReason(recording);
    if (stale) return reply.code(410).send({ error: stale });
    return reply.send(recording);
  });
}
