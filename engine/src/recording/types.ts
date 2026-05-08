import type { GameState, PlayerAction, TurnLogEntry } from "../models/game.ts";

/**
 * Bumped whenever the recording schema changes incompatibly. Replays should
 * refuse to load recordings with a version they don't understand.
 */
export const RECORDING_SCHEMA_VERSION = 1;

/**
 * A single turn within a recording.
 *
 * `actions` is the source of truth for replay; `resultingStateSnapshot` is a
 * derived cache that lets the UI scrub to any turn in O(1) without
 * re-executing. The two should agree: re-executing actions from the prior
 * snapshot must reproduce this snapshot exactly (validated by replay tests).
 */
export interface RecordedTurn {
  /** Turn number this record corresponds to (matches GameState.turn at recording time). */
  turnNumber: number;
  /** Player whose turn this was. */
  playerId: string;
  /** Actions submitted for this turn (post-fallback if the original failed). */
  actions: PlayerAction[];
  /** GameState immediately after the turn completed. Cached for fast scrubbing. */
  resultingStateSnapshot: GameState;
  /** Log entries produced by this turn. Convenience copy of the deltas. */
  logEntries: TurnLogEntry[];
}

/**
 * Metadata captured about how the game was produced — useful for filtering
 * recordings during analysis (e.g., "only sim runs with 4 bots").
 */
export interface RecordingMetadata {
  /** "sim" for headless simulation, "live" for a real game played via the server. */
  source: "sim" | "live";
  /** Player roles for quick filtering. */
  playerKinds: Array<{ playerId: string; kind: "human" | "bot" }>;
  /** Optional human-readable label (sim batch name, live game ID, etc.). */
  label?: string;
  /** Total turns executed before the recording stopped. */
  turnCount: number;
  /** Winner player id, if the game ended. */
  winnerId?: string;
  /** Reason the run stopped. */
  endReason: "victory" | "max_turns" | "fatal_error";
}

/**
 * A complete game recording — initial state, every turn's actions, and a
 * snapshot per turn. Replay this to reproduce the entire game; use snapshots
 * to scrub the UI.
 *
 * The recording is fully JSON-serializable.
 */
export interface GameRecording {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  recordingId: string;
  /** ISO 8601 timestamp of when recording started. */
  createdAt: string;
  /** Seed used to initialize the game's RNG. Captured here for reproducibility. */
  seed: number;
  /** GameState at the moment recording began (post-loadout, post-deployment). */
  initialState: GameState;
  /** Turn-by-turn log. */
  turns: RecordedTurn[];
  /** Final GameState if the game ended cleanly. */
  finalState?: GameState;
  metadata: RecordingMetadata;
}
