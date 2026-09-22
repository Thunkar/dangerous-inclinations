/**
 * Recording capture and persistence (schema v3: events per turn, `power` actions).
 *
 * Lifecycle:
 * - `init` when a game enters the active phase: the post-deployment state
 *   becomes `initialState`.
 * - `append` after every executed turn.
 * - `finalize` when the game ends: the recording is archived to disk and the
 *   Redis copy expires after 24h.
 *
 * Storage (Redis):
 * - `recording:{gameId}`         header: everything but the turns
 * - `recording:{gameId}:turns`   list, one JSON RecordedTurn per entry
 * - `recording:{gameId}:events`  list, one JSON GameEvent[] per turn
 * - `recording:{gameId}:pending-finalize` + `recordings:pending-finalize`
 *   set when the archive write failed, so the finalisation is retried on the
 *   next read or health tick instead of being lost.
 *
 * Appending a turn pushes to the two lists and never rewrites the header, so
 * it costs O(1) regardless of game length. Live recordings hold full states
 * and are private; only archived (finished) recordings are served by the API.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RECORDING_SCHEMA_VERSION,
  staleRecordingReason,
  type GameEvent,
  type GameRecording,
  type GameState,
  type RecordedTurn,
  type RecordingMetadata,
} from "@dangerous-inclinations/engine";
import type { Kv } from "./kv.ts";
import { log } from "./logger.ts";

type RecordingHeader = Omit<GameRecording, "turns">;

const ARCHIVE_TTL_SECONDS = 60 * 60 * 24;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const headerKey = (gameId: string) => `recording:${gameId}`;
const turnsKey = (gameId: string) => `recording:${gameId}:turns`;
const eventsKey = (gameId: string) => `recording:${gameId}:events`;
/** Flag: this game was finalized but its archive write failed. */
const pendingKey = (gameId: string) => `recording:${gameId}:pending-finalize`;
/** Queue of game ids to retry. Entries without a flag are stale and dropped. */
const PENDING_LIST_KEY = "recordings:pending-finalize";

export interface RecordingSummary {
  recordingId: string;
  createdAt: string;
  source: RecordingMetadata["source"];
  turnCount: number;
  winnerId?: string;
  label?: string;
  file: string;
}

/** Finished recordings on disk. */
export interface RecordingArchive {
  list(): Promise<RecordingSummary[]>;
  load(recordingId: string): Promise<GameRecording | null>;
  write(recording: GameRecording): Promise<void>;
}

export function createRecordingArchive(dir: string): RecordingArchive {
  const fileFor = (recordingId: string) => join(dir, `${recordingId}.json`);

  async function readRecording(path: string): Promise<GameRecording | null> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as GameRecording;
    } catch {
      return null;
    }
  }

  return {
    async list() {
      let files: string[];
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
      } catch {
        return [];
      }
      const summaries = await Promise.all(
        files.map(async (file): Promise<RecordingSummary | null> => {
          const rec = await readRecording(join(dir, file));
          // A recording made under other rules is not a game this build can
          // show: it is left out, never migrated (`staleRecordingReason`).
          if (!rec || staleRecordingReason(rec) !== null) return null;
          return {
            recordingId: rec.recordingId,
            createdAt: rec.createdAt,
            source: rec.metadata.source,
            turnCount: rec.metadata.turnCount,
            winnerId: rec.metadata.winnerId,
            label: rec.metadata.label,
            file,
          };
        }),
      );
      return summaries
        .filter((s): s is RecordingSummary => s !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async load(recordingId) {
      if (!SAFE_ID.test(recordingId)) return null;
      return readRecording(fileFor(recordingId));
    },
    async write(recording) {
      await mkdir(dir, { recursive: true });
      await writeFile(fileFor(recording.recordingId), JSON.stringify(recording));
    },
  };
}

