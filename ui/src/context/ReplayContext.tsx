/**
 * ReplayContext — read-only playback of a {@link GameRecording}.
 *
 * Exposes the current `gameState` (selected by turn index) plus navigation
 * helpers. The board components consume `gameState` via {@link GameContext};
 * to reuse them, the replay screen wraps its tree in a stub `GameContext`
 * that forwards `gameState` from this context and stubs every mutation.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GameRecording, GameState } from "@dangerous-inclinations/engine";
import { reconstructStateAtTurn } from "@dangerous-inclinations/engine";

interface ReplayContextValue {
  recording: GameRecording;
  /** -1 = before any turn (initial state); 0..turns.length-1 = after turn N. */
  turnIndex: number;
  /** Total number of recorded turns. */
  turnCount: number;
  /** GameState reconstructed at the current turnIndex. */
  gameState: GameState;
  /** Whether the timeline is auto-advancing. */
  playing: boolean;

  setTurnIndex: (n: number) => void;
  step: (delta: number) => void;
  togglePlay: () => void;
  setSpeed: (msPerTurn: number) => void;
  speed: number;
}

const ReplayContext = createContext<ReplayContextValue | undefined>(undefined);

const DEFAULT_SPEED_MS = 600;

export function ReplayProvider({
  recording,
  children,
}: {
  recording: GameRecording;
  children: ReactNode;
}) {
  const [turnIndex, setTurnIndexState] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED_MS);

  const turnCount = recording.turns.length;

  const gameState = useMemo(
    () => reconstructStateAtTurn(recording, turnIndex),
    [recording, turnIndex]
  );

  const setTurnIndex = useCallback(
    (n: number) => {
      const clamped = Math.max(-1, Math.min(turnCount - 1, Math.floor(n)));
      setTurnIndexState(clamped);
    },
    [turnCount]
  );

  const step = useCallback(
    (delta: number) => setTurnIndexState((i) => Math.max(-1, Math.min(turnCount - 1, i + delta))),
    [turnCount]
  );

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // If paused at the end, restart from beginning.
      if (!p && turnIndex >= turnCount - 1) {
        setTurnIndexState(-1);
      }
      return !p;
    });
  }, [turnIndex, turnCount]);

  // Auto-advance loop while `playing` is true. setInterval is fine here:
  // the speed is in the hundreds of ms and `step` is cheap (snapshot lookup).
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTurnIndexState((i) => {
        if (i >= turnCount - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [playing, speed, turnCount]);

  const value = useMemo<ReplayContextValue>(
    () => ({
      recording,
      turnIndex,
      turnCount,
      gameState,
      playing,
      speed,
      setTurnIndex,
      step,
      togglePlay,
      setSpeed,
    }),
    [recording, turnIndex, turnCount, gameState, playing, speed, setTurnIndex, step, togglePlay]
  );

  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>;
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used inside ReplayProvider");
  return ctx;
}
