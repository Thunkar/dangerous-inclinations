/**
 * Bridges {@link ReplayContext} into {@link GameContext}.
 *
 * The board components consume game state via `useGame()`. In replay mode we
 * don't have a live websocket / pending actions / animation system — we just
 * want the same rendering with the recorded GameState swapped in. This
 * provider builds a stub GameContext value:
 *   - `gameState` is forwarded from ReplayContext.
 *   - Mutation handlers are no-ops.
 *   - Animation handlers are stubs (no transitions during scrubbing).
 *   - Visualization toggles still work locally so users can show/hide ranges.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TacticalAction } from "./GameContext.tsx";
import {
  GameContextRaw,
  type AnimationHandlers,
  type GameContextType,
  type PendingState,
} from "./GameContext.tsx";
import { useReplay } from "./ReplayContext.tsx";

const noop = () => {};

export function ReplayGameContextBridge({ children }: { children: ReactNode }) {
  const { gameState } = useReplay();

  const animationHandlersRef = useRef<AnimationHandlers | null>(null);
  const registerAnimationHandlers = useCallback((handlers: AnimationHandlers) => {
    animationHandlersRef.current = handlers;
    handlers.syncDisplayState(gameState);
  }, [gameState]);

  // Keep animation display state in sync as the replay scrubs.
  if (animationHandlersRef.current) {
    animationHandlersRef.current.syncDisplayState(gameState);
  }

  // Local visualization toggles only — no game effect.
  const [weaponRangeVisibility, setWeaponRangeVisibility] = useState({
    laser: false,
    railgun: false,
    missiles: false,
    ballistic_rack: false,
  });
  const toggleWeaponRange = useCallback(
    (weaponType: "laser" | "railgun" | "missiles" | "ballistic_rack") => {
      setWeaponRangeVisibility((v) => ({ ...v, [weaponType]: !v[weaponType] }));
    },
    []
  );

  // Pending state mirrors the active player's current ship — no edits in replay.
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const pendingState: PendingState = useMemo(
    () => ({
      subsystems: activePlayer?.ship.subsystems.map((s) => ({ ...s })) ?? [],
      reactor: activePlayer?.ship.reactor ?? { totalCapacity: 0, availableEnergy: 0 },
      heat: activePlayer?.ship.heat ?? { currentHeat: 0 },
      facing: activePlayer?.ship.facing ?? "prograde",
      movement: { actionType: "coast", sectorAdjustment: 0, activateScoop: false },
      tacticalSequence: [] as TacticalAction[],
    }),
    [activePlayer]
  );

  const value: GameContextType = useMemo(
    () => ({
      // Replay mode has no live gameId — components that try to issue
      // game-mutating API calls in this context (rewind, etc.) should
      // gate on the empty string. The bridge stays read-only.
      gameId: '',
      gameState,
      pendingState,
      turnErrors: [],
      turnHistory: [],
      clearTurnErrors: noop,
      allocateEnergy: noop,
      deallocateEnergy: noop,
      setFacing: noop,
      setMovement: noop,
      setTacticalSequence: noop,
      executeTurn: noop,
      weaponRangeVisibility,
      toggleWeaponRange,
      registerAnimationHandlers,
      onGameStateChange: noop,
      movementPlan: null,
      isSelectingDestination: false,
      selectedDestination: null,
      setMovementPlan: noop,
      startSelectingDestination: noop,
      cancelSelectingDestination: noop,
      selectDestination: noop,
    }),
    [gameState, pendingState, weaponRangeVisibility, toggleWeaponRange, registerAnimationHandlers]
  );

  return <GameContextRaw.Provider value={value}>{children}</GameContextRaw.Provider>;
}
