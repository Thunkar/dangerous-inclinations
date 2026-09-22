import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent } from "../models/events.ts";

/**
 * Bumped whenever the recording schema changes incompatibly.
 * v2: events replace log strings; states carry no log; new action shapes.
 * v3: `power` replaces `set_standing_power`; energy stays on a tile until its owner's next turn.
 */
export const RECORDING_SCHEMA_VERSION = 3;

/**
 * Why a recording cannot be replayed, or null when it can. A recording made
 * under other rules is refused, never migrated: its states and actions mean
 * what the engine meant when it was written.
 */
export function staleRecordingReason(recording: { schemaVersion?: unknown }): string | null {
  if (recording.schemaVersion === RECORDING_SCHEMA_VERSION) return null;
  const version =
    recording.schemaVersion === undefined ? "no schema version" : `schema v${String(recording.schemaVersion)}`;
  return `This recording predates the current rules (${version}, the rules are at v${RECORDING_SCHEMA_VERSION}) and cannot be replayed`;
}

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
  endReason: "victory" | "max_turns" | "invalid_turn" | "tiebreak";
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
