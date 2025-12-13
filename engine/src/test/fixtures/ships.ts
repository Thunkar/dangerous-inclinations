import type { ShipState } from "../../models/game";
import { createInitialShipState } from "../../utils/subsystemHelpers";

/**
 * Creates a basic ship for testing with minimal configuration.
 * Uses the standard createInitialShipState helper for consistent defaults.
 */
export function createTestShip(overrides: Partial<ShipState> = {}): ShipState {
  return createInitialShipState(
    {
      wellId: "blackhole",
      ring: 3,
      sector: 0,
      facing: "prograde",
    },
    overrides,
  );
}

/**
 * Creates a ship with engines powered and ready to burn
 */
export function createShipWithEngines(energyAmount: number = 3): ShipState {
  const ship = createTestShip({ reactionMass: 10 });

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - energyAmount,
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === "engines"
        ? { ...s, isPowered: true, allocatedEnergy: energyAmount }
        : s,
    ),
  };
}

/**
 * Creates a ship with rotation powered
 */
export function createShipWithRotation(): ShipState {
  const ship = createTestShip();

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - 1,
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === "rotation" ? { ...s, isPowered: true, allocatedEnergy: 1 } : s,
    ),
  };
}

/**
 * Creates a ship with a transfer state (for testing transfer completion)
 * Note: All transfers complete immediately in actual gameplay
 */
export function createShipInTransfer(
  destinationRing: number,
  sectorAdjustment: number = 0,
): ShipState {
  return createTestShip({
    ring: 3,
    sector: 0,
    transferState: {
      destinationRing,
      sectorAdjustment,
    },
  });
}

/**
 * Creates a ship with weapons powered
 */
export function createShipWithWeapons(
  weaponType: "laser" | "railgun" | "missiles",
  energyAmount: number = 4,
): ShipState {
  const ship = createTestShip();

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - energyAmount,
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === weaponType
        ? { ...s, isPowered: true, allocatedEnergy: energyAmount }
        : s,
    ),
  };
}

/**
 * Creates a ship with heat accumulated
 */
export function createShipWithHeat(currentHeat: number): ShipState {
  return createTestShip({
    heat: {
      currentHeat,
    },
  });
}

/**
 * Creates a ship with shields powered
 */
export function createShipWithShields(energyAmount: number = 2): ShipState {
  const ship = createTestShip();

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - energyAmount,
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === "shields"
        ? { ...s, isPowered: true, allocatedEnergy: energyAmount }
        : s,
    ),
  };
}
