import { describe, it, expect, beforeEach } from 'vitest'
import { initiateWellTransfer, completeTransfer, applyOrbitalMovement } from '../movement'
import { calculateTransferPoints, getAvailableWellTransfers } from '../../utils/transferPoints'
import { ALL_GRAVITY_WELLS } from '../../constants/gravityWells'
import type { ShipState, TransferPoint } from '../../types/game'
import { STARTING_REACTION_MASS } from '../../constants/rings'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../../utils/subsystemHelpers'

describe('Well Transfers', () => {
  // Helper to create a test ship
  function createTestShip(wellId: string, ring: number, sector: number): ShipState {
    return {
      wellId,
      ring,
      sector,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    }
  }

  describe('Transfer Point Calculation', () => {
    it('should calculate transfer points for all planets', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Should have bidirectional transfers for 3 planets = 6 total
      expect(transferPoints).toHaveLength(6)

      // Check black hole -> planet transfers
      const blackHoleToPlanets = transferPoints.filter(tp => tp.fromWellId === 'blackhole')
      expect(blackHoleToPlanets).toHaveLength(3)

      // Check planet -> black hole transfers
      const planetsToBlackHole = transferPoints.filter(tp => tp.toWellId === 'blackhole')
      expect(planetsToBlackHole).toHaveLength(3)
    })

    it('should place transfer points at correct sectors on black hole', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Planet Alpha at 0° should connect to sector 0 on black hole Ring 4 (24 sectors)
      const alphaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-alpha'
      )
      expect(alphaTransfer?.fromSector).toBe(0)
      expect(alphaTransfer?.toSector).toBe(0) // Planet sector 0 always faces black hole

      // Planet Beta at 120° should connect to sector 8 on black hole Ring 4 (120/360 * 24 = 8)
      const betaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-beta'
      )
      expect(betaTransfer?.fromSector).toBe(8)
      expect(betaTransfer?.toSector).toBe(0)

      // Planet Gamma at 240° should connect to sector 16 on black hole Ring 4 (240/360 * 24 = 16)
      const gammaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-gamma'
      )
      expect(gammaTransfer?.fromSector).toBe(16)
      expect(gammaTransfer?.toSector).toBe(0)
    })

    it('should only allow transfers from outermost rings', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Black hole transfers from Ring 4, planets from Ring 3
      transferPoints.forEach(tp => {
        if (tp.fromWellId === 'blackhole') {
          expect(tp.fromRing).toBe(4) // Black hole's outermost ring
        } else {
          expect(tp.fromRing).toBe(3) // Planet's outermost ring
        }

        if (tp.toWellId === 'blackhole') {
          expect(tp.toRing).toBe(4) // Black hole's outermost ring
        } else {
          expect(tp.toRing).toBe(3) // Planet's outermost ring
        }
      })
    })
  })

  describe('Available Well Transfers', () => {
    let transferPoints: TransferPoint[]

    beforeEach(() => {
      transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)
    })

    it('should find available transfers from black hole transfer sector', () => {
      const ship = createTestShip('blackhole', 4, 0) // Ring 4 (outermost), Sector 0

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      // Should be able to transfer to Planet Alpha
      expect(available).toHaveLength(1)
      expect(available[0].toWellId).toBe('planet-alpha')
    })

    it('should return empty array when not on outermost ring', () => {
      const ship = createTestShip('blackhole', 3, 0) // Ring 3 (not outermost)

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      expect(available).toHaveLength(0)
    })

    it('should return empty array when not at transfer sector', () => {
      const ship = createTestShip('blackhole', 4, 10) // Ring 4, but wrong sector

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      expect(available).toHaveLength(0)
    })

    it('should find available transfers from planet to black hole', () => {
      const ship = createTestShip('planet-alpha', 3, 0) // Ring 3 (outermost for planets), Sector 0

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      // Should be able to transfer to black hole
      expect(available).toHaveLength(1)
      expect(available[0].toWellId).toBe('blackhole')
    })
  })

  describe('Initiating Well Transfer', () => {
    it('should initiate well transfer with correct state', () => {
      const ship = createTestShip('blackhole', 4, 0)

      const updatedShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      expect(updatedShip.transferState).not.toBeNull()
      expect(updatedShip.transferState?.destinationRing).toBe(3) // Planets have Ring 3 as outermost
      expect(updatedShip.transferState?.destinationWellId).toBe('planet-alpha')
      expect(updatedShip.transferState?.destinationSector).toBe(0)
      expect(updatedShip.transferState?.arriveNextTurn).toBe(true)
      expect(updatedShip.transferState?.isWellTransfer).toBe(true)
    })

    it('should not consume reaction mass for well transfer', () => {
      const ship = createTestShip('blackhole', 4, 0)
      const initialMass = ship.reactionMass

      const updatedShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      expect(updatedShip.reactionMass).toBe(initialMass)
    })
  })

  describe('Completing Well Transfer', () => {
    it('should complete well transfer to destination well', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship on black hole initiates transfer to Planet Alpha
      const ship = createTestShip('blackhole', 4, 0)
      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      // Complete the transfer
      const completedShip = completeTransfer(transferringShip, transferPoints)

      expect(completedShip.wellId).toBe('planet-alpha')
      expect(completedShip.ring).toBe(3) // Planet's outermost ring
      expect(completedShip.sector).toBe(0)
      expect(completedShip.transferState).toBeNull()
    })

    it('should complete well transfer from planet to black hole', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship on Planet Beta initiates transfer to black hole
      const ship = createTestShip('planet-beta', 3, 0)
      const transferringShip = initiateWellTransfer(ship, 'blackhole', 8) // Use sector 8 (120° / 15° per sector)

      // Complete the transfer
      const completedShip = completeTransfer(transferringShip, transferPoints)

      expect(completedShip.wellId).toBe('blackhole')
      expect(completedShip.ring).toBe(4) // Black hole's outermost ring
      expect(completedShip.sector).toBe(8) // 120° on 24-sector ring
      expect(completedShip.transferState).toBeNull()
    })

    it('should cancel transfer if transfer point no longer exists', () => {
      // Ship initiates transfer
      const ship = createTestShip('blackhole', 4, 0)
      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      // Complete with empty transfer points (simulating planet moved)
      const completedShip = completeTransfer(transferringShip, [])

      // Ship should stay in original position
      expect(completedShip.wellId).toBe('blackhole')
      expect(completedShip.ring).toBe(4) // Black hole's outermost ring
      expect(completedShip.sector).toBe(0)
      expect(completedShip.transferState).toBeNull()
    })
  })

  describe('Well Transfer Mechanics', () => {
    it('should handle multiple planets at different angles', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Each planet should have unique transfer sectors
      const blackHoleTransfers = transferPoints.filter(tp => tp.fromWellId === 'blackhole')
      const sectors = blackHoleTransfers.map(tp => tp.fromSector)

      // All sectors should be unique
      expect(new Set(sectors).size).toBe(sectors.length)
    })

    it('should maintain bidirectional transfers', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // For each black hole -> planet transfer, there should be a planet -> black hole transfer
      const blackHoleToPlanets = transferPoints.filter(tp => tp.fromWellId === 'blackhole')

      blackHoleToPlanets.forEach(bhToPlanet => {
        const planetToBlackHole = transferPoints.find(
          tp => tp.fromWellId === bhToPlanet.toWellId && tp.toWellId === 'blackhole'
        )

        expect(planetToBlackHole).toBeDefined()
        expect(planetToBlackHole?.toSector).toBe(bhToPlanet.fromSector)
        expect(planetToBlackHole?.fromSector).toBe(bhToPlanet.toSector)
      })
    })

    it('should preserve ship state during transfer (except position)', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      const ship = createTestShip('blackhole', 5, 0)
      ship.reactionMass = 5
      ship.hitPoints = 7
      ship.facing = 'retrograde'

      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)
      const completedShip = completeTransfer(transferringShip, transferPoints)

      // Position should change
      expect(completedShip.wellId).toBe('planet-alpha')

      // Other properties should be preserved
      expect(completedShip.reactionMass).toBe(5)
      expect(completedShip.hitPoints).toBe(7)

      // Facing is preserved because planet sectors are numbered in reverse
      // Planets have reversed sector numbering (counterclockwise) so the facing
      // remains the same label while preserving directional meaning
      expect(completedShip.facing).toBe('retrograde')
    })

    it('should preserve facing when transferring (prograde stays prograde)', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship moving prograde (with orbit) in black hole
      const ship = createTestShip('blackhole', 4, 0)
      ship.facing = 'prograde'

      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)
      const completedShip = completeTransfer(transferringShip, transferPoints)

      // Facing is preserved because planet sectors are numbered in reverse
      // A ship moving prograde in the black hole continues moving prograde in the planet
      expect(completedShip.facing).toBe('prograde')
    })

    it('should preserve facing when transferring from planet to black hole', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship moving prograde in planet
      const ship = createTestShip('planet-beta', 3, 0)
      ship.facing = 'prograde'

      const transferringShip = initiateWellTransfer(ship, 'blackhole', 8)
      const completedShip = completeTransfer(transferringShip, transferPoints)

      // Facing is preserved
      expect(completedShip.facing).toBe('prograde')
    })
  })

  describe('Well Transfer with Orbital Movement (Integration Tests)', () => {
    it('should correctly handle well transfer + orbital movement from Black Hole R4S0 to Planet Alpha R3', () => {
      // This test verifies the complete flow: transfer + orbital movement
      // Black Hole R4S0 -> Planet Alpha R3S0 -> orbital movement with velocity 2 -> R3S2

      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)
      const ship = createTestShip('blackhole', 4, 0)

      // Find available transfers from Black Hole R4S0
      const availableTransfers = getAvailableWellTransfers('blackhole', 4, 0, transferPoints)
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('planet-alpha')

      // Transfer to Planet Alpha R3S0 (no orbital movement yet)
      const transferredShip = {
        ...ship,
        wellId: 'planet-alpha' as const,
        ring: 3,
        sector: 0,
      }

      // Verify we're at the right starting position
      expect(transferredShip.wellId).toBe('planet-alpha')
      expect(transferredShip.ring).toBe(3)
      expect(transferredShip.sector).toBe(0)

      // Now apply orbital movement (this happens in the coast/burn action)
      // Planet Ring 3 has velocity 2, so sector should increment by 2
      const finalShip = applyOrbitalMovement(transferredShip)

      expect(finalShip.sector).toBe(2) // 0 + 2 = 2
      expect(finalShip.wellId).toBe('planet-alpha')
      expect(finalShip.ring).toBe(3)
    })

    it('should use correct velocities for different planet rings', () => {
      // Planet Ring 1: velocity 8
      const shipR1 = createTestShip('planet-alpha', 1, 0)
      const movedR1 = applyOrbitalMovement(shipR1)
      expect(movedR1.sector).toBe(8) // 0 + 8 = 8

      // Planet Ring 2: velocity 4
      const shipR2 = createTestShip('planet-alpha', 2, 0)
      const movedR2 = applyOrbitalMovement(shipR2)
      expect(movedR2.sector).toBe(4) // 0 + 4 = 4

      // Planet Ring 3: velocity 2
      const shipR3 = createTestShip('planet-alpha', 3, 0)
      const movedR3 = applyOrbitalMovement(shipR3)
      expect(movedR3.sector).toBe(2) // 0 + 2 = 2
    })

    it('should use correct velocities for different black hole rings', () => {
      // Black Hole Ring 1: velocity 8
      const shipR1 = createTestShip('blackhole', 1, 0)
      const movedR1 = applyOrbitalMovement(shipR1)
      expect(movedR1.sector).toBe(8) // 0 + 8 = 8

      // Black Hole Ring 2: velocity 4
      const shipR2 = createTestShip('blackhole', 2, 0)
      const movedR2 = applyOrbitalMovement(shipR2)
      expect(movedR2.sector).toBe(4) // 0 + 4 = 4

      // Black Hole Ring 3: velocity 2
      const shipR3 = createTestShip('blackhole', 3, 0)
      const movedR3 = applyOrbitalMovement(shipR3)
      expect(movedR3.sector).toBe(2) // 0 + 2 = 2

      // Black Hole Ring 4: velocity 1
      const shipR4 = createTestShip('blackhole', 4, 0)
      const movedR4 = applyOrbitalMovement(shipR4)
      expect(movedR4.sector).toBe(1) // 0 + 1 = 1
    })

    it('should handle sector wrap-around correctly for planets', () => {
      // Planet Ring 3 (velocity 2) at sector 23 should wrap to sector 1
      const ship = createTestShip('planet-alpha', 3, 23)
      const movedShip = applyOrbitalMovement(ship)
      expect(movedShip.sector).toBe(1) // (23 + 2) % 24 = 1
    })

    it('should handle sector wrap-around correctly for black hole', () => {
      // Black Hole Ring 1 (velocity 8) at sector 20 should wrap to sector 4
      const ship = createTestShip('blackhole', 1, 20)
      const movedShip = applyOrbitalMovement(ship)
      expect(movedShip.sector).toBe(4) // (20 + 8) % 24 = 4
    })

    it('should correctly transfer from Planet Beta R3S0 to Black Hole', () => {
      // Planet Beta is at 120° which maps to Black Hole sector 8
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)
      const ship = createTestShip('planet-beta', 3, 0)

      // Find available transfers from Planet Beta R3S0
      const availableTransfers = getAvailableWellTransfers('planet-beta', 3, 0, transferPoints)
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(8) // 120° / 15° = 8

      // Transfer to Black Hole R4S8
      const transferredShip = {
        ...ship,
        wellId: 'blackhole' as const,
        ring: 4,
        sector: 8,
      }

      // Apply orbital movement (Black Hole R4 has velocity 1)
      const finalShip = applyOrbitalMovement(transferredShip)

      expect(finalShip.sector).toBe(9) // 8 + 1 = 9
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
    })

    it('should correctly transfer from Planet Gamma R3S0 to Black Hole', () => {
      // Planet Gamma is at 240° which maps to Black Hole sector 16
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)
      const ship = createTestShip('planet-gamma', 3, 0)

      // Find available transfers from Planet Gamma R3S0
      const availableTransfers = getAvailableWellTransfers('planet-gamma', 3, 0, transferPoints)
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(16) // 240° / 15° = 16

      // Transfer to Black Hole R4S16
      const transferredShip = {
        ...ship,
        wellId: 'blackhole' as const,
        ring: 4,
        sector: 16,
      }

      // Apply orbital movement (Black Hole R4 has velocity 1)
      const finalShip = applyOrbitalMovement(transferredShip)

      expect(finalShip.sector).toBe(17) // 16 + 1 = 17
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
    })

    it('should verify planet ring velocities match expected configuration', () => {
      // This test documents and verifies the velocity configuration
      const planetAlpha = ALL_GRAVITY_WELLS.find(w => w.id === 'planet-alpha')!

      expect(planetAlpha.rings).toHaveLength(3)
      expect(planetAlpha.rings[0].velocity).toBe(8) // Ring 1
      expect(planetAlpha.rings[1].velocity).toBe(4) // Ring 2
      expect(planetAlpha.rings[2].velocity).toBe(2) // Ring 3 (transfer ring)
    })

    it('should verify black hole ring velocities match expected configuration', () => {
      // This test documents and verifies the velocity configuration
      const blackHole = ALL_GRAVITY_WELLS.find(w => w.id === 'blackhole')!

      expect(blackHole.rings).toHaveLength(4)
      expect(blackHole.rings[0].velocity).toBe(8) // Ring 1
      expect(blackHole.rings[1].velocity).toBe(4) // Ring 2
      expect(blackHole.rings[2].velocity).toBe(2) // Ring 3
      expect(blackHole.rings[3].velocity).toBe(1) // Ring 4 (transfer ring)
    })
  })
})
