/**
 * Replay: reconstruct any turn of a recording, from the cached snapshot when
 * present or by re-executing actions from the initial state.
 */
import type { GameState } from "../models/game.ts";
import type { GameRecording } from "./types.ts";
import { executeTurn } from "../game/turns.ts";

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** State after `turnIndex` turns; -1 (or less) returns the initial state. */
export function reconstructStateAtTurn(recording: GameRecording, turnIndex: number): GameState {
  if (turnIndex < 0) return cloneState(recording.initialState);
  const index = Math.min(turnIndex, recording.turns.length - 1);
  const cached = recording.turns[index]?.resultingStateSnapshot;
  if (cached) return cloneState(cached);
  return reExecute(recording, index);
}

/** Re-execute the whole recording from its initial state. */
export function replayRecording(recording: GameRecording): GameState {
  return reExecute(recording, recording.turns.length - 1);
}

function reExecute(recording: GameRecording, upToIndex: number): GameState {
  let state = cloneState(recording.initialState);
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
