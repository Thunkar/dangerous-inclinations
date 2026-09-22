/**
 * Subsystems: the tiles a ship carries.
 *
 * A ship always has three fixed systems (engines, thrusters, scoop) plus one
 * forward slot and four side slots chosen at loadout. Every subsystem has a
 * stable id derived from its slot ("engines", "forward-0", "side-2"), and all
 * actions refer to subsystems by that id.
 *
 * Energy and heat, which are one rule:
 * - **A tile's cubes are heat at its owner's heat check.** That is all of it.
 * - Nobody places cubes. A tile that acts is powered by the action that uses
 *   it, to exactly the draw that action needs, and goes dark at the end of the
 *   turn: it is still carrying them when the check runs, so acting costs its
 *   cubes and nothing else does.
 * - The exceptions are the tiles that work while their owner is not acting:
 *   shields absorb, a ballistic rack intercepts and a sensor array widens the
 *   critical range. Those are switched on and stay on until switched off
 *   (`STANDING_SUBSYSTEM_TYPES`), so they are carrying cubes at every check
 *   and pay at every one. That is what prices holding a wall, a point-defence
 *   turret or a firing solution up between turns.
 * - There is no reactor limit. Heat is the only limit: a ship may light
 *   everything it owns at once and take the hull damage for it.
 * - Heat is a track that does not reset: at the owner's heat check anything
 *   over the redline is hull damage, and what survives the dissipation is
 *   carried into the next turn.
 *
 * Hidden information:
 * - Loadout tiles start face-down (`isRevealed: false`). A tile flips face-up
 *   the first time it does something visible (fires, absorbs, scans, discounts,
 *   prevents heat damage) or when it is broken by a critical hit.
 * - Fixed systems are always revealed.
 * - Energy on a tile is public even while the tile is face-down, and because
 *   only a standing tile carries cubes between turns, cubes sitting on a
 *   face-down slot say which of the three it is: a loaded forward slot can
 *   only be a sensor array, and a side slot at 4 can only be a full shield.
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

/**
 * Slots no critical may name, and since a critical is the only thing that
 * breaks a tile, slots that cannot break at all.
 *
 * The fuel scoop is the way home. Broken tiles are only repaired at a station,
 * a dry ship cannot burn or jump, and a coast moves it along the ring it is
 * already on, so a critical on the scoop of a ship with an empty tank, away
 * from a planet's station ring, takes that player out of the game with no move
 * that leads back. Every other tile a critical can break costs a capability;
 * this one costs the rest of the evening.
 */
export const CRITICAL_PROOF_IDS: readonly SubsystemId[] = ["scoop"];

export function isCriticalTarget(id: SubsystemId): boolean {
  return !CRITICAL_PROOF_IDS.includes(id);
}

/**
 * The tiles a player switches on rather than a tile an action powers.
 *
 * Every other tile is powered by the action that uses it and is dark the rest
 * of the time, because it only does anything at the moment it is used: there
 * was never a decision in placing its cubes, only one legal number and the
 * chance of getting it wrong. These three work while their owner is not
 * acting, so their cubes have to be on the board before the thing they answer
 * happens: shields absorb a shot fired on somebody else's turn, a rack
 * intercepts a missile arriving on somebody else's turn, and a sensor array
 * widens the critical range of every weapon aboard while it is up.
 */
export const STANDING_SUBSYSTEM_TYPES: readonly SubsystemType[] = [
  "shields",
  "ballistic_rack",
  "sensor_array",
];

/** True for a tile its owner switches on, false for one an action powers. */
export function isStandingType(type: SubsystemType): boolean {
  return STANDING_SUBSYSTEM_TYPES.includes(type);
}


