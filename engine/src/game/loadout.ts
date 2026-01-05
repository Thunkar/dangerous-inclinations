/**
 * Ship Loadout System
 *
 * Handles validation and creation of ship loadouts.
 * Ships have 2 forward slots and 4 side slots.
 * Fixed subsystems (engines, rotation) are always present and not part of loadout.
 */

import type { Subsystem, SubsystemType } from "../models/subsystems";
import {
  SUBSYSTEM_CONFIGS,
  getSubsystemConfig,
  getMissileStats,
} from "../models/subsystems";
import type { ShipLoadout, LoadoutValidation } from "../models/game";
import {
  DEFAULT_DISSIPATION_CAPACITY,
  STARTING_REACTION_MASS,
  BASE_CRITICAL_CHANCE,
} from "../models/game";

/**
 * Subsystems that can be installed in forward slots
 */
export const FORWARD_SLOT_SUBSYSTEMS: SubsystemType[] = Object.entries(
  SUBSYSTEM_CONFIGS
)
  .filter(([_, config]) => config.slotType === "forward")
  .map(([type]) => type as SubsystemType);

/**
 * Subsystems that can be installed in side slots
 */
export const SIDE_SLOT_SUBSYSTEMS: SubsystemType[] = Object.entries(
  SUBSYSTEM_CONFIGS
)
  .filter(([_, config]) => config.slotType === "side")
  .map(([type]) => type as SubsystemType);

/**
 * Subsystems that can be installed in either slot type
 */
export const EITHER_SLOT_SUBSYSTEMS: SubsystemType[] = Object.entries(
  SUBSYSTEM_CONFIGS
)
  .filter(([_, config]) => config.slotType === "either")
  .map(([type]) => type as SubsystemType);

/**
 * All installable subsystems (excludes fixed)
 */
export const INSTALLABLE_SUBSYSTEMS: SubsystemType[] = Object.entries(
  SUBSYSTEM_CONFIGS
)
  .filter(([_, config]) => config.slotType !== "fixed")
  .map(([type]) => type as SubsystemType);

/**
 * Check if a subsystem can be installed in a forward slot
 */
export function canInstallInForwardSlot(type: SubsystemType): boolean {
  const config = getSubsystemConfig(type);
  return config.slotType === "forward" || config.slotType === "either";
}

/**
 * Check if a subsystem can be installed in a side slot
 */
export function canInstallInSideSlot(type: SubsystemType): boolean {
  const config = getSubsystemConfig(type);
  return config.slotType === "side" || config.slotType === "either";
}

/**
 * Validate a ship loadout
 * Returns validation result with any errors
 */
export function validateLoadout(loadout: ShipLoadout): LoadoutValidation {
  const errors: string[] = [];

  // Validate forward slots
  for (let i = 0; i < loadout.forwardSlots.length; i++) {
    const subsystem = loadout.forwardSlots[i];
    if (subsystem !== null) {
      if (!canInstallInForwardSlot(subsystem)) {
        const config = getSubsystemConfig(subsystem);
        errors.push(
          `Forward slot ${i + 1}: ${config.name} cannot be installed in a forward slot`
        );
      }
    }
  }

  // Validate side slots
  for (let i = 0; i < loadout.sideSlots.length; i++) {
    const subsystem = loadout.sideSlots[i];
    if (subsystem !== null) {
      if (!canInstallInSideSlot(subsystem)) {
        const config = getSubsystemConfig(subsystem);
        errors.push(
          `Side slot ${i + 1}: ${config.name} cannot be installed in a side slot`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create subsystem instances from a loadout
 * Always includes fixed subsystems (engines, rotation) plus loadout subsystems
 */
export function createSubsystemsFromLoadout(loadout: ShipLoadout): Subsystem[] {
  const subsystems: Subsystem[] = [];

  // Always add fixed subsystems first
  subsystems.push(createSubsystemInstance("engines"));
  subsystems.push(createSubsystemInstance("rotation"));

  // Add forward slot subsystems
  for (const type of loadout.forwardSlots) {
    if (type !== null) {
      subsystems.push(createSubsystemInstance(type));
    }
  }

  // Add side slot subsystems
  for (const type of loadout.sideSlots) {
    if (type !== null) {
      subsystems.push(createSubsystemInstance(type));
    }
  }

  return subsystems;
}

/**
 * Create a single subsystem instance
 */
function createSubsystemInstance(type: SubsystemType): Subsystem {
  const subsystem: Subsystem = {
    type,
    allocatedEnergy: 0,
    isPowered: false,
    usedThisTurn: false,
  };

  // Add ammo for missiles
  if (type === "missiles") {
    subsystem.ammo = getMissileStats().maxAmmo;
  }

  return subsystem;
}

/**
 * Calculate ship stats from a loadout
 * Returns dissipation capacity, reaction mass, and critical chance
 */
export function calculateShipStatsFromLoadout(loadout: ShipLoadout): {
  dissipationCapacity: number;
  reactionMass: number;
  criticalChance: number;
} {
  let dissipationCapacity = DEFAULT_DISSIPATION_CAPACITY;
  let reactionMass = STARTING_REACTION_MASS;
  let criticalChance = BASE_CRITICAL_CHANCE;

  // Combine all loadout slots
  const allSlots = [...loadout.forwardSlots, ...loadout.sideSlots];

  for (const type of allSlots) {
    if (type === null) continue;

    const config = getSubsystemConfig(type);
    if (config.passiveEffect) {
      if (config.passiveEffect.dissipationBonus) {
        dissipationCapacity += config.passiveEffect.dissipationBonus;
      }
      if (config.passiveEffect.reactionMassBonus) {
        reactionMass += config.passiveEffect.reactionMassBonus;
      }
      // Note: criticalChanceBonus is only applied when sensor array is powered
      // So we don't add it here - it's handled during combat
    }
  }

  return {
    dissipationCapacity,
    reactionMass,
    criticalChance,
  };
}

/**
 * Check if a ship has a specific subsystem in its loadout
 * Fixed subsystems (engines, rotation) are always present
 */
export function hasSubsystemInLoadout(
  loadout: ShipLoadout,
  type: SubsystemType
): boolean {
  // Fixed subsystems are always present
  const config = getSubsystemConfig(type);
  if (config.slotType === "fixed") {
    return true;
  }

  const allSlots = [...loadout.forwardSlots, ...loadout.sideSlots];
  return allSlots.includes(type);
}

/**
 * Count how many of a specific subsystem are in a loadout
 */
export function countSubsystemInLoadout(
  loadout: ShipLoadout,
  type: SubsystemType
): number {
  const allSlots = [...loadout.forwardSlots, ...loadout.sideSlots];
  return allSlots.filter((t) => t === type).length;
}

/**
 * Get the effective critical chance for a ship
 * Base chance + sensor array bonus for each powered sensor array
 * Note: Critical chance values are in percentage points (10 = 10%, not 0.1)
 */
export function getEffectiveCriticalChance(
  baseCriticalChance: number,
  subsystems: Subsystem[]
): number {
  const sensorArrays = subsystems.filter((s) => s.type === "sensor_array");
  let totalBonus = 0;

  for (const sensorArray of sensorArrays) {
    if (sensorArray.isPowered && !sensorArray.isBroken) {
      const config = getSubsystemConfig("sensor_array");
      const bonus = config.passiveEffect?.criticalChanceBonus || 0;
      totalBonus += bonus;
    }
  }

  return baseCriticalChance + totalBonus;
}
