/**
 * Subsystems: the tiles a ship carries.
 *
 * A ship always has three fixed systems (engines, thrusters, scoop) plus one
 * forward slot and four side slots chosen at loadout. Every subsystem has a
 * stable id derived from its slot ("engines", "forward-0", "side-2"), and all
 * actions refer to subsystems by that id.
 *
 * Energy and heat:
 * - Energy allocated to a subsystem persists across turns.
 * - Using a subsystem generates heat equal to its allocated energy.
 * - Heat above the ship's dissipation capacity becomes hull damage at the end
 *   of the owner's turn, then heat resets to 0.
 *
 * Hidden information:
 * - Loadout tiles start face-down (`isRevealed: false`). A tile flips face-up
 *   the first time it does something visible (fires, absorbs, scans, refunds,
 *   prevents heat damage) or when it is broken by a critical hit.
 * - Fixed systems are always revealed.
 * - Energy on a tile is public even while the tile is face-down: everyone can
 *   see how much a rival routes to each slot, not what the slot holds.
 */

export type SubsystemType =
  | "engines"
  | "rotation"
  | "scoop"
  | "laser"
  | "railgun"
  | "missiles"
  | "shields"
  | "radiator"
  | "fuel_compressor"
  | "sensor_array"
  | "ballistic_rack";

export type WeaponType = "laser" | "railgun" | "missiles" | "ballistic_rack";

/** Stable identifier: "engines" | "rotation" | "scoop" | "forward-0" | "side-0".."side-3". */
export type SubsystemId = string;

export type SlotGroup = "forward" | "side";

/**
 * Slot types for the loadout system
 * - fixed: always present (engines, rotation, scoop)
 * - forward / side: restricted to that slot group
 * - either: forward or side
 */
export type SlotType = "fixed" | SlotGroup | "either";

export const FIXED_SUBSYSTEM_TYPES: readonly SubsystemType[] = ["engines", "rotation", "scoop"];

export const FORWARD_SLOT_COUNT = 1;
export const SIDE_SLOT_COUNT = 4;

export function slotSubsystemId(group: SlotGroup, index: number): SubsystemId {
  return `${group}-${index}`;
}

/** All slot ids on a ship, forward first, in a fixed order. */
export const SLOT_IDS: readonly SubsystemId[] = [
  ...Array.from({ length: FORWARD_SLOT_COUNT }, (_, i) => slotSubsystemId("forward", i)),
  ...Array.from({ length: SIDE_SLOT_COUNT }, (_, i) => slotSubsystemId("side", i)),
];

/** Every subsystem id a ship can have (fixed systems + slots). */
export const ALL_SUBSYSTEM_IDS: readonly SubsystemId[] = [...FIXED_SUBSYSTEM_TYPES, ...SLOT_IDS];

export interface WeaponStats {
  damage: number;
  ringRange: number; // How many rings away can be targeted (±ringRange)
  sectorRange: number; // ±sectors covered (spinal: sectors ahead)
  arc: "spinal" | "broadside" | "turret";
  hasRecoil?: boolean; // Railgun: pushes the ship one ring unless compensated
  sideRestricted?: boolean; // Broadside weapons on a side only fire toward that side
  canTargetSameRing?: boolean; // Broadside weapons that also cover the same ring
  ignoresShields?: boolean; // Laser: shields are electromagnetic and deflect only physical projectiles
  maxAmmo?: number; // Ammunition-based weapons
  fuelPerTurn?: number; // Guided projectiles: steps per move
  maxMoves?: number; // Guided projectiles: moves before expiry
}

/** Passive bonuses that need no energy. */
export interface PassiveEffect {
  dissipationBonus?: number;
  reactionMassBonus?: number;
  criticalChanceBonus?: number; // percentage points, only while powered
  refuelOnWellTransfer?: boolean;
}

export interface SubsystemConfig {
  id: SubsystemType;
  name: string;
  minEnergy: number; // Minimum energy to function (0 for passive)
  maxEnergy: number;
  generatesHeatOnUse: boolean;
  slotType: SlotType;
  /** How many of this tile a player's set contains (default 1). */
  maxPerShip?: number;
  isPassive?: boolean;
  passiveEffect?: PassiveEffect;
  weaponStats?: WeaponStats;
}

export interface Subsystem {
  id: SubsystemId;
  type: SubsystemType;
  allocatedEnergy: number;
  isPowered: boolean;
  usedThisTurn: boolean;
  isBroken: boolean;
  /** Face-up for everyone at the table. Fixed systems start revealed. */
  isRevealed: boolean;
  ammo?: number;
  slotGroup?: SlotGroup;
  slotIndex?: number;
}

