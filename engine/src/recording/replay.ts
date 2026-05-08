/**
 * Replay helpers — read a {@link GameRecording} and produce GameState at any
 * point. Two paths:
 *
 * - Snapshot path (fast, default): if the recording carries per-turn snapshots
 *   (which sim and the live server both produce), reconstruction is O(1) — just
 *   index into `turns[index].resultingStateSnapshot`.
 *
 * - Re-execute path (validation): if snapshots are absent or you want to verify
 *   determinism, replay actions starting from `initialState`. The resulting
 *   state must equal the recorded snapshot byte-for-byte; this is the test
 *   harness for catching engine non-determinism regressions.
 */

import type { GameRecording } from "./types.ts";
import type { GameState } from "../models/game.ts";
import { executeTurn } from "../game/turns.ts";

/**
 * Return the GameState immediately after `turnIndex` was applied. Use
 * turnIndex = -1 to get the recording's `initialState` (before any turn).
 */
export function reconstructStateAtTurn(
  recording: GameRecording,
  turnIndex: number
): GameState {
  if (turnIndex < -1 || turnIndex >= recording.turns.length) {
    throw new RangeError(
      `turnIndex ${turnIndex} out of range [-1, ${recording.turns.length - 1}]`
    );
  }

  if (turnIndex === -1) {
    return cloneState(recording.initialState);
  }

  const snapshot = recording.turns[turnIndex].resultingStateSnapshot;
  if (snapshot) {
    return cloneState(snapshot);
  }

  // Snapshot absent — re-execute from initial state up to turnIndex.
  return reExecute(recording, turnIndex);
}

/**
 * Re-execute every recorded turn from initial state. Returns the final state.
 * Throws if any turn fails validation, which would indicate engine
 * non-determinism (the recording was produced by the same engine).
 */
export function replayRecording(recording: GameRecording): GameState {
  return reExecute(recording, recording.turns.length - 1);
}

function reExecute(recording: GameRecording, upToInclusive: number): GameState {
  let state = cloneState(recording.initialState);
  for (let i = 0; i <= upToInclusive; i++) {
    const turn = recording.turns[i];
    const result = executeTurn(state, turn.actions);
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Replay failed at turn ${turn.turnNumber} (player ${turn.playerId}): ${result.errors.join("; ")}`
      );
    }
    state = result.gameState;
  }
  return state;
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
