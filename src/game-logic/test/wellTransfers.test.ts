import { describe, it, expect, beforeEach } from 'vitest'
import { initiateWellTransfer, completeTransfer } from '../movement'
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

      // Planet Alpha at 0° should connect to sector 0 on black hole Ring 5
      const alphaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-alpha'
      )
      expect(alphaTransfer?.fromSector).toBe(0)
      expect(alphaTransfer?.toSector).toBe(0) // Planet sector 0 always faces black hole

      // Planet Beta at 120° should connect to sector 32 on black hole Ring 5 (120/360 * 96 = 32)
      const betaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-beta'
      )
      expect(betaTransfer?.fromSector).toBe(32)
      expect(betaTransfer?.toSector).toBe(0)

      // Planet Gamma at 240° should connect to sector 64 on black hole Ring 5 (240/360 * 96 = 64)
      const gammaTransfer = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-gamma'
      )
      expect(gammaTransfer?.fromSector).toBe(64)
      expect(gammaTransfer?.toSector).toBe(0)
    })

    it('should only allow transfers from Ring 5', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      transferPoints.forEach(tp => {
        expect(tp.fromRing).toBe(5)
        expect(tp.toRing).toBe(5)
      })
    })
  })

  describe('Available Well Transfers', () => {
    let transferPoints: TransferPoint[]

    beforeEach(() => {
      transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)
    })

    it('should find available transfers from black hole transfer sector', () => {
      const ship = createTestShip('blackhole', 5, 0) // Ring 5, Sector 0

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

    it('should return empty array when not on Ring 5', () => {
      const ship = createTestShip('blackhole', 3, 0) // Ring 3

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      expect(available).toHaveLength(0)
    })

    it('should return empty array when not at transfer sector', () => {
      const ship = createTestShip('blackhole', 5, 10) // Ring 5, but wrong sector

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      expect(available).toHaveLength(0)
    })

    it('should find available transfers from planet to black hole', () => {
      const ship = createTestShip('planet-alpha', 5, 0) // Ring 5, Sector 0 on planet

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
      const ship = createTestShip('blackhole', 5, 0)

      const updatedShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      expect(updatedShip.transferState).not.toBeNull()
      expect(updatedShip.transferState?.destinationRing).toBe(5)
      expect(updatedShip.transferState?.destinationWellId).toBe('planet-alpha')
      expect(updatedShip.transferState?.destinationSector).toBe(0)
      expect(updatedShip.transferState?.arriveNextTurn).toBe(true)
      expect(updatedShip.transferState?.isWellTransfer).toBe(true)
    })

    it('should not consume reaction mass for well transfer', () => {
      const ship = createTestShip('blackhole', 5, 0)
      const initialMass = ship.reactionMass

      const updatedShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      expect(updatedShip.reactionMass).toBe(initialMass)
    })
  })

  describe('Completing Well Transfer', () => {
    it('should complete well transfer to destination well', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship on black hole initiates transfer to Planet Alpha
      const ship = createTestShip('blackhole', 5, 0)
      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      // Complete the transfer
      const completedShip = completeTransfer(transferringShip, transferPoints)

      expect(completedShip.wellId).toBe('planet-alpha')
      expect(completedShip.ring).toBe(5)
      expect(completedShip.sector).toBe(0)
      expect(completedShip.transferState).toBeNull()
    })

    it('should complete well transfer from planet to black hole', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Ship on Planet Beta initiates transfer to black hole
      const ship = createTestShip('planet-beta', 5, 0)
      const transferringShip = initiateWellTransfer(ship, 'blackhole', 32)

      // Complete the transfer
      const completedShip = completeTransfer(transferringShip, transferPoints)

      expect(completedShip.wellId).toBe('blackhole')
      expect(completedShip.ring).toBe(5)
      expect(completedShip.sector).toBe(32)
      expect(completedShip.transferState).toBeNull()
    })

    it('should cancel transfer if transfer point no longer exists', () => {
      // Ship initiates transfer
      const ship = createTestShip('blackhole', 5, 0)
      const transferringShip = initiateWellTransfer(ship, 'planet-alpha', 0)

      // Complete with empty transfer points (simulating planet moved)
      const completedShip = completeTransfer(transferringShip, [])

      // Ship should stay in original position
      expect(completedShip.wellId).toBe('blackhole')
      expect(completedShip.ring).toBe(5)
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
      expect(completedShip.facing).toBe('retrograde')
    })
  })
})
