/**
 * Subsystems: the tiles a ship carries.
 *
 * A ship always has three fixed systems (engines, thrusters, scoop) plus one
 * forward slot and four side slots chosen at loadout. Every subsystem has a
 * stable id derived from its slot ("engines", "forward-0", "side-2"), and all
 * actions refer to subsystems by that id.
 *
 * Energy and heat, which are one rule:
 * - **Every cube on the loadout is a point of heat at its owner's check.**
 *   That is all of it.
 * - Every action puts energy on the tile it uses, to exactly the draw that
 *   action needs. Nobody places cubes for an action.
 * - Powering is an action too, for the three tiles that work on other
 *   players' turns (`POWERABLE_TYPES`): shields (1 or 2), a ballistic rack (2)
 *   and a sensor array (2). A tile with energy on it works until its owner's
 *   next turn: shields absorb, a rack shoots down missiles, a sensor widens the
 *   critical range. So a rack that fired is also up, and a sensor that scanned
 *   widens the range of every shot taken after the scan.
 * - Each tile does one thing a turn: it is powered or it is used.
 * - The energy stays on the tile until the start of its owner's next turn,
 *   when the loadout is cleared. Nothing is ever switched off: a tile is off
 *   unless something put energy on it this turn, so a wall, a rack or a sensor
 *   held up turn after turn is powered, and paid for, turn after turn.
 * - There is no reactor limit. Heat is the only limit: a ship may light
 *   everything it owns at once and take the hull damage for it.
 * - Heat is a track that does not reset: at the owner's heat check anything
 *   over the redline is hull damage, and what survives the dissipation is
 *   carried into the next turn.
 *
 * Hidden information:
 * - Loadout tiles start face-down (`isRevealed: false`). A tile flips face-up
 *   the first time it does something visible (fires, intercepts, absorbs,
 *   scans, discounts a jump, or, for a radiator, sheds heat: heat above the
 *   base dissipation at a check) or when it is broken by a critical hit. Powering a
 *   tile is not using it and reveals nothing.
 * - Fixed systems are always revealed.
 * - Energy on a tile is public even while the tile is face-down. Using a tile
 *   turns it face-up, so a face-down slot carrying cubes between turns was
 *   powered, and the cubes say which of three it can be: 1 is only a half
 *   shield, and 2 a full shield, a rack or a sensor.
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
  | "ballistic_rack"
  | "plasma_cannon"
  | "disruptor";

export type WeaponType =
  | "laser"
  | "railgun"
  | "missiles"
  | "ballistic_rack"
  | "plasma_cannon"
  | "disruptor";

/** Stable identifier: "engines" | "rotation" | "scoop" | "forward-0" | "side-0".."side-3". */
export type SubsystemId = string;

export type SlotGroup = "forward" | "side";

/**
 * Slot types for the loadout system
 * - fixed: always present (engines, rotation, scoop)
 * - forward / side: restricted to that slot group
 * - either: forward or side
 */
type SlotType = "fixed" | SlotGroup | "either";

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
 * The tiles a `power` action may put energy on.
 *
 * Every other tile only does anything at the moment an action uses it, and
 * that action powers it. These three work on other players' turns, so their
 * cubes have to be on the board before the thing they answer happens: shields
 * absorb a shot fired on somebody else's turn, a rack intercepts a missile
 * arriving on somebody else's turn, and a sensor array widens the critical
 * range of every shot taken after it is up. A rack that fires and a sensor
 * that scans are up anyway, since the action left its cubes on the tile.
 */
export const POWERABLE_TYPES: readonly SubsystemType[] = [
  "shields",
  "ballistic_rack",
  "sensor_array",
];

/** True for a tile a `power` action may put energy on. */
export function isPowerableType(type: SubsystemType): boolean {
  return POWERABLE_TYPES.includes(type);
}

/**
 * Damage a shield's energy absorbs, a point a cube, unless the weapon names its
 * own rate (`shieldPointsPerEnergy`). The cubes that absorb come off the
 * subsystem, and every point absorbed is a point of heat on its owner's track,
 * paid at their next check: the shot's energy goes somewhere.
 *
 * It was two cubes a point with the absorbing free (1 Oct 2026), and before
 * that two cubes a point with the absorbing hot. A point a cube with nothing
 * but the cubes to pay was the first shape, and it made every 2-damage weapon
 * unable to reach a hull: 66% of the shots a bot declined at a Destroy target
 * were declined as absorbed whole. The heat is what prices the wall now.
 */
