import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  listArchivedRecordings,
  loadRecordingByAnyId,
} from "../services/recordingService.ts";

/**
 * Recording routes — read-only access to live and archived recordings.
 *
 * - GET /api/recordings              List archived recordings (filenames + metadata).
 * - GET /api/recordings/:id          Fetch a recording by id (live or archived).
 *
 * No auth on the read side because recordings are post-game artifacts; if you
 * need access control later, gate by player membership in `metadata.playerKinds`.
 */
export async function recordingRoutes(fastify: FastifyInstance) {
  fastify.get("/api/recordings", async (_request, reply) => {
    const archived = listArchivedRecordings();
    const summaries = archived.map((path) => {
      try {
        const raw = readFileSync(path, "utf8");
        const rec = JSON.parse(raw) as {
          recordingId: string;
          createdAt: string;
          metadata: { source: string; turnCount: number; winnerId?: string; label?: string };
        };
        return {
          recordingId: rec.recordingId,
          createdAt: rec.createdAt,
          source: rec.metadata.source,
          turnCount: rec.metadata.turnCount,
          winnerId: rec.metadata.winnerId,
          label: rec.metadata.label,
          file: basename(path),
        };
      } catch {
        return { file: basename(path), error: "unreadable" };
      }
    });
    return reply.send({ recordings: summaries });
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/recordings/:id",
    async (request, reply) => {
      const { id } = request.params;
      // The lookup helper handles all three id flavours we accept:
      // gameId (Redis), recordingId (archive filename), and the metadata
      // fallback. See loadRecordingByAnyId for the resolution order.
      const recording = await loadRecordingByAnyId(id);
      if (!recording) {
        // Last-ditch fallback: archive filename match — useful for old
        // recordings whose recordingId format predates the loader's
        // pattern guard.
        const archived = listArchivedRecordings();
        const exact = archived.find((p) => basename(p) === `${id}.json`);
        if (exact) return reply.send(JSON.parse(readFileSync(exact, "utf8")));
        return reply.code(404).send({ error: "Recording not found" });
      }
      return reply.send(recording);
    }
  );
}
