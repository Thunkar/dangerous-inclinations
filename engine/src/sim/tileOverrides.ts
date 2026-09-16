/**
 * Experiment-only subsystem overrides for the simulator:
 * `--tiles=fuel_compressor.slotType=side,ballistic_rack.damage=3,laser.sectorRange=2`
 *
 * Where `--weapons` reaches only a weapon's firing stats, this reaches any
 * field of any tile: which slot group it fits, what it costs, and what it
 * gives passively. Enough to move a tile from the side slots to the forward
 * one and to take half its job away, without touching `models/subsystems.ts`.
 *
 * Like the other override channels it mutates the shared configuration of the
 * process (or worker thread) running the games, so every game of a batch plays
 * under the same tiles. Never used by the server or the UI: a tile that
 * survives an experiment moves into `models/subsystems.ts` for real.
 */
import { SUBSYSTEM_CONFIGS } from "../models/subsystems.ts";
import type {
  PassiveEffect,
  SubsystemConfig,
  SubsystemType,
  WeaponStats,
} from "../models/subsystems.ts";

export type TileOverrides = Partial<Record<SubsystemType, Record<string, unknown>>>;

/** Which of the three nested shapes a field name belongs to. */
const PASSIVE_FIELDS: ReadonlySet<string> = new Set<keyof PassiveEffect>([
  "dissipationBonus",
  "criticalChanceBonus",
  "refuelOnWellTransfer",
]);
const WEAPON_FIELDS: ReadonlySet<string> = new Set<keyof WeaponStats>([
  "damage",
  "ringRange",
  "sectorRange",
  "arc",
  "hasRecoil",
  "sideRestricted",
  "canTargetSameRing",
  "ignoresShields",
  "maxAmmo",
  "fuelPerTurn",
  "maxMoves",
]);
const CONFIG_FIELDS: ReadonlySet<string> = new Set<keyof SubsystemConfig>([
  "name",
  "minEnergy",
  "maxEnergy",
  "generatesHeatOnUse",
  "slotType",
  "isPassive",
]);

function parseValue(raw: string): unknown {
  if (raw === "true" || raw === "false") return raw === "true";
  return Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : raw;
}

export function parseTileOverrides(text: string): TileOverrides {
  const out: TileOverrides = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`Tile override "${pair}" needs tile.field=value`);
    const [tile, field] = pair.slice(0, eq).trim().split(".");
    if (!tile || !Object.hasOwn(SUBSYSTEM_CONFIGS, tile))
      throw new Error(
        `Unknown tile "${tile}". Known: ${Object.keys(SUBSYSTEM_CONFIGS).join(", ")}`
      );
    if (!field) throw new Error(`Tile override "${pair}" needs a field`);
    if (!PASSIVE_FIELDS.has(field) && !WEAPON_FIELDS.has(field) && !CONFIG_FIELDS.has(field))
      throw new Error(
        `Unknown field "${field}". Known: ${[...CONFIG_FIELDS, ...PASSIVE_FIELDS, ...WEAPON_FIELDS].join(", ")}`
      );
    (out[tile as SubsystemType] ??= {})[field] = parseValue(pair.slice(eq + 1).trim());
  }
  return out;
}

export function applyTileOverrides(overrides?: TileOverrides): void {
  if (!overrides) return;
  for (const [tile, fields] of Object.entries(overrides) as Array<
    [SubsystemType, Record<string, unknown>]
  >) {
    const config = SUBSYSTEM_CONFIGS[tile];
    for (const [field, value] of Object.entries(fields)) {
      if (PASSIVE_FIELDS.has(field)) {
        (config.passiveEffect ??= {})[field as keyof PassiveEffect] = value as never;
      } else if (WEAPON_FIELDS.has(field)) {
        if (!config.weaponStats) throw new Error(`${tile} has no weapon stats`);
        config.weaponStats[field as keyof WeaponStats] = value as never;
      } else {
        config[field as keyof SubsystemConfig] = value as never;
      }
    }
  }
}