export const SHIELD_POINTS_PER_ENERGY = 1;

export interface WeaponStats {
  damage: number;
  ringRange?: number; // How many rings away can be targeted (±ringRange); a turret has no box
  sectorRange?: number; // ±sectors covered (spinal: sectors ahead); a turret has no box
  arc: "spinal" | "broadside" | "turret";
  hasRecoil?: boolean; // Railgun: pushes the ship one ring unless compensated
  sideRestricted?: boolean; // Broadside weapons on a side only fire toward that side
  canTargetSameRing?: boolean; // Broadside weapons that also cover the same ring
  ignoresShields?: boolean; // Laser: shields are electromagnetic and deflect only physical projectiles
  /**
   * Points of this weapon's damage a shield cube absorbs. Omitted means
   * SHIELD_POINTS_PER_ENERGY; a screen soaks plasma at two a cube.
   */
  shieldPointsPerEnergy?: number;
  /**
   * Disruptor: deals no damage and never criticals; a hit breaks the named
   * slot unless any powered shield is up, which blocks the shot whole.
   */
  disrupts?: boolean;
  maxAmmo?: number; // Ammunition-based weapons
  stepsPerMove?: number; // Guided projectiles: steps (a ring or a sector) per move; missiles burn no fuel
  maxMoves?: number; // Guided projectiles: moves before expiry
}

/** Passive bonuses that need no energy: the tile works while it is aboard and unbroken. */
export interface PassiveEffect {
  dissipationBonus?: number;
  /** A jump costs COMPRESSED_JUMP_MASS fuel instead of the lane's full price. */
  cheapensJump?: boolean;
}

export interface SubsystemConfig {
  id: SubsystemType;
  name: string;
  minEnergy: number; // Minimum energy to function (0 for passive)
  maxEnergy: number;
  slotType: SlotType;
  isPassive?: boolean;
  passiveEffect?: PassiveEffect;
  /** Sensor array: while it has energy on it, its owner's shots crit on this d10 face or higher. */
  criticalFace?: number;
  weaponStats?: WeaponStats;
}

export interface Subsystem {
  id: SubsystemId;
  type: SubsystemType;
  allocatedEnergy: number;
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
    criticalFace: 8,
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
     * One cube or two, a point each. A cube is heat at every check the
     * subsystem is up, and every point it absorbs is heat again, so a wall
     * that is hit is paid for twice: once to hold it and once for the shot.
     * Measured 4 Oct 2026 against two cubes a point with free absorbing:
     * walls are held more (powered 39 -> 42% of turns) for less (1.46 -> 0.90
     * cubes), soak more (21 -> 26% of damage), and heat at the check falls
     * (5.4 -> 4.7), because the absorbed heat is small beside dissipation.
     */
    minEnergy: 1,
    maxEnergy: 2,
    /**
     * Forward or side. A screen does not care which way the ship points, and
     * the bow needs more than one tile that can be powered or a loaded
     * forward slot is a certain sensor array. Measured as a build it is never
     * the best bow and never a bad one, which is the profile of an option
     * worth having rather than a lever.
     */
    slotType: "either",
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
    passiveEffect: { cheapensJump: true },
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
      // the well and its own flight (stepsPerMove x maxMoves) is its range.
      arc: "turret",
      maxAmmo: 4,
      stepsPerMove: 3,
      maxMoves: 3,
    },
  },

  ballistic_rack: {
    id: "ballistic_rack",
    name: "Ballistic Rack",
    minEnergy: 2,
    maxEnergy: 2,
    /**
     * Side only, though its arc would not mind the bow: a rack forward makes a
     * hull with three cheap guns and a wall that nothing in the game preys on
     * (see the settled list in CLAUDE.md). The bow's expense is load-bearing.
     */
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

  plasma_cannon: {
    id: "plasma_cannon",
    name: "Plasma Cannon",
    /**
     * Four damage for three energy, at two points a cube against shields: a
     * full wall stops it whole (and takes four heat) and a half wall lets half
     * through. Even damage so
     * that a wall answers it exactly (measured 1 Oct 2026, three seats, 200
     * games a row: 3 damage for 1 energy read as a laser that walls stop, 2
     * damage was weaker than the laser at any cost, 4 for 2 put railgun +
     * plasma×2 nine points over its bar, 4 for 3 keeps every plasma row
     * within six of it).
     */
    minEnergy: 3,
    maxEnergy: 3,
    slotType: "side",
    weaponStats: {
      damage: 4,
      // The laser's box pulled in to the neighbouring rings: hard-hitting and
      // cheap, so it has to get close and cannot shoot along its own ring.
      ringRange: 1,
      sectorRange: 1,
      arc: "broadside",
      sideRestricted: true,
      // A screen soaks plasma at two points a cube, so a wall stops it
      // cheaply in cubes and pays for it in heat.
      shieldPointsPerEnergy: 2,
    },
  },

  disruptor: {
    id: "disruptor",
    name: "Disruptor",
    /**
     * An EMP burst in the ballistic rack's box: within 1 ring and 1 sector,
     * its own ring too, either side, facing irrelevant. Measured 1 Oct 2026,
     * 300 games a row, the rack box at 3 energy: every disruptor build within
     * 6 of its bar except sensor bow + shields×2 + radiator + disruptor
     * (Intercept, +8). At 2 energy disruptor + plasma×2 read +9 and railgun +
     * laser + rack + disruptor +8. The spinal disruptor (bow only, same ring,
     * 1-8 sectors ahead) with lasers×2 read 29% against a bar of 31, with the
     * box 33%.
     */
    minEnergy: 3,
    maxEnergy: 3,
    slotType: "either",
    weaponStats: {
      // No damage and no recoil: a hit breaks the slot the attacker names,
      // and any powered shield stops it.
      damage: 0,
      ringRange: 1,
      sectorRange: 1,
      arc: "broadside",
      canTargetSameRing: true,
      sideRestricted: false,
      disrupts: true,
    },
  },
};