export interface RecordingService {
  init(gameId: string, initialState: GameState, humanPlayerIds: ReadonlySet<string>, label?: string): Promise<GameRecording>;
  /**
   * Append one executed turn. Resolves with the recording's new turn count, or
   * null when the game has no recording. Rejects if the write failed, leaving
   * the recording as it was: the caller must not advance the game.
   */
  append(gameId: string, turn: RecordedTurn): Promise<number | null>;
  /** Live recording of a game (header + turns), or null. */
  load(gameId: string): Promise<GameRecording | null>;
  /** Every event of the game so far, in order. Empty if there is no recording yet. */
  loadEvents(gameId: string): Promise<GameEvent[]>;
  /** Keep turns 0..throughTurnIndex (inclusive); -1 keeps none. Clears any final state. */
  truncate(gameId: string, throughTurnIndex: number): Promise<void>;
  finalize(gameId: string, finalState: GameState, endReason: RecordingMetadata["endReason"]): Promise<GameRecording | null>;
  /** True once the game was finalized (archived, or archiving); rewind is refused then. */
  isFinalized(gameId: string): Promise<boolean>;
  /** Re-run archive writes that failed. Called on reads of ended games and on the health tick. */
  retryPendingFinalizations(): Promise<{ archived: number; pending: number }>;
  /** Delete the live recording (a deleted game). */
  discard(gameId: string): Promise<void>;
  loadArchived(recordingId: string): Promise<GameRecording | null>;
}

