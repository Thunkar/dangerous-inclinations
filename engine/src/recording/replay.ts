/**
 * Replay: reconstruct any turn of a recording, from the cached snapshot when
 * present or by re-executing actions from the initial state.
 */
import type { GameState } from "../models/game.ts";
import { DEFAULT_POINTS_TO_WIN } from "../models/missions.ts";
import type { GameRecording } from "./types.ts";
import { executeTurn } from "../game/turns.ts";

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * A state read back out of a recording. A file written before the table could
 * agree on four points carries no `pointsToWin`, and that game was played to
 * the default — so an old recording still opens, and still replays to the same
 * ending.
 */
export function restoreRecordedState(state: GameState): GameState {
  const restored = cloneState(state);
  if (restored.pointsToWin === undefined) restored.pointsToWin = DEFAULT_POINTS_TO_WIN;
  return restored;
}

/** State after `turnIndex` turns; -1 (or less) returns the initial state. */
export function reconstructStateAtTurn(recording: GameRecording, turnIndex: number): GameState {
  if (turnIndex < 0) return restoreRecordedState(recording.initialState);
  const index = Math.min(turnIndex, recording.turns.length - 1);
  const cached = recording.turns[index]?.resultingStateSnapshot;
  if (cached) return restoreRecordedState(cached);
  return reExecute(recording, index);
}

/** Re-execute the whole recording from its initial state. */
export function replayRecording(recording: GameRecording): GameState {
  return reExecute(recording, recording.turns.length - 1);
}

function reExecute(recording: GameRecording, upToIndex: number): GameState {
  let state = restoreRecordedState(recording.initialState);
  for (let i = 0; i <= upToIndex && i < recording.turns.length; i++) {
    const turn = recording.turns[i];
    const result = executeTurn(state, turn.actions);
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Replay failed at turn ${turn.turnNumber} (${turn.playerId}): ${result.errors.join("; ")}`
      );
    }
    state = result.gameState;
  }
  return state;
}