/**
 * Energy a shield spends per point of damage it absorbs: the same two as the
 * heat (SHIELD_HEAT_PER_POINT), so a point costs two cubes and two heat.
 *
 * At one cube a point a shield tile soaked its cubes every round for free,
 * which made every 2-damage weapon (missiles, the rack, and the railgun
 * against two tiles) permanently unable to reach a hull: 66% of the shots a
 * bot declined to take at a Destroy target were declined because they would
 * have been absorbed whole. The cubes are not destroyed: they return to the
 * cubes are spent and the tile goes dark until it is switched on again.
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
   * Omitted means one, which is every tile but the shields. They buy
   * absorption in whole points at SHIELD_ENERGY_PER_POINT cubes each.
   */
  energyStep?: number;
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
  /**
   * True when the owner switched this tile on and means to leave it on. False
   * when an action powered it for its own use, which is every other tile and
   * also a standing one that fired or scanned while it was dark: those cubes
   * come off at the end of the turn (`clearDerivedPower`), so nobody is billed
   * at every check for a rack they fired once.
   */
  isStanding: boolean;
  usedThisTurn: boolean;
  /**
   * Interception rolls a ballistic rack has made this player-turn. A rack's
   * two cubes answer as many missiles as two cubes can throw
   * ({@link INTERCEPTS_PER_RACK}) and no more; 0 on every other tile.
   */
  rollsThisTurn: number;
  isBroken: boolean;
  /** Face-up for everyone at the table. Fixed systems start revealed. */
  isRevealed: boolean;
  ammo?: number;
  slotGroup?: SlotGroup;
  slotIndex?: number;
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
    slotType: "fixed",
  },
  rotation: {
    id: "rotation",
    name: "Maneuvering Thrusters",
    minEnergy: 1,
    maxEnergy: 1,
    slotType: "fixed",
  },
  scoop: {
    id: "scoop",
    name: "Fuel Scoop",
    minEnergy: 3,
    maxEnergy: 3,
    slotType: "fixed",
  },

  railgun: {
    id: "railgun",
    name: "Railgun",
    minEnergy: 4,
    maxEnergy: 4,
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
    slotType: "forward",
    passiveEffect: { criticalChanceBonus: 20 },
  },

  laser: {
    id: "laser",
    name: "Broadside Laser",
    minEnergy: 2,
    maxEnergy: 2,
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
     * on a promise the rules do not keep. Four cubes is four heat at every
     * check the tile is up, and two tiles at a full wall is eight against a
     * dissipation of five, which is what makes a wall a decision each turn
     * rather than a setting.
     */
    minEnergy: SHIELD_ENERGY_PER_POINT,
    maxEnergy: 2 * SHIELD_ENERGY_PER_POINT,
    energyStep: SHIELD_ENERGY_PER_POINT,
    slotType: "side",
  },
  radiator: {
    id: "radiator",
    name: "Radiator",
    minEnergy: 0,
    maxEnergy: 0,
    slotType: "side",
    isPassive: true,
    passiveEffect: { dissipationBonus: 2 },
  },
  fuel_compressor: {
    id: "fuel_compressor",
    name: "Fuel Compressor",
    minEnergy: 0,
    maxEnergy: 0,
    slotType: "forward",
    isPassive: true,
    passiveEffect: { refuelOnWellTransfer: true },
  },

  missiles: {
    id: "missiles",
    name: "Missiles",
    minEnergy: 2,
    maxEnergy: 2,
    slotType: "either",
    weaponStats: {
      damage: 2,
      // No ringRange or sectorRange: a guided missile is launched at anyone in
      // the well and its own flight (fuelPerTurn x maxMoves) is its range.
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
    slotType: "side",
    weaponStats: {
      damage: 2,
      ringRange: 1,
      sectorRange: 1,
      arc: "broadside",
      sideRestricted: false,
      canTargetSameRing: true,
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

/**
 * Missiles a rack's cubes can answer in one player-turn.
 *
 * It is the missiles tile's magazine, deliberately: two cubes on a launcher
 * throw four rounds in one action, so two cubes on a rack shoot four of them
 * down and the fifth gets through. Point defence that rolled at *every*
 * missile made one rack the answer to any number of launchers, which is the
 * same asymmetry the other way round.
 *
 * A ship that expects more than four at once carries a second rack, pays its
 * cubes in heat at every check like the first, and answers eight. Read off the
 * magazine so an experiment that changes one changes both.
 */
export function interceptsPerRack(): number {
  return SUBSYSTEM_CONFIGS.missiles.weaponStats!.maxAmmo!;
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
