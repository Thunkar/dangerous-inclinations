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
 * Pure function to allocate energy to a subsystem by type
 * Returns new ship state with updated reactor and subsystem
 * WARNING: Only use when there's at most one subsystem of each type
 * For ships with duplicate subsystem types, use allocateEnergyByIndex
 */
export function allocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): ShipState {
  const subsystemIndex = ship.subsystems.findIndex(
    (s) => s.type === subsystemType
  );
  if (subsystemIndex === -1) {
    return ship;
  }
  return allocateEnergyByIndex(ship, subsystemIndex, amount);
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
 * Pure function to deallocate energy from a subsystem by type (immediate, unlimited)
 * Returns new ship state with energy returned to reactor
 * WARNING: Only use when there's at most one subsystem of each type
 * For ships with duplicate subsystem types, use deallocateEnergyByIndex
 */
export function deallocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): ShipState {
  const subsystemIndex = ship.subsystems.findIndex(
    (s) => s.type === subsystemType
  );
  if (subsystemIndex === -1) {
    return ship;
  }
  return deallocateEnergyByIndex(ship, subsystemIndex, amount);
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
 * Validates if energy can be allocated to a subsystem by type
 * WARNING: Only use when there's at most one subsystem of each type
 */
export function canAllocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): { valid: boolean; reason?: string } {
  const subsystemIndex = ship.subsystems.findIndex(
    (s) => s.type === subsystemType
  );
  if (subsystemIndex === -1) {
    return { valid: false, reason: "Subsystem not found" };
  }
  return canAllocateEnergyByIndex(ship, subsystemIndex, amount);
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
