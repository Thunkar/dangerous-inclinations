/**
 * Recording capture and persistence.
 *
 * Lifecycle:
 * - `initRecording`: called when a game transitions from deployment → active.
 *   Captures the post-deployment GameState as the recording's `initialState`.
 * - `appendTurn`: called after every successful turn. Captures the actions,
 *   resulting snapshot, and log entries.
 * - `finalizeRecording`: called when the game ends. Writes the recording to
 *   the filesystem (recordings/) and leaves a copy in Redis for ~24h.
 *
 * Storage:
 * - Live: Redis key `recording:{gameId}`, JSON-stringified, no TTL while game
 *   is active. TTL of 24h applied on finalize.
 * - Archive: `recordings/{recordingId}.json` on disk, gitignored.
 */

import { mkdirSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getRedis } from "./redis.ts";
import {
  RECORDING_SCHEMA_VERSION,
  type GameRecording,
  type GameState,
  type PlayerAction,
  type RecordedTurn,
  type RecordingMetadata,
  type TurnLogEntry,
} from "@dangerous-inclinations/engine";

const RECORDING_KEY_PREFIX = "recording:";
const ARCHIVE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * Filesystem location for archived recordings. Override with $RECORDINGS_DIR
 * to share with the sim CLI (which can write into the same folder via
 * `yarn sim --output=...`).
 */
const RECORDINGS_DIR = resolve(
  process.env.RECORDINGS_DIR ?? process.cwd(),
  process.env.RECORDINGS_DIR ? "" : "recordings"
);

/**
 * Initialize a recording when the game enters the active phase.
 * The post-deployment state is captured as `initialState` so replays start
 * from a stable, gameplay-ready snapshot.
 */
export async function initRecording(
  gameId: string,
  initialState: GameState,
  humanPlayerIds: Set<string>,
  label?: string
): Promise<GameRecording> {
  const recordingId = `live-${gameId}-${Date.now()}`;

  const recording: GameRecording = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    recordingId,
    createdAt: new Date().toISOString(),
    seed: initialState.rngSeed,
    initialState: cloneState(initialState),
    turns: [],
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

  await saveRecording(gameId, recording);
  return recording;
}

/**
 * Append one turn's worth of data to the live recording. Called after every
 * successful executeTurn. No-op if no recording exists for this game.
 */
export async function appendTurn(
  gameId: string,
  turn: {
    turnNumber: number;
    playerId: string;
    actions: PlayerAction[];
    resultingState: GameState;
    logEntries: TurnLogEntry[];
  }
): Promise<void> {
  const recording = await loadRecording(gameId);
  if (!recording) return;

  const recordedTurn: RecordedTurn = {
    turnNumber: turn.turnNumber,
    playerId: turn.playerId,
    actions: turn.actions,
    resultingStateSnapshot: cloneState(turn.resultingState),
    logEntries: turn.logEntries,
  };

  recording.turns.push(recordedTurn);
  recording.metadata.turnCount = recording.turns.length;
  await saveRecording(gameId, recording);
}

/**
 * Finalize the recording on game end. Writes to disk and applies a TTL to the
 * Redis copy. Idempotent — calling twice on the same game is safe.
 */
export async function finalizeRecording(
  gameId: string,
  finalState: GameState,
  endReason: RecordingMetadata["endReason"]
): Promise<GameRecording | null> {
  const recording = await loadRecording(gameId);
  if (!recording) return null;

  recording.finalState = cloneState(finalState);
  recording.metadata.winnerId = finalState.winnerId;
  recording.metadata.endReason = endReason;

  await saveRecording(gameId, recording);
  await applyArchiveTtl(gameId);
  writeRecordingToDisk(recording);

  return recording;
}

/**
 * Read a recording by gameId from Redis.
 */
export async function loadRecording(
  gameId: string
): Promise<GameRecording | null> {
  const redis = getRedis();
  const data = await redis.get(`${RECORDING_KEY_PREFIX}${gameId}`);
  if (!data) return null;
  return JSON.parse(data) as GameRecording;
}

/**
 * List recording filenames in the archive directory.
 * Caller is responsible for opening individual files.
 */
export function listArchivedRecordings(): string[] {
  if (!existsSync(RECORDINGS_DIR)) return [];
  return readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(RECORDINGS_DIR, f));
}

async function saveRecording(
  gameId: string,
  recording: GameRecording
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `${RECORDING_KEY_PREFIX}${gameId}`,
    JSON.stringify(recording)
  );
}

async function applyArchiveTtl(gameId: string): Promise<void> {
  const redis = getRedis();
  await redis.expire(`${RECORDING_KEY_PREFIX}${gameId}`, ARCHIVE_TTL_SECONDS);
}

function writeRecordingToDisk(recording: GameRecording): void {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
  const filename = `${recording.recordingId}.json`;
  writeFileSync(join(RECORDINGS_DIR, filename), JSON.stringify(recording));
}

/**
 * GameState is fully JSON-serializable, so JSON round-trip is a safe deep
 * clone and produces a snapshot independent from later mutations.
 */
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
