import type { ShipState } from "../models/game";
import type { Subsystem, SubsystemType } from "../models/subsystems";

/**
 * Pure function to allocate energy to a subsystem by index
 * Returns new ship state with updated reactor and subsystem
 * Use this for ships with multiple subsystems of the same type
 */
export function allocateEnergyByIndex(
  ship: ShipState,
  subsystemIndex: number,
  amount: number
): ShipState {
  if (subsystemIndex < 0 || subsystemIndex >= ship.subsystems.length) {
    return ship;
  }

  const subsystem = ship.subsystems[subsystemIndex];

  // Can't allocate energy to broken subsystems
  if (subsystem.isBroken) {
    return ship;
  }

  // Can't allocate more than available
  if (amount > ship.reactor.availableEnergy) {
    return ship;
  }

  const oldAllocation = subsystem.allocatedEnergy;
  const difference = amount - oldAllocation;

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.availableEnergy - difference,
    },
    subsystems: ship.subsystems.map((s, i) =>
      i === subsystemIndex
        ? {
            ...s,
            allocatedEnergy: amount,
            isPowered: amount > 0,
          }
        : s
    ),
  };
}


/**
 * Pure function to deallocate energy from a subsystem by index (immediate, unlimited)
 * Returns new ship state with energy returned to reactor
 * Use this for ships with multiple subsystems of the same type
 */
export function deallocateEnergyByIndex(
  ship: ShipState,
  subsystemIndex: number,
  amount: number
): ShipState {
  if (subsystemIndex < 0 || subsystemIndex >= ship.subsystems.length) {
    return ship;
  }

  const subsystem = ship.subsystems[subsystemIndex];
  const actualAmount = Math.min(amount, subsystem.allocatedEnergy);
  const newAllocatedEnergy = subsystem.allocatedEnergy - actualAmount;

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: Math.min(
        ship.reactor.totalCapacity,
        ship.reactor.availableEnergy + actualAmount
      ),
    },
    subsystems: ship.subsystems.map((s, i) =>
      i === subsystemIndex
        ? {
            ...s,
            allocatedEnergy: newAllocatedEnergy,
            isPowered: newAllocatedEnergy > 0,
          }
        : s
    ),
  };
}


/**
 * Validates if energy can be allocated to a subsystem by index
 */
export function canAllocateEnergyByIndex(
  ship: ShipState,
  subsystemIndex: number,
  amount: number
): { valid: boolean; reason?: string } {
  if (subsystemIndex < 0 || subsystemIndex >= ship.subsystems.length) {
    return { valid: false, reason: "Invalid subsystem index" };
  }

  const subsystem = ship.subsystems[subsystemIndex];

  // Can't allocate energy to broken subsystems
  if (subsystem.isBroken) {
    return {
      valid: false,
      reason: "Subsystem is broken and cannot receive energy",
    };
  }

  const difference = amount - subsystem.allocatedEnergy;

  if (difference > ship.reactor.availableEnergy) {
    return {
      valid: false,
      reason: `Not enough available energy. Need ${difference}, have ${ship.reactor.availableEnergy}`,
    };
  }

  return { valid: true };
}


/**
 * Gets a subsystem by type
 */
export function getSubsystem(
  subsystems: Subsystem[],
  type: SubsystemType
): Subsystem | undefined {
  return subsystems.find((s) => s.type === type);
}

/**
 * Resets all subsystem usage flags
 * Called at the start of each turn
 */
export function resetSubsystemUsage(subsystems: Subsystem[]): Subsystem[] {
  return subsystems.map((s) => ({
    ...s,
    usedThisTurn: false,
  }));
}

/**
 * Marks a subsystem as used this turn
 */
export function markSubsystemUsed(
  ship: ShipState,
  type: SubsystemType
): ShipState {
  return {
    ...ship,
    subsystems: ship.subsystems.map((s) =>
      s.type === type ? { ...s, usedThisTurn: true } : s
    ),
  };
}
