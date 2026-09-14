import type { SubsystemId, SubsystemType } from "./subsystems.ts";

/** d10 hit roll: 1 miss, 2-9 hit, 10 (or lower with sensors) critical. */
export type HitRollResult = "miss" | "hit" | "critical";

export interface CriticalHitEffect {
  subsystemId: SubsystemId;
  subsystemType: SubsystemType;
  energyLost: number;
}

export interface WeaponHitResult {
  roll: number;
  result: HitRollResult;
  damage: number;
  damageToHull: number;
  damageToHeat: number;
  criticalEffect?: CriticalHitEffect;
  /** True when the critical only happened because of a sensor array (roll below 10). */
  sensorAssistedCritical: boolean;
}