export function createRecordingService(kv: Kv, archive: RecordingArchive | null): RecordingService {
  const keys = (gameId: string) => [headerKey(gameId), turnsKey(gameId), eventsKey(gameId)];

  async function loadHeader(gameId: string): Promise<RecordingHeader | null> {
    const data = await kv.get(headerKey(gameId));
    return data ? (JSON.parse(data) as RecordingHeader) : null;
  }

  async function saveHeader(gameId: string, header: RecordingHeader): Promise<void> {
    await kv.set(headerKey(gameId), JSON.stringify(header));
  }

  async function loadTurns(gameId: string): Promise<RecordedTurn[]> {
    return (await kv.lrange(turnsKey(gameId))).map((t) => JSON.parse(t) as RecordedTurn);
  }

  /** Queue a failed archive write for retry (once per game, not once per attempt). */
  async function markPending(gameId: string, endReason: RecordingMetadata["endReason"]): Promise<void> {
    const alreadyQueued = await kv.get(pendingKey(gameId));
    await kv.set(pendingKey(gameId), JSON.stringify({ endReason, since: Date.now() }));
    if (!alreadyQueued) await kv.rpush(PENDING_LIST_KEY, gameId);
  }

  /** True when the recording is safely on disk (or there is no archive to write to). */
  async function writeToArchive(gameId: string, recording: GameRecording): Promise<boolean> {
    if (!archive) return true;
    try {
      await archive.write(recording);
      await kv.del(pendingKey(gameId));
      log.info(`Archived recording ${recording.recordingId} (${recording.turns.length} turns)`);
      return true;
    } catch (error) {
      log.error(`Failed to archive recording ${recording.recordingId}, will retry: ${String(error)}`);
      await markPending(gameId, recording.metadata.endReason);
      return false;
    }
  }

  const service: RecordingService = {
    async init(gameId, initialState, humanPlayerIds, label) {
      const header: RecordingHeader = {
        schemaVersion: RECORDING_SCHEMA_VERSION,
        recordingId: `live-${gameId}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        seed: initialState.rngSeed,
        initialState,
        metadata: {
          source: "live",
          playerKinds: initialState.players.map((p) => ({
            playerId: p.id,
            kind: humanPlayerIds.has(p.id) ? "human" : "bot",
          })),
          label: label ?? gameId,
          turnCount: 0,
          endReason: "max_turns", // overwritten by finalize
        },
      };
      await kv.del(turnsKey(gameId), eventsKey(gameId));
      await saveHeader(gameId, header);
      return { ...header, turns: [] };
    },

    async append(gameId, turn) {
      if (!(await kv.get(headerKey(gameId)))) return null;
      const turnCount = await kv.rpush(turnsKey(gameId), JSON.stringify(turn));
      try {
        await kv.rpush(eventsKey(gameId), JSON.stringify(turn.events));
      } catch (error) {
        // Keep the two lists in step: a half-written turn would desynchronise
        // the event history from the snapshots.
        await kv.ltrim(turnsKey(gameId), turnCount - 1);
        throw error;
      }
      return turnCount;
    },

    async load(gameId) {
      const header = await loadHeader(gameId);
      if (!header) return null;
      const turns = await loadTurns(gameId);
      return { ...header, turns, metadata: { ...header.metadata, turnCount: turns.length } };
    },

    async loadEvents(gameId) {
      const perTurn = await kv.lrange(eventsKey(gameId));
      return perTurn.flatMap((json) => JSON.parse(json) as GameEvent[]);
    },

    async truncate(gameId, throughTurnIndex) {
      const header = await loadHeader(gameId);
      if (!header) return;
      const keep = Math.max(0, throughTurnIndex + 1);
      await kv.ltrim(turnsKey(gameId), keep);
      await kv.ltrim(eventsKey(gameId), keep);
      await saveHeader(gameId, {
        ...header,
        finalState: undefined,
        metadata: { ...header.metadata, winnerId: undefined, endReason: "max_turns" },
      });
      // A rewound game is live again: drop the post-game expiry.
      for (const key of keys(gameId)) await kv.persist(key);
      await kv.del(pendingKey(gameId));
    },

    async finalize(gameId, finalState, endReason) {
      const header = await loadHeader(gameId);
      if (!header) return null;
      const turns = await loadTurns(gameId);
      const recording: GameRecording = {
        ...header,
        turns,
        finalState,
        metadata: { ...header.metadata, turnCount: turns.length, winnerId: finalState.winnerId, endReason },
      };
      const { turns: _turns, ...finalHeader } = recording;
      await saveHeader(gameId, finalHeader);
      // The live copy only starts expiring once the archive holds it; a failed
      // write leaves a pending flag so the next read or health tick retries.
      if (await writeToArchive(gameId, recording)) {
        for (const key of keys(gameId)) await kv.expire(key, ARCHIVE_TTL_SECONDS);
      }
      return recording;
    },

    async isFinalized(gameId) {
      const header = await loadHeader(gameId);
      if (!header) return false;
      if (header.finalState !== undefined) return true;
      return (await service.loadArchived(header.recordingId)) !== null;
    },

    async retryPendingFinalizations() {
      const queued = [...new Set(await kv.lrange(PENDING_LIST_KEY))];
      if (queued.length === 0) return { archived: 0, pending: 0 };

      const stillPending: string[] = [];
      let archived = 0;
      for (const gameId of queued) {
        if (!(await kv.get(pendingKey(gameId)))) continue; // archived in the meantime
        const header = await loadHeader(gameId);
        if (!header?.finalState) {
          // The game was deleted or rewound back to life: nothing to archive.
          await kv.del(pendingKey(gameId));
          continue;
        }
        const recording: GameRecording = { ...header, turns: await loadTurns(gameId) };
        if (await writeToArchive(gameId, recording)) {
          archived++;
          for (const key of keys(gameId)) await kv.expire(key, ARCHIVE_TTL_SECONDS);
        } else {
          stillPending.push(gameId);
        }
      }

      await kv.del(PENDING_LIST_KEY);
      for (const gameId of stillPending) await kv.rpush(PENDING_LIST_KEY, gameId);
      return { archived, pending: stillPending.length };
    },

    async discard(gameId) {
      await kv.del(...keys(gameId), pendingKey(gameId));
    },

    loadArchived(recordingId) {
      return archive ? archive.load(recordingId) : Promise.resolve(null);
    },
  };

  return service;
}
