import type { ShipState } from '../../../types/game'
import type { Subsystem } from '../../../types/subsystems'

/**
 * Creates a basic ship for testing with minimal configuration
 */
export function createTestShip(overrides: Partial<ShipState> = {}): ShipState {
  const defaultSubsystems: Subsystem[] = [
    {
      type: 'engines',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'rotation',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'scoop',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'laser',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'railgun',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'missiles',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
    {
      type: 'shields',
      isPowered: false,
      allocatedEnergy: 0,
      usedThisTurn: false,
    },
  ]

  return {
    ring: 3,
    sector: 0,
    facing: 'prograde',
    reactionMass: 10,
    hitPoints: 10,
    maxHitPoints: 10,
    reactor: {
      totalCapacity: 10,
      availableEnergy: 10,
      maxReturnRate: 5,
      energyToReturn: 0,
    },
    heat: {
      currentHeat: 0,
      heatToVent: 0,
    },
    subsystems: defaultSubsystems,
    transferState: null,
    ...overrides,
  }
}

/**
 * Creates a ship with engines powered and ready to burn
 */
export function createShipWithEngines(energyAmount: number = 3): ShipState {
  const ship = createTestShip({ reactionMass: 10 })

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - energyAmount,
    },
    subsystems: ship.subsystems.map(s =>
      s.type === 'engines' ? { ...s, isPowered: true, allocatedEnergy: energyAmount } : s
    ),
  }
}

/**
 * Creates a ship with rotation powered
 */
export function createShipWithRotation(): ShipState {
  const ship = createTestShip()

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - 1,
    },
    subsystems: ship.subsystems.map(s =>
      s.type === 'rotation' ? { ...s, isPowered: true, allocatedEnergy: 1 } : s
    ),
  }
}

/**
 * Creates a ship in the middle of a transfer
 */
export function createShipInTransfer(
  destinationRing: number,
  sectorAdjustment: number = 0
): ShipState {
  return createTestShip({
    ring: 3,
    sector: 0,
    transferState: {
      destinationRing,
      sectorAdjustment,
      arriveNextTurn: true,
    },
  })
}

/**
 * Creates a ship with weapons powered
 */
export function createShipWithWeapons(
  weaponType: 'laser' | 'railgun' | 'missiles',
  energyAmount: number = 4
): ShipState {
  const ship = createTestShip()

  return {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: ship.reactor.totalCapacity - energyAmount,
    },
    subsystems: ship.subsystems.map(s =>
      s.type === weaponType ? { ...s, isPowered: true, allocatedEnergy: energyAmount } : s
    ),
  }
}

/**
 * Creates a ship with heat accumulated
 */
export function createShipWithHeat(currentHeat: number): ShipState {
  return createTestShip({
    heat: {
      currentHeat,
      heatToVent: 0,
    },
  })
}