export function getSubsystemConfig(type: SubsystemType): SubsystemConfig {
  return SUBSYSTEM_CONFIGS[type];
}

export function isWeaponType(type: SubsystemType): type is WeaponType {
  return SUBSYSTEM_CONFIGS[type].weaponStats !== undefined;
}

/**
 * Every tile that can shoot, derived from the configs so a new weapon joins
 * the list by existing. A Destroy card asks for more than this, a weapon that
 * deals damage ({@link DAMAGING_WEAPON_TYPES}).
 */
export const WEAPON_SUBSYSTEM_TYPES: readonly WeaponType[] = (
  Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]
).filter(isWeaponType);

/**
 * The weapons that take hull: every weapon but the disruptor. A Destroy card
 * needs one (`MISSION_REQUIREMENTS`), since a weapon that only breaks slots
 * can never finish a ship.
 */
export const DAMAGING_WEAPON_TYPES: readonly WeaponType[] = WEAPON_SUBSYSTEM_TYPES.filter(
  (t) => SUBSYSTEM_CONFIGS[t].weaponStats!.damage > 0
);

/** Points of this weapon's damage a shield cube absorbs. */
export function shieldPointsPerEnergyOf(stats: WeaponStats | undefined): number {
  return stats?.shieldPointsPerEnergy ?? SHIELD_POINTS_PER_ENERGY;
}

/**
 * Whether a tile has energy on it: an action put it there this turn, or on its
 * owner's last turn, and it works until its owner's next turn clears it.
 */
export function isPowered(subsystem: Pick<Subsystem, "allocatedEnergy">): boolean {
  return subsystem.allocatedEnergy > 0;
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
 * A ship that expects more than four at once carries a second rack, powers it
 * every turn like the first, and answers eight. Read off the
 * magazine so an experiment that changes one changes both.
 */
export function interceptsPerRack(): number {
  return SUBSYSTEM_CONFIGS.missiles.weaponStats!.maxAmmo!;
}

export function getMissileStats(): Required<
  Pick<WeaponStats, "damage" | "maxAmmo" | "stepsPerMove" | "maxMoves">
> {
  const stats = SUBSYSTEM_CONFIGS.missiles.weaponStats!;
  return {
    damage: stats.damage,
    maxAmmo: stats.maxAmmo!,
    stepsPerMove: stats.stepsPerMove!,
    maxMoves: stats.maxMoves!,
  };
}