export interface ReactorState {
  totalCapacity: number;
  availableEnergy: number;
}

export interface HeatState {
  currentHeat: number;
}

export const SUBSYSTEM_CONFIGS: Record<SubsystemType, SubsystemConfig> = {
  engines: {
    id: "engines",
    name: "Engines",
    minEnergy: 1,
    maxEnergy: 3,
    generatesHeatOnUse: true,
    slotType: "fixed",
  },
  rotation: {
    id: "rotation",
    name: "Maneuvering Thrusters",
    minEnergy: 1,
    maxEnergy: 1,
    generatesHeatOnUse: true,
    slotType: "fixed",
  },
  scoop: {
    id: "scoop",
    name: "Fuel Scoop",
    minEnergy: 3,
    maxEnergy: 3,
    generatesHeatOnUse: true,
    slotType: "fixed",
  },

  railgun: {
    id: "railgun",
    name: "Railgun",
    minEnergy: 4,
    maxEnergy: 4,
    generatesHeatOnUse: true,
    slotType: "forward",
    weaponStats: {
      damage: 4,
      ringRange: 0,
      sectorRange: 5,
      arc: "spinal",
      hasRecoil: true,
    },
  },
  sensor_array: {
    id: "sensor_array",
    name: "Sensor Array",
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true, // scanning generates heat
    slotType: "forward",
    passiveEffect: { criticalChanceBonus: 20 },
  },

  laser: {
    id: "laser",
    name: "Broadside Laser",
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true,
    slotType: "side",
    maxPerShip: 2,
    weaponStats: {
      damage: 2,
      ringRange: 2,
      sectorRange: 1,
      arc: "broadside",
      sideRestricted: true,
      ignoresShields: true,
    },
  },
  shields: {
    id: "shields",
    name: "Shields",
    minEnergy: 1,
    maxEnergy: 4,
    generatesHeatOnUse: false,
    slotType: "side",
  },
  radiator: {
    id: "radiator",
    name: "Radiator",
    minEnergy: 0,
    maxEnergy: 0,
    generatesHeatOnUse: false,
    slotType: "side",
    isPassive: true,
    passiveEffect: { dissipationBonus: 2 },
  },
  fuel_compressor: {
    id: "fuel_compressor",
    name: "Fuel Compressor",
    minEnergy: 0,
    maxEnergy: 0,
    generatesHeatOnUse: false,
    slotType: "side",
    isPassive: true,
    passiveEffect: { reactionMassBonus: 6, refuelOnWellTransfer: true },
  },

  missiles: {
    id: "missiles",
    name: "Missiles",
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true,
    slotType: "either",
    weaponStats: {
      damage: 2,
      ringRange: 2,
      sectorRange: 3,
      arc: "turret",
      maxAmmo: 4,
      fuelPerTurn: 3,
      maxMoves: 3,
    },
  },

  ballistic_rack: {
    id: "ballistic_rack",
    name: "Ballistic Rack",
    minEnergy: 2,
    maxEnergy: 2,
    generatesHeatOnUse: true,
    slotType: "side",
    weaponStats: {
      damage: 1,
      ringRange: 1,
      sectorRange: 1,
      arc: "broadside",
      sideRestricted: false,
      canTargetSameRing: true,
    },
  },
};

export function getSubsystemConfig(type: SubsystemType): SubsystemConfig {
  return SUBSYSTEM_CONFIGS[type];
}

/** Tiles of this type in one player's set. */
export function getMaxPerShip(type: SubsystemType): number {
  return SUBSYSTEM_CONFIGS[type].maxPerShip ?? 1;
}

export function isWeaponType(type: SubsystemType): type is WeaponType {
  return SUBSYSTEM_CONFIGS[type].weaponStats !== undefined;
}

export function canSubsystemFunction(subsystem: Subsystem): boolean {
  if (subsystem.isBroken) return false;
  return subsystem.allocatedEnergy >= SUBSYSTEM_CONFIGS[subsystem.type].minEnergy;
}

export function getMissileStats(): Required<
  Pick<WeaponStats, "damage" | "maxAmmo" | "fuelPerTurn" | "maxMoves">
> {
  const stats = SUBSYSTEM_CONFIGS.missiles.weaponStats!;
  return {
    damage: stats.damage,
    maxAmmo: stats.maxAmmo!,
    fuelPerTurn: stats.fuelPerTurn!,
    maxMoves: stats.maxMoves!,
  };
}
