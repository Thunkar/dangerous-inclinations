/**
 * Round-trip tests for the recording format.
 *
 * The contract: re-executing a recording's actions starting from its
 * `initialState` must reproduce every per-turn snapshot exactly. If this
 * fails, either the engine has hidden non-determinism or the recording
 * captured something the replay path can't reproduce.
 */

import { describe, it, expect } from "vitest";
import { runSimulation } from "../sim/runSimulation.ts";
import { executeTurn } from "../game/turns.ts";
import type { GameState } from "../models/game.ts";

function fingerprint(state: GameState): string {
  return JSON.stringify(state, Object.keys(state).sort());
}

describe("Recording replay round-trip", () => {
  it("re-executing recorded actions reproduces every snapshot", () => {
    const { recording } = runSimulation({
      seed: 0xfeedface,
      botCount: 2,
      maxTurns: 60,
    });

    expect(recording.turns.length).toBeGreaterThan(0);

    let state = JSON.parse(JSON.stringify(recording.initialState)) as GameState;

    for (const turn of recording.turns) {
      const result = executeTurn(state, turn.actions);
      // The recording was produced via the same sim path; replay should match.
      expect(
        result.errors,
        `Turn ${turn.turnNumber} (player ${turn.playerId}) errored on replay`
      ).toBeUndefined();

      state = result.gameState;

      expect(fingerprint(state)).toBe(fingerprint(turn.resultingStateSnapshot));
    }
  });

  it("recording metadata reflects what actually happened", () => {
    const { recording, endReason } = runSimulation({
      seed: 0x1337,
      botCount: 3,
      maxTurns: 80,
      label: "test-batch",
    });

    expect(recording.metadata.source).toBe("sim");
    expect(recording.metadata.label).toBe("test-batch");
    expect(recording.metadata.turnCount).toBe(recording.turns.length);
    expect(recording.metadata.endReason).toBe(endReason);
    expect(recording.metadata.playerKinds).toHaveLength(3);
    expect(recording.metadata.playerKinds.every((p) => p.kind === "bot")).toBe(true);
  });

  it("recording is fully JSON-serializable", () => {
    const { recording } = runSimulation({ seed: 42, botCount: 2, maxTurns: 30 });

    const serialized = JSON.stringify(recording);
    const parsed = JSON.parse(serialized);

    expect(parsed.recordingId).toBe(recording.recordingId);
    expect(parsed.turns).toHaveLength(recording.turns.length);
    expect(parsed.initialState.rngSeed).toBe(recording.initialState.rngSeed);
  });
});
