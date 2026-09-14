/**
 * Recording round-trip: re-executing a recording's actions from its initial
 * state must reproduce every snapshot exactly.
 */
import { describe, it, expect } from "vitest";
import { executeTurn } from "../game/turns.ts";
import { cloneState, reconstructStateAtTurn, replayRecording } from "../recording/replay.ts";
import { RECORDING_SCHEMA_VERSION, type GameRecording } from "../recording/types.ts";
import { canonicalJson, playScripted, scriptedGameStart } from "./testUtils.ts";

function record(seed: number, turnCount: number): GameRecording {
  const initialState = scriptedGameStart(seed);
  const turns = playScripted(initialState, turnCount);
  const finalState = turns[turns.length - 1].state;
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    recordingId: `rec-${seed}`,
    createdAt: "2026-09-14T00:00:00.000Z",
    seed,
    initialState,
    turns: turns.map((t, i) => ({
      turnNumber: i,
      playerId: t.playerId,
      actions: t.actions,
      resultingStateSnapshot: t.state,
      events: t.events,
    })),
    finalState,
    metadata: {
      source: "sim",
      playerKinds: [
        { playerId: "p1", kind: "bot" },
        { playerId: "p2", kind: "bot" },
      ],
      turnCount: turns.length,
      winnerId: finalState.winnerId,
      endReason: finalState.phase === "ended" ? "victory" : "max_turns",
    },
  };
}

describe("recording: replay", () => {
  const recording = record(0xfeedface, 24);

  it("re-executing each turn's actions on the previous snapshot reproduces the next snapshot", () => {
    let state = cloneState(recording.initialState);
    for (const turn of recording.turns) {
      const result = executeTurn(state, turn.actions);
      expect(result.errors, `turn ${turn.turnNumber} (${turn.playerId})`).toBeUndefined();
      expect(canonicalJson(result.gameState)).toBe(canonicalJson(turn.resultingStateSnapshot));
      expect(result.events).toEqual(turn.events);
      state = result.gameState;
    }
  });

  it("replayRecording reaches the final state", () => {
    expect(canonicalJson(replayRecording(recording))).toBe(canonicalJson(recording.finalState));
  });

  it("reconstructStateAtTurn returns clones of the right snapshots", () => {
    const initial = reconstructStateAtTurn(recording, -1);
    expect(canonicalJson(initial)).toBe(canonicalJson(recording.initialState));
    expect(initial).not.toBe(recording.initialState);
    expect(canonicalJson(reconstructStateAtTurn(recording, 5))).toBe(
      canonicalJson(recording.turns[5].resultingStateSnapshot)
    );
    expect(canonicalJson(reconstructStateAtTurn(recording, 999))).toBe(
      canonicalJson(recording.finalState)
    );
  });

  it("falls back to re-execution when a snapshot is missing", () => {
    const stripped: GameRecording = {
      ...recording,
      turns: recording.turns.map((t) => ({ ...t, resultingStateSnapshot: undefined as never })),
    };
    expect(canonicalJson(reconstructStateAtTurn(stripped, 7))).toBe(
      canonicalJson(recording.turns[7].resultingStateSnapshot)
    );
  });

  it("throws when a recorded turn no longer validates", () => {
    const corrupted: GameRecording = {
      ...recording,
      turns: recording.turns.map((t, i) =>
        i === 3 ? { ...t, actions: [...t.actions, { ...t.actions[0], sequence: 1 }] } : t
      ),
    };
    expect(() => replayRecording(corrupted)).toThrow(/turn 3/);
  });
});

describe("recording: serialisation", () => {
  const recording = record(42, 12);

  it("survives a JSON round trip unchanged", () => {
    const parsed = JSON.parse(JSON.stringify(recording)) as GameRecording;
    expect(parsed).toEqual(recording);
    expect(canonicalJson(parsed.finalState)).toBe(canonicalJson(recording.finalState));
  });

  it("a state read back from JSON replays exactly like the original", () => {
    const parsed = JSON.parse(JSON.stringify(recording)) as GameRecording;
    expect(canonicalJson(replayRecording(parsed))).toBe(canonicalJson(recording.finalState));
  });

  it("metadata is consistent with the turns", () => {
    expect(recording.metadata.turnCount).toBe(recording.turns.length);
    expect(recording.turns.map((t) => t.playerId)).toEqual(
      recording.turns.map((_, i) => (i % 2 === 0 ? "p1" : "p2"))
    );
    expect(recording.schemaVersion).toBe(2);
  });
});
