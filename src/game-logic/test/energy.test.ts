import { describe, it, expect } from 'vitest'
import {
  allocateEnergy,
  deallocateEnergy,
  processEnergyReturn,
  canAllocateEnergy,
  getSubsystem,
  resetSubsystemUsage,
  markSubsystemUsed,
} from '../energy'
import { createTestShip } from './fixtures/ships'
import {
  assertReactorState,
  assertSubsystemEnergy,
  assertSubsystemPowered,
  assertSubsystemUsed,
} from './helpers/assertions'
import type { SubsystemType } from '../../types/subsystems'

describe('Energy Management', () => {
  describe('Energy Allocation', () => {
    it('should allocate energy to subsystem', () => {
      const ship = createTestShip()

      const result = allocateEnergy(ship, 'engines', 3)

      assertSubsystemEnergy(result.subsystems, 'engines', 3)
      assertSubsystemPowered(result.subsystems, 'engines', true)
      assertReactorState(result, 7) // 10 - 3
    })

    it('should not allocate more than available energy', () => {
      const ship = createTestShip()
      ship.reactor.availableEnergy = 5

      const result = allocateEnergy(ship, 'engines', 10)

      // Should not change
      expect(result).toEqual(ship)
    })

    it('should handle reallocation (increase)', () => {
      const ship = createTestShip()

      // Allocate 2 first
      let result = allocateEnergy(ship, 'engines', 2)
      assertReactorState(result, 8) // 10 - 2

      // Then increase to 5
      result = allocateEnergy(result, 'engines', 5)
      assertSubsystemEnergy(result.subsystems, 'engines', 5)
      assertReactorState(result, 5, 2) // 10 - 5, with 2 to return
    })

    it('should handle reallocation (decrease)', () => {
      const ship = createTestShip()

      // Allocate 5 first
      let result = allocateEnergy(ship, 'engines', 5)
      assertReactorState(result, 5)

      // Then decrease to 2
      result = allocateEnergy(result, 'engines', 2)
      assertSubsystemEnergy(result.subsystems, 'engines', 2)
      assertReactorState(result, 8, 5) // 10 - 2, with 5 to return
    })

    it('should handle multiple subsystems', () => {
      const ship = createTestShip()

      let result = allocateEnergy(ship, 'engines', 3)
      result = allocateEnergy(result, 'laser', 4)

      assertSubsystemEnergy(result.subsystems, 'engines', 3)
      assertSubsystemEnergy(result.subsystems, 'laser', 4)
      assertReactorState(result, 3) // 10 - 3 - 4
    })

    it('should power subsystem when allocating energy', () => {
      const ship = createTestShip()

      const result = allocateEnergy(ship, 'engines', 1)

      assertSubsystemPowered(result.subsystems, 'engines', true)
    })

    it('should handle non-existent subsystem gracefully', () => {
      const ship = createTestShip()

      const result = allocateEnergy(ship, 'fake' as any, 5)

      expect(result).toEqual(ship)
    })
  })

  describe('Energy Deallocation', () => {
    it('should deallocate all energy from subsystem', () => {
      const ship = createTestShip()

      // Allocate first
      let result = allocateEnergy(ship, 'engines', 5)

      // Then deallocate
      result = deallocateEnergy(result, 'engines')

      assertSubsystemEnergy(result.subsystems, 'engines', 0)
      assertSubsystemPowered(result.subsystems, 'engines', false)
      assertReactorState(result, 5, 5) // Energy goes to energyToReturn
    })

    it('should handle deallocating from unpowered subsystem', () => {
      const ship = createTestShip()

      const result = deallocateEnergy(ship, 'engines')

      assertSubsystemEnergy(result.subsystems, 'engines', 0)
      assertReactorState(result, 10, 0)
    })

    it('should handle non-existent subsystem gracefully', () => {
      const ship = createTestShip()

      const result = deallocateEnergy(ship, 'fake-id' as SubsystemType)

      expect(result).toEqual(ship)
    })
  })

  describe('Energy Return', () => {
    it('should return energy up to max return rate', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 3
      ship.reactor.availableEnergy = 7
      ship.reactor.maxReturnRate = 5

      const result = processEnergyReturn(ship)

      assertReactorState(result, 10, 0) // 7 + 3 = 10, all returned
    })

    it('should respect max return rate', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 8
      ship.reactor.availableEnergy = 5
      ship.reactor.maxReturnRate = 5

      const result = processEnergyReturn(ship)

      assertReactorState(result, 10, 3) // 5 + 5 = 10, 3 remaining
    })

    it('should not exceed max energy capacity', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 5
      ship.reactor.availableEnergy = 8
      ship.reactor.totalCapacity = 10
      ship.reactor.maxReturnRate = 5

      const result = processEnergyReturn(ship)

      assertReactorState(result, 10, 3) // Capped at 10, 3 remaining
    })

    it('should handle zero energy to return', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 0

      const result = processEnergyReturn(ship)

      expect(result).toEqual(ship)
    })

    it('should account for heat venting reducing return capacity', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 5
      ship.reactor.availableEnergy = 5
      ship.reactor.maxReturnRate = 5
      ship.heat.heatToVent = 3 // Uses 3 of the 5 return capacity

      const result = processEnergyReturn(ship)

      // Only 2 energy can return (5 - 3 venting)
      assertReactorState(result, 7, 3) // 5 + 2 = 7, 3 remaining
    })

    it('should handle heat venting consuming all return capacity', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 5
      ship.reactor.availableEnergy = 5
      ship.reactor.maxReturnRate = 5
      ship.heat.heatToVent = 5 // Uses all return capacity

      const result = processEnergyReturn(ship)

      // No energy can return
      assertReactorState(result, 5, 5) // No change, all to return
    })

    it('should handle heat venting exceeding return capacity', () => {
      const ship = createTestShip()
      ship.reactor.energyToReturn = 5
      ship.reactor.availableEnergy = 5
      ship.reactor.maxReturnRate = 5
      ship.heat.heatToVent = 8 // More than return capacity

      const result = processEnergyReturn(ship)

      // No energy can return
      assertReactorState(result, 5, 5)
    })
  })

  describe('Energy Allocation Validation', () => {
    it('should validate successful allocation', () => {
      const ship = createTestShip()

      const result = canAllocateEnergy(ship, 'engines', 5)

      expect(result.valid).toBe(true)
    })

    it('should fail validation with insufficient energy', () => {
      const ship = createTestShip()
      ship.reactor.availableEnergy = 3

      const result = canAllocateEnergy(ship, 'engines', 5)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Not enough available energy')
    })

    it('should validate reallocation correctly', () => {
      const ship = createTestShip()

      // Allocate 3 first
      let result = allocateEnergy(ship, 'engines', 3)

      // Should be able to increase to 8 (needs 5 more, have 7 available)
      const validation = canAllocateEnergy(result, 'engines', 8)
      expect(validation.valid).toBe(true)
    })

    it('should fail validation for non-existent subsystem', () => {
      const ship = createTestShip()

      const result = canAllocateEnergy(ship, 'fake-id' as SubsystemType, 5)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('not found')
    })
  })

  describe('Subsystem Utilities', () => {
    it('should get subsystem by type', () => {
      const ship = createTestShip()

      const subsystem = getSubsystem(ship.subsystems, 'engines')

      expect(subsystem).toBeDefined()
      expect(subsystem?.type).toBe('engines')
    })

    it('should return undefined for non-existent type', () => {
      const ship = createTestShip()

      const subsystem = getSubsystem(ship.subsystems, 'fake' as any)

      expect(subsystem).toBeUndefined()
    })

    it('should reset all subsystem usage flags', () => {
      const ship = createTestShip()
      // Mark some subsystems as used
      ship.subsystems[0].usedThisTurn = true
      ship.subsystems[1].usedThisTurn = true

      const result = resetSubsystemUsage(ship)

      result.subsystems.forEach(s => {
        expect(s.usedThisTurn).toBe(false)
      })
    })

    it('should mark specific subsystem as used', () => {
      const ship = createTestShip()

      const result = markSubsystemUsed(ship, 'engines')

      assertSubsystemUsed(result.subsystems, 'engines', true)
      // Other subsystems should not be affected
      assertSubsystemUsed(result.subsystems, 'laser', false)
    })

    it('should handle marking non-existent subsystem as used', () => {
      const ship = createTestShip()

      const result = markSubsystemUsed(ship, 'fake' as any)

      // Should not crash, just not modify anything
      expect(result.subsystems.every(s => !s.usedThisTurn)).toBe(true)
    })
  })

  describe('Complex Energy Scenarios', () => {
    it('should handle full allocation and deallocation cycle', () => {
      const ship = createTestShip()

      // Allocate to engines and laser
      let result = allocateEnergy(ship, 'engines', 4)
      result = allocateEnergy(result, 'laser', 3)
      assertReactorState(result, 3)

      // Deallocate from engines
      result = deallocateEnergy(result, 'engines')
      assertReactorState(result, 3, 4)

      // Process energy return
      result = processEnergyReturn(result)
      assertReactorState(result, 7, 0) // 3 + 4 = 7

      // Should be able to allocate again
      result = allocateEnergy(result, 'engines', 2)
      assertReactorState(result, 5)
    })

    it('should handle energy return with multiple subsystems', () => {
      const ship = createTestShip()

      // Allocate to multiple subsystems
      let result = allocateEnergy(ship, 'engines', 3)
      result = allocateEnergy(result, 'laser', 2)
      result = allocateEnergy(result, 'railgun', 4)
      assertReactorState(result, 1)

      // Deallocate all
      result = deallocateEnergy(result, 'engines')
      result = deallocateEnergy(result, 'laser')
      result = deallocateEnergy(result, 'railgun')
      assertReactorState(result, 1, 9)

      // Process return (max rate is 5)
      result = processEnergyReturn(result)
      assertReactorState(result, 6, 4) // 1 + 5 = 6, 4 remaining
    })
  })
})
