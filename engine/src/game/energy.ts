import type { ShipState } from "../models/game";
import type { Subsystem, SubsystemType } from "../models/subsystems";

/**
 * Pure function to allocate energy to a subsystem
 * Returns new ship state with updated reactor and subsystem
 */
export function allocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): ShipState {
  const subsystem = ship.subsystems.find((s) => s.type === subsystemType);
  if (!subsystem) {
    return ship;
  }

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
    subsystems: ship.subsystems.map((s) =>
      s.type === subsystemType
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
 * Pure function to deallocate energy from a subsystem (immediate, unlimited)
 * Returns new ship state with energy returned to reactor
 */
export function deallocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): ShipState {
  const subsystem = ship.subsystems.find((s) => s.type === subsystemType);
  if (!subsystem) {
    return ship;
  }

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
    subsystems: ship.subsystems.map((s) =>
      s.type === subsystemType
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
 * Validates if energy can be allocated to a subsystem
 */
export function canAllocateEnergy(
  ship: ShipState,
  subsystemType: SubsystemType,
  amount: number
): { valid: boolean; reason?: string } {
  const subsystem = ship.subsystems.find((s) => s.type === subsystemType);
  if (!subsystem) {
    return { valid: false, reason: "Subsystem not found" };
  }

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
