import type { FastifyInstance } from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import {
  listArchivedRecordings,
  loadRecording,
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

      // Try live (Redis-backed) first — recordingService keys recordings by gameId.
      const live = await loadRecording(id);
      if (live) return reply.send(live);

      // Fall back to disk archive: filenames are `${recordingId}.json`.
      const archived = listArchivedRecordings();
      const match = archived.find((p) => basename(p) === `${id}.json`);
      if (match && existsSync(match)) {
        const raw = readFileSync(match, "utf8");
        return reply.send(JSON.parse(raw));
      }

      return reply.code(404).send({ error: "Recording not found" });
    }
  );
}
