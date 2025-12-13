import type { Subsystem } from "../models/subsystems";

/**
 * Reset all subsystems' usedThisTurn flags
 * Should be called at the start of each turn
 */
export function resetSubsystemUsage(subsystems: Subsystem[]): Subsystem[] {
  return subsystems.map((s) => ({ ...s, usedThisTurn: false }));
}

/**
 * Get a subsystem by type
 */
export function getSubsystem(
  subsystems: Subsystem[],
  type: string,
): Subsystem | undefined {
  return subsystems.find((s) => s.type === type);
}
