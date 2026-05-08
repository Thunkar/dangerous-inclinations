import type { Subsystem } from "../models/subsystems.ts";

/**
 * Reset every subsystem's `usedThisTurn` flag. Called at the end of a player's
 * turn so weapons and other one-shot subsystems are available again next turn.
 */
export function resetSubsystemUsage(subsystems: Subsystem[]): Subsystem[] {
  return subsystems.map((s) => ({
    ...s,
    usedThisTurn: false,
  }));
}
