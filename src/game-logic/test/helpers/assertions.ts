import { expect } from 'vitest'
import type { ShipState } from '../../../types/game'
import type { Subsystem } from '../../../types/subsystems'

/**
 * Asserts that a ship is at a specific ring and sector
 */
export function assertShipPosition(ship: ShipState, ring: number, sector: number) {
  expect(ship.ring).toBe(ring)
  expect(ship.sector).toBe(sector)
}

/**
 * Asserts that a ship has a specific amount of reaction mass
 */
export function assertReactionMass(ship: ShipState, expected: number) {
  expect(ship.reactionMass).toBe(expected)
}

/**
 * Asserts that a ship has a specific facing
 */
export function assertFacing(ship: ShipState, facing: 'prograde' | 'retrograde') {
  expect(ship.facing).toBe(facing)
}

/**
 * Asserts that a ship is in a transfer state
 */
export function assertInTransfer(
  ship: ShipState,
  destinationRing: number,
  sectorAdjustment?: number
) {
  expect(ship.transferState).not.toBeNull()
  expect(ship.transferState?.destinationRing).toBe(destinationRing)
  if (sectorAdjustment !== undefined) {
    expect(ship.transferState?.sectorAdjustment).toBe(sectorAdjustment)
  }
}

/**
 * Asserts that a ship is NOT in a transfer state
 */
export function assertNotInTransfer(ship: ShipState) {
  expect(ship.transferState).toBeNull()
}

/**
 * Asserts that a subsystem has specific energy allocation
 */
export function assertSubsystemEnergy(
  subsystems: Subsystem[],
  type: string,
  expectedEnergy: number
) {
  const subsystem = subsystems.find(s => s.type === type)
  expect(subsystem).toBeDefined()
  expect(subsystem?.allocatedEnergy).toBe(expectedEnergy)
}

/**
 * Asserts that a subsystem is powered
 */
export function assertSubsystemPowered(
  subsystems: Subsystem[],
  type: string,
  isPowered: boolean = true
) {
  const subsystem = subsystems.find(s => s.type === type)
  expect(subsystem).toBeDefined()
  expect(subsystem?.isPowered).toBe(isPowered)
}

/**
 * Asserts that a subsystem was used this turn
 */
export function assertSubsystemUsed(
  subsystems: Subsystem[],
  type: string,
  wasUsed: boolean = true
) {
  const subsystem = subsystems.find(s => s.type === type)
  expect(subsystem).toBeDefined()
  expect(subsystem?.usedThisTurn).toBe(wasUsed)
}

/**
 * Asserts reactor state
 */
export function assertReactorState(
  ship: ShipState,
  availableEnergy: number,
  energyToReturn?: number
) {
  expect(ship.reactor.availableEnergy).toBe(availableEnergy)
  if (energyToReturn !== undefined) {
    expect(ship.reactor.energyToReturn).toBe(energyToReturn)
  }
}

/**
 * Asserts heat state
 */
export function assertHeatState(
  ship: ShipState,
  currentHeat: number,
  heatToVent?: number
) {
  expect(ship.heat.currentHeat).toBe(currentHeat)
  if (heatToVent !== undefined) {
    expect(ship.heat.heatToVent).toBe(heatToVent)
  }
}
