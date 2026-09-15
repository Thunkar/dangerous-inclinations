/**
 * Experiment-only weapon overrides for the simulator: `--weapons=laser.damage=3,laser.sideRestricted=false`.
 * They mutate the shared subsystem configuration of the process (or worker
 * thread) that runs the games, so every game of a batch plays under the same
 * numbers. Never used by the server or the UI: a rule that survives an
 * experiment moves into `models/subsystems.ts`.
 */
import { SUBSYSTEM_CONFIGS } from "../models/subsystems.ts";
import type { WeaponStats, WeaponType } from "../models/subsystems.ts";

export type WeaponOverride = Partial<WeaponStats> & { minEnergy?: number; maxEnergy?: number };
export type WeaponOverrides = Partial<Record<WeaponType, WeaponOverride>>;

const WEAPONS: WeaponType[] = ["railgun", "laser", "missiles", "ballistic_rack"];

export function parseWeaponOverrides(text: string): WeaponOverrides {
  const out: WeaponOverrides = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`Weapon override "${pair}" needs weapon.field=value`);
    const [weapon, field] = pair.slice(0, eq).trim().split(".");
    const raw = pair.slice(eq + 1).trim();
    if (!WEAPONS.includes(weapon as WeaponType))
      throw new Error(`Unknown weapon "${weapon}". Known: ${WEAPONS.join(", ")}`);
    if (!field) throw new Error(`Weapon override "${pair}" needs a field`);
    const value: unknown =
      raw === "true" || raw === "false"
        ? raw === "true"
        : Number.isFinite(Number(raw))
          ? Number(raw)
          : raw;
    (out[weapon as WeaponType] ??= {})[field as keyof WeaponOverride] = value as never;
  }
  return out;
}

export function applyWeaponOverrides(overrides?: WeaponOverrides): void {
  if (!overrides) return;
  for (const [weapon, override] of Object.entries(overrides) as Array<
    [WeaponType, WeaponOverride]
  >) {
    const config = SUBSYSTEM_CONFIGS[weapon];
    if (!config.weaponStats) throw new Error(`${weapon} has no weapon stats`);
    const { minEnergy, maxEnergy, ...stats } = override;
    if (minEnergy !== undefined) config.minEnergy = minEnergy;
    if (maxEnergy !== undefined) config.maxEnergy = maxEnergy;
    Object.assign(config.weaponStats, stats);
  }
}
