/** d10 hit roll: 1 miss, 2-9 hit, 10 (or lower with sensors) critical. */
export type HitRollResult = "miss" | "hit" | "critical";

export interface WeaponHitResult {
  roll: number;
  result: HitRollResult;
  damage: number;
  damageToHull: number;
  damageToHeat: number;
}
