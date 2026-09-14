import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent } from "../models/events.ts";

/**
 * Bumped whenever the recording schema changes incompatibly.
 * v2: events replace log strings; states carry no log; new action shapes.
 */
export const RECORDING_SCHEMA_VERSION = 2;

/**
 * One turn. `actions` is the source of truth for replay; the snapshot is a
 * cache for O(1) scrubbing and must equal re-executing the actions on the
 * previous snapshot.
 */
export interface RecordedTurn {
  turnNumber: number;
  playerId: string;
  actions: PlayerAction[];
  resultingStateSnapshot: GameState;
  events: GameEvent[];
}

export interface RecordingMetadata {
  source: "sim" | "live";
  playerKinds: Array<{ playerId: string; kind: "human" | "bot" }>;
  label?: string;
  turnCount: number;
  winnerId?: string;
  endReason: "victory" | "max_turns" | "invalid_turn";
}

/**
 * A complete game: initial (post-deployment) state, every turn, final state.
 * Recordings hold full authoritative state and are private until a game ends.
 */
export interface GameRecording {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  recordingId: string;
  createdAt: string;
  seed: number;
  initialState: GameState;
  turns: RecordedTurn[];
  finalState?: GameState;
  metadata: RecordingMetadata;
}
