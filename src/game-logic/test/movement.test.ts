import { describe, it, expect } from 'vitest'
import {
  applyOrbitalMovement,
  initiateBurn,
  completeTransfer,
  applyRotation,
  canExecuteBurn,
  canRotate,
} from '../movement'
import { createTestShip, createShipWithEngines, createShipInTransfer } from './fixtures/ships'
import { createBurnAction, createCoastAction } from './fixtures/actions'
import {
  assertShipPosition,
  assertReactionMass,
  assertFacing,
  assertInTransfer,
  assertNotInTransfer,
} from './helpers/assertions'

describe('Movement System', () => {
  describe('Orbital Movement', () => {
    it('should move ship forward by ring velocity', () => {
      const ship = createTestShip({ ring: 3, sector: 0 })
      const result = applyOrbitalMovement(ship)

      assertShipPosition(result, 3, 1)
    })

    it('should wrap around at end of ring', () => {
      const ship = createTestShip({ ring: 3, sector: 23 }) // Ring 3 has 24 sectors
      const result = applyOrbitalMovement(ship)

      assertShipPosition(result, 3, 0)
    })

    it('should handle different ring velocities', () => {
      // All rings have velocity 1 in current design
      const ring1Ship = createTestShip({ ring: 1, sector: 0 })
      const ring5Ship = createTestShip({ ring: 5, sector: 0 })

      const result1 = applyOrbitalMovement(ring1Ship)
      const result5 = applyOrbitalMovement(ring5Ship)

      assertShipPosition(result1, 1, 1)
      assertShipPosition(result5, 5, 1)
    })

    it('should not modify ship if ring config not found', () => {
      const ship = createTestShip({ ring: 99, sector: 0 })
      const result = applyOrbitalMovement(ship)

      expect(result).toEqual(ship)
    })
  })

  describe('Burn Initiation', () => {
    it('should initiate light prograde burn', () => {
      const ship = createShipWithEngines(1)
      const action = createBurnAction('light', 'prograde', 0)

      const result = initiateBurn(ship, action)

      assertReactionMass(result, 9) // 10 - 1
      assertInTransfer(result, 4, 0) // Ring 3 + 1
    })

    it('should initiate medium prograde burn', () => {
      const ship = createShipWithEngines(2)
      const action = createBurnAction('medium', 'prograde', 0)

      const result = initiateBurn(ship, action)

      assertReactionMass(result, 8) // 10 - 2
      assertInTransfer(result, 5, 0) // Ring 3 + 2
    })

    it('should initiate heavy prograde burn', () => {
      const ship = createShipWithEngines(3)
      const action = createBurnAction('heavy', 'prograde', 0)

      const result = initiateBurn(ship, action)

      assertReactionMass(result, 7) // 10 - 3
      assertInTransfer(result, 5, 0) // Ring 3 + 3, clamped to max ring 5
    })

    it('should initiate retrograde burn', () => {
      const ship = createShipWithEngines(2)
      const action = createBurnAction('medium', 'retrograde', 0)

      const result = initiateBurn(ship, action)

      assertReactionMass(result, 8)
      assertInTransfer(result, 1, 0) // Ring 3 - 2
    })

    it('should clamp destination ring to minimum (1)', () => {
      const ship = createShipWithEngines(3)
      ship.ring = 2
      const action = createBurnAction('heavy', 'retrograde', 0)

      const result = initiateBurn(ship, action)

      assertInTransfer(result, 1, 0) // Would be -1, clamped to 1
    })

    it('should clamp destination ring to maximum (5)', () => {
      const ship = createShipWithEngines(3)
      ship.ring = 4
      const action = createBurnAction('heavy', 'prograde', 0)

      const result = initiateBurn(ship, action)

      assertInTransfer(result, 5, 0) // Would be 7, clamped to 5
    })

    it('should apply sector adjustment', () => {
      const ship = createShipWithEngines(1)
      const action = createBurnAction('light', 'prograde', 1)

      const result = initiateBurn(ship, action)

      assertInTransfer(result, 4, 1)
    })

    it('should not initiate burn for coast action', () => {
      const ship = createShipWithEngines(1)
      const action = createCoastAction()

      const result = initiateBurn(ship, action)

      expect(result).toEqual(ship)
      assertNotInTransfer(result)
    })
  })

  describe('Transfer Completion', () => {
    it('should complete transfer from ring 3 to ring 4', () => {
      const ship = createShipInTransfer(4, 0)
      ship.ring = 3
      ship.sector = 12

      const result = completeTransfer(ship)

      expect(result.ring).toBe(4)
      expect(result.sector).toBeGreaterThanOrEqual(0)
      expect(result.sector).toBeLessThan(48) // Ring 4 has 48 sectors
      assertNotInTransfer(result)
    })

    it('should complete transfer from ring 3 to ring 2', () => {
      const ship = createShipInTransfer(2, 0)
      ship.ring = 3
      ship.sector = 12

      const result = completeTransfer(ship)

      expect(result.ring).toBe(2)
      expect(result.sector).toBeGreaterThanOrEqual(0)
      expect(result.sector).toBeLessThan(12) // Ring 2 has 12 sectors
      assertNotInTransfer(result)
    })

    it('should apply sector adjustment when completing transfer', () => {
      const ship = createShipInTransfer(4, 1)
      ship.ring = 3
      ship.sector = 0

      const resultNoAdj = completeTransfer(createShipInTransfer(4, 0))
      const resultWithAdj = completeTransfer(ship)

      // With +1 adjustment, should be 1 sector ahead (with wraparound)
      const expectedSector = (resultNoAdj.sector + 1) % 48
      expect(resultWithAdj.sector).toBe(expectedSector)
    })

    it('should handle wraparound with sector adjustment', () => {
      const ship = createShipInTransfer(4, 1)
      ship.ring = 3
      ship.sector = 23 // Near end of ring

      const result = completeTransfer(ship)

      expect(result.sector).toBeGreaterThanOrEqual(0)
      expect(result.sector).toBeLessThan(48)
      assertNotInTransfer(result)
    })

    it('should not modify ship if not in transfer', () => {
      const ship = createTestShip()

      const result = completeTransfer(ship)

      expect(result).toEqual(ship)
    })

    it('should handle transfer to ring 1', () => {
      const ship = createShipInTransfer(1, 0)
      ship.ring = 2
      ship.sector = 6

      const result = completeTransfer(ship)

      expect(result.ring).toBe(1)
      expect(result.sector).toBeGreaterThanOrEqual(0)
      expect(result.sector).toBeLessThan(6) // Ring 1 has 6 sectors
      assertNotInTransfer(result)
    })

    it('should handle transfer to ring 5', () => {
      const ship = createShipInTransfer(5, 0)
      ship.ring = 4
      ship.sector = 24

      const result = completeTransfer(ship)

      expect(result.ring).toBe(5)
      expect(result.sector).toBeGreaterThanOrEqual(0)
      expect(result.sector).toBeLessThan(96) // Ring 5 has 96 sectors
      assertNotInTransfer(result)
    })
  })

  describe('Rotation', () => {
    it('should rotate from prograde to retrograde', () => {
      const ship = createTestShip({ facing: 'prograde' })

      const result = applyRotation(ship, 'retrograde')

      assertFacing(result, 'retrograde')
    })

    it('should rotate from retrograde to prograde', () => {
      const ship = createTestShip({ facing: 'retrograde' })

      const result = applyRotation(ship, 'prograde')

      assertFacing(result, 'prograde')
    })

    it('should handle same facing', () => {
      const ship = createTestShip({ facing: 'prograde' })

      const result = applyRotation(ship, 'prograde')

      assertFacing(result, 'prograde')
    })
  })

  describe('Burn Validation', () => {
    it('should validate successful light burn', () => {
      const ship = createShipWithEngines(1)
      const action = createBurnAction('light', 'prograde', 0)

      const result = canExecuteBurn(ship, action)

      expect(result.valid).toBe(true)
    })

    it('should fail validation with insufficient reaction mass', () => {
      const ship = createShipWithEngines(3)
      ship.reactionMass = 1 // Not enough for heavy burn (needs 3)
      const action = createBurnAction('heavy', 'prograde', 0)

      const result = canExecuteBurn(ship, action)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('reaction mass')
    })

    it('should fail validation with insufficient engine energy', () => {
      const ship = createShipWithEngines(1) // Only 1 energy
      const action = createBurnAction('heavy', 'prograde', 0) // Needs 3 energy

      const result = canExecuteBurn(ship, action)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('energy in engines')
    })

    it('should fail validation with no engines powered', () => {
      const ship = createTestShip()
      const action = createBurnAction('light', 'prograde', 0)

      const result = canExecuteBurn(ship, action)

      expect(result.valid).toBe(false)
    })

    it('should fail validation for coast action', () => {
      const ship = createShipWithEngines(3)
      const action = createCoastAction()

      const result = canExecuteBurn(ship, action)

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Not a burn action')
    })
  })

  describe('Rotation Validation', () => {
    it('should validate rotation with powered thrusters', () => {
      const ship = createTestShip()
      ship.subsystems = ship.subsystems.map(s =>
        s.type === 'rotation' ? { ...s, isPowered: true, allocatedEnergy: 1 } : s
      )

      const result = canRotate(ship, 'retrograde')

      expect(result.valid).toBe(true)
    })

    it('should skip validation if already facing target', () => {
      const ship = createTestShip({ facing: 'prograde' })

      const result = canRotate(ship, 'prograde')

      expect(result.valid).toBe(true)
    })

    it('should fail validation with unpowered rotation', () => {
      const ship = createTestShip()

      const result = canRotate(ship, 'retrograde')

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('not powered')
    })

    it('should fail validation if rotation already used', () => {
      const ship = createTestShip()
      ship.subsystems = ship.subsystems.map(s =>
        s.type === 'rotation' ? { ...s, isPowered: true, allocatedEnergy: 1, usedThisTurn: true } : s
      )

      const result = canRotate(ship, 'retrograde')

      expect(result.valid).toBe(false)
      expect(result.reason).toContain('already used')
    })
  })
})
