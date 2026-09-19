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
 *   the first time it does something visible (fires, absorbs, scans, discounts,
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

/**
 * Slots no critical may name, and since a critical is the only thing that
 * breaks a tile, slots that cannot break at all.
 *
 * The fuel scoop is the way home. Broken tiles are only repaired at a station,
 * a dry ship cannot burn or jump, and a coast moves it along the ring it is
 * already on — so a critical on the scoop of a ship with an empty tank, away
 * from a planet's station ring, takes that player out of the game with no move
 * that leads back. Every other tile a critical can break costs a capability;
 * this one costs the rest of the evening.
 */
export const CRITICAL_PROOF_IDS: readonly SubsystemId[] = ["scoop"];

export function isCriticalTarget(id: SubsystemId): boolean {
  return !CRITICAL_PROOF_IDS.includes(id);
}

/**
 * Energy a shield spends per point of damage it absorbs — the same two as the
 * heat (SHIELD_HEAT_PER_POINT), so a point costs two cubes and two heat.
 *
 * At one cube a point a shield tile soaked its cubes every round for free,
 * which made every 2-damage weapon — missiles, the rack, and the railgun
 * against two tiles — permanently unable to reach a hull: 66% of the shots a
 * bot declined to take at a Destroy target were declined because they would
 * have been absorbed whole. The cubes are not destroyed: they return to the
 * reactor and the tile goes dark until it is re-powered.
 */
export const SHIELD_ENERGY_PER_POINT = 2;

export interface WeaponStats {
  damage: number;
  ringRange?: number; // How many rings away can be targeted (±ringRange); a turret has no box
  sectorRange?: number; // ±sectors covered (spinal: sectors ahead); a turret has no box
  arc: "spinal" | "broadside" | "turret";
  hasRecoil?: boolean; // Railgun: pushes the ship one ring unless compensated
  sideRestricted?: boolean; // Broadside weapons on a side only fire toward that side
  canTargetSameRing?: boolean; // Broadside weapons that also cover the same ring
  ignoresShields?: boolean; // Laser: shields are electromagnetic and deflect only physical projectiles
  maxAmmo?: number; // Ammunition-based weapons
  fuelPerTurn?: number; // Guided projectiles: steps per move
  maxMoves?: number; // Guided projectiles: moves before expiry
  /**
   * How a salvo is charged heat. False is the rule (RULES §Weapons): a salvo
   * is one use of the missiles tile, charged its cubes once however many
   * rounds leave the rail. True is the experiment channel — cubes per missile
   * — and on 200-game rows it changed nothing but how missiles felt, because
   * launches per game were identical: the magazine is the limit, not the heat.
   */
  heatPerMissile?: boolean;
  /**
   * How point defence is charged heat. False is the rule (RULES §Weapons): a
   * turn of interceptions is one use of the rack, charged its cubes once
   * however many missiles it rolls at. True is the experiment channel — cubes
   * per roll — and on the same rows it only made the rack feel dearer without
   * moving what either side launched, so the plain rule stands.
   */
  heatPerIntercept?: boolean;
}

/** Passive bonuses that need no energy. */
export interface PassiveEffect {
  dissipationBonus?: number;
  criticalChanceBonus?: number; // percentage points, only while powered
  refuelOnWellTransfer?: boolean;
}

export interface SubsystemConfig {
  id: SubsystemType;
  name: string;
  minEnergy: number; // Minimum energy to function (0 for passive)
  maxEnergy: number;
  /**
   * Cubes this tile takes at a time; an allocation must be a multiple of it.
   * Omitted means one, which is every tile but the shields — they buy
   * absorption in whole points at SHIELD_ENERGY_PER_POINT cubes each.
   */
  energyStep?: number;
  generatesHeatOnUse: boolean;
  slotType: SlotType;
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
    /**
     * Two cubes or four, never one or three: a tile buys absorption in whole
     * points at SHIELD_ENERGY_PER_POINT cubes each, so an odd cube would sit
     * on a promise the rules do not keep. Four is most of a reactor for a
     * single tile — two tiles at full wall are eight of ten cubes and eight
     * heat if they absorb — which is what makes powering them a decision each
     * turn rather than a setting.
     */
    minEnergy: SHIELD_ENERGY_PER_POINT,
    maxEnergy: 2 * SHIELD_ENERGY_PER_POINT,
    energyStep: SHIELD_ENERGY_PER_POINT,
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
    slotType: "forward",
    isPassive: true,
    passiveEffect: { refuelOnWellTransfer: true },
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
      // No ringRange or sectorRange: a guided missile is launched at anyone in
      // the well and its own flight (fuelPerTurn x maxMoves) is its range.
      arc: "turret",
      maxAmmo: 4,
      fuelPerTurn: 3,
      maxMoves: 3,
      // The rule: a salvo is one use of the tile, its cubes once however many
      // rounds leave the rail. True is the experiment channel (cubes per
      // missile) for the simulator, never a knob on a game.
      heatPerMissile: false,
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
      damage: 2,
      ringRange: 1,
      sectorRange: 1,
      arc: "broadside",
      sideRestricted: false,
      canTargetSameRing: true,
      // The rule: a turn of interceptions is one use of the rack, its cubes
      // once however many missiles it rolls at. True is the experiment channel
      // (cubes per roll) for the simulator, never a knob on a game.
      heatPerIntercept: false,
    },
  },
};

/** Cubes a tile takes at a time: allocations must be a multiple of this. */
export function energyStepOf(type: SubsystemType): number {
  return SUBSYSTEM_CONFIGS[type].energyStep ?? 1;
}

export function getSubsystemConfig(type: SubsystemType): SubsystemConfig {
  return SUBSYSTEM_CONFIGS[type];
}

export function isWeaponType(type: SubsystemType): type is WeaponType {
  return SUBSYSTEM_CONFIGS[type].weaponStats !== undefined;
}

/**
 * Every tile that can shoot, derived from the configs so a new weapon joins
 * the list by existing. This is what "a weapon" means wherever the rules ask
 * for one (a kept Destroy card, `MISSION_REQUIREMENTS`).
 */
export const WEAPON_SUBSYSTEM_TYPES: readonly WeaponType[] = (
  Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]
).filter(isWeaponType);

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
