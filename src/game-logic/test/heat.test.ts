import { describe, it, expect } from 'vitest'
import {
  calculateHeatGeneration,
  applyHeatGeneration,
  setHeatVenting,
  processHeatVenting,
  calculateHeatDamage,
  canVentHeat,
} from '../heat'
import { createTestShip, createShipWithHeat, createShipWithWeapons } from './fixtures/ships'
import { assertHeatState } from './helpers/assertions'

describe('Heat Management', () => {
  describe('Heat Generation', () => {
    it('should calculate zero heat for unpowered systems', () => {
      const ship = createTestShip()

      const heat = calculateHeatGeneration(ship.subsystems)

      expect(heat).toBe(0)
    })

    it('should calculate heat from overclocked railgun', () => {
      const ship = createShipWithWeapons('railgun', 4)

      const heat = calculateHeatGeneration(ship.subsystems)

      expect(heat).toBe(1)
    })

    it('should not generate heat from railgun below 4 energy', () => {
      const ship = createShipWithWeapons('railgun', 3)

      const heat = calculateHeatGeneration(ship.subsystems)

      expect(heat).toBe(0)
    })

    it('should apply heat generation to ship', () => {
      const ship = createShipWithWeapons('railgun', 4)

      const result = applyHeatGeneration(ship)

      assertHeatState(result, 1)
    })

    it('should accumulate heat over multiple generations', () => {
      const ship = createShipWithHeat(3)
      ship.subsystems = ship.subsystems.map(s =>
        s.type === 'railgun' ? { ...s, isPowered: true, allocatedEnergy: 4 } : s
      )

      const result = applyHeatGeneration(ship)

      assertHeatState(result, 4) // 3 + 1
    })

    it('should not modify ship if no heat generated', () => {
      const ship = createTestShip()

      const result = applyHeatGeneration(ship)

      expect(result).toEqual(ship)
    })
  })

  describe('Heat Venting', () => {
    it('should set heat to vent', () => {
      const ship = createTestShip()

      const result = setHeatVenting(ship, 3)

      assertHeatState(result, 0, 3)
    })

    it('should process heat venting correctly', () => {
      const ship = createShipWithHeat(5)
      ship.heat.heatToVent = 3

      const result = processHeatVenting(ship)

      assertHeatState(result, 2, 0) // 5 - 3 = 2, reset heatToVent
    })

    it('should not vent more heat than available', () => {
      const ship = createShipWithHeat(2)
      ship.heat.heatToVent = 5

      const result = processHeatVenting(ship)

      assertHeatState(result, 0, 0) // Can only vent 2, not 5
    })

    it('should handle zero heat to vent', () => {
      const ship = createShipWithHeat(5)

      const result = processHeatVenting(ship)

      expect(result).toEqual(ship)
    })

    it('should vent all heat when heatToVent equals currentHeat', () => {
      const ship = createShipWithHeat(4)
      ship.heat.heatToVent = 4

      const result = processHeatVenting(ship)

      assertHeatState(result, 0, 0)
    })
  })

  describe('Heat Damage', () => {
    it('should calculate damage from current heat', () => {
      const ship = createShipWithHeat(20)

      const damage = calculateHeatDamage(ship)

      expect(damage).toBe(20) // All heat causes damage
    })

    it('should calculate damage after venting', () => {
      const ship = createShipWithHeat(20)
      ship.heat.heatToVent = 5

      const damage = calculateHeatDamage(ship)

      expect(damage).toBe(15) // 20 - 5 = 15
    })

    it('should calculate zero damage with no heat', () => {
      const ship = createShipWithHeat(0)

      const damage = calculateHeatDamage(ship)

      expect(damage).toBe(0)
    })

    it('should not calculate negative damage', () => {
      const ship = createShipWithHeat(5)
      ship.heat.heatToVent = 10 // Venting more than current heat

      const damage = calculateHeatDamage(ship)

      expect(damage).toBe(0) // Max(0, 5 - 10) = 0
    })
  })

  describe('Heat Venting Validation', () => {
    it('should validate successful heat venting', () => {
      const ship = createShipWithHeat(10)

      const result = canVentHeat(ship, 5)

      expect(result.valid).toBe(true)
    })

    it('should fail validation when venting more than current heat', () => {
      const ship = createShipWithHeat(5)

      const result = canVentHeat(ship, 10)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Cannot vent more')
    })

    it('should allow venting up to exact current heat', () => {
      const ship = createShipWithHeat(8)

      const result = canVentHeat(ship, 8)

      expect(result.valid).toBe(true)
    })

    it('should allow venting zero heat', () => {
      const ship = createShipWithHeat(5)

      const result = canVentHeat(ship, 0)

      expect(result.valid).toBe(true)
    })
  })

  describe('Complex Heat Scenarios', () => {
    it('should handle full heat generation and venting cycle', () => {
      // Start with some heat
      let ship = createShipWithHeat(5)

      // Generate heat from railgun
      ship.subsystems = ship.subsystems.map(s =>
        s.type === 'railgun' ? { ...s, isPowered: true, allocatedEnergy: 4 } : s
      )
      ship = applyHeatGeneration(ship)
      assertHeatState(ship, 6) // 5 + 1

      // Set venting
      ship = setHeatVenting(ship, 3)
      assertHeatState(ship, 6, 3)

      // Process venting
      ship = processHeatVenting(ship)
      assertHeatState(ship, 3, 0) // 6 - 3 = 3
    })

    it('should handle multiple heat sources in future', () => {
      const ship = createShipWithWeapons('railgun', 4)

      // Currently only railgun generates heat
      const heat = calculateHeatGeneration(ship.subsystems)
      expect(heat).toBe(1)

      // Future: could add more heat sources
    })

    it('should handle accumulating heat levels', () => {
      const ship = createShipWithHeat(19)

      // Add one more heat
      const result = applyHeatGeneration({
        ...ship,
        subsystems: ship.subsystems.map(s =>
          s.type === 'railgun' ? { ...s, isPowered: true, allocatedEnergy: 4 } : s
        ),
      })

      // Now at 20 heat
      expect(calculateHeatDamage(result)).toBe(20)
    })

    it('should handle venting reducing damage', () => {
      let ship = createShipWithHeat(22)

      expect(calculateHeatDamage(ship)).toBe(22)

      // Vent 3 heat
      ship = setHeatVenting(ship, 3)
      ship = processHeatVenting(ship)

      expect(calculateHeatDamage(ship)).toBe(19)
    })
  })
})
