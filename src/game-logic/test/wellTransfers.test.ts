import { describe, it, expect, beforeEach } from 'vitest'
import { applyOrbitalMovement } from '../movement'
import { processActions } from '../actionProcessors'
import { calculateTransferPoints, getAvailableWellTransfers } from '../../utils/transferPoints'
import { ALL_GRAVITY_WELLS } from '../../constants/gravityWells'
import type {
  ShipState,
  TransferPoint,
  GameState,
  WellTransferAction,
  CoastAction,
} from '../../types/game'
import { STARTING_REACTION_MASS } from '../../constants/rings'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../../utils/subsystemHelpers'
import { MISSILE_CONFIG } from '../missiles'

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
      missileInventory: MISSILE_CONFIG.INITIAL_INVENTORY,
    }
  }

  // Helper to create a test game state
  function createTestGameState(ship: ShipState): GameState {
    const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

    return {
      turn: 1,
      activePlayerIndex: 0,
      players: [
        {
          id: 'player1',
          name: 'Test Player',
          color: '#00ff00',
          ship,
        },
      ],
      gravityWells: ALL_GRAVITY_WELLS,
      transferPoints,
      turnLog: [],
      missiles: [],
    }
  }

  describe('Transfer Point Calculation', () => {
    it('should calculate transfer points for all planets', () => {
      const transferPoints = calculateTransferPoints(ALL_GRAVITY_WELLS)

      // Should have bidirectional transfers for 3 planets = 6 total
      expect(transferPoints).toHaveLength(6)

      // Check black hole → planet transfers
      const blackHoleToPlanets = transferPoints.filter(tp => tp.fromWellId === 'blackhole')
      expect(blackHoleToPlanets).toHaveLength(3)

      // Check planet → black hole transfers
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

  describe('Well Transfer Execution', () => {
    it('should execute well transfer + coast from Black Hole R4S0 to Planet Alpha R3', () => {
      // This test uses the production action processors to execute a well transfer + coast
      // Expected flow: Black Hole R4S0 → Planet Alpha R3S0 → coast applies orbital movement (velocity 2) → R3S2

      const ship = createTestShip('blackhole', 4, 0)
      const gameState = createTestGameState(ship)

      // Create well transfer action (sequence 1)
      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'planet-alpha',
        },
        sequence: 1,
      }

      // Create coast action (sequence 2) - this will apply orbital movement after the transfer
      const coastAction: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        data: {
          activateScoop: false,
        },
        sequence: 2,
      }

      // Execute actions using
      const result = processActions(gameState, [wellTransferAction, coastAction])

      expect(result.success).toBe(true)
      expect(result.errors).toBeUndefined()

      const finalShip = result.gameState.players[0].ship

      // After well transfer: should be at Planet Alpha R3S0
      // After coast: orbital movement applies velocity 2 → sector 2
      expect(finalShip.wellId).toBe('planet-alpha')
      expect(finalShip.ring).toBe(3)
      expect(finalShip.sector).toBe(2) // 0 + velocity(2) = 2
    })

    it('should use correct velocities for different planet rings', () => {
      // Planet Ring 1: velocity 8
      const shipR1 = createTestShip('planet-alpha', 1, 0)
      const movedR1 = applyOrbitalMovement(shipR1)
      expect(movedR1.sector).toBe(6) // 0 + 6 = 6

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
      expect(movedR1.sector).toBe(6) // 0 + 6 = 6

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
      expect(movedShip.sector).toBe(2) // (20 + 6) % 24 = 2
    })

    it('should correctly transfer from Planet Beta R3S0 to Black Hole', () => {
      // Planet Beta is at 120° which maps to Black Hole sector 8
      const ship = createTestShip('planet-beta', 3, 0)
      const gameState = createTestGameState(ship)

      // Verify available transfer
      const availableTransfers = getAvailableWellTransfers(
        'planet-beta',
        3,
        0,
        gameState.transferPoints
      )
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(8)

      // Execute well transfer + coast
      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'blackhole',
        },
        sequence: 1,
      }

      const coastAction: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        data: {
          activateScoop: false,
        },
        sequence: 2,
      }

      const result = processActions(gameState, [wellTransferAction, coastAction])

      expect(result.success).toBe(true)
      const finalShip = result.gameState.players[0].ship

      // After transfer: Black Hole R4S8
      // After coast: orbital movement applies velocity 1 → sector 9
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
      expect(finalShip.sector).toBe(9)
    })

    it('should correctly transfer from Planet Gamma R3S0 to Black Hole', () => {
      // Planet Gamma is at 240° which maps to Black Hole sector 16
      const ship = createTestShip('planet-gamma', 3, 0)
      const gameState = createTestGameState(ship)

      // Verify available transfer
      const availableTransfers = getAvailableWellTransfers(
        'planet-gamma',
        3,
        0,
        gameState.transferPoints
      )
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(16) // 240° / 15° = 16

      // Execute well transfer + coast
      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'blackhole',
        },
        sequence: 1,
      }

      const coastAction: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        data: {
          activateScoop: false,
        },
        sequence: 2,
      }

      const result = processActions(gameState, [wellTransferAction, coastAction])

      expect(result.success).toBe(true)
      const finalShip = result.gameState.players[0].ship

      // After transfer: Black Hole R4S16
      // After coast: orbital movement applies velocity 1 → sector 17
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
      expect(finalShip.sector).toBe(17) // 16 + 1 = 17
    })

    it('should fail well transfer when not on outermost ring', () => {
      const ship = createTestShip('blackhole', 3, 0) // Ring 3, not outermost
      const gameState = createTestGameState(ship)

      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'planet-alpha',
        },
        sequence: 1,
      }

      const result = processActions(gameState, [wellTransferAction])

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('outermost ring')
    })

    it('should fail well transfer when not at transfer sector', () => {
      const ship = createTestShip('blackhole', 4, 5) // Ring 4 but wrong sector
      const gameState = createTestGameState(ship)

      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'planet-alpha',
        },
        sequence: 1,
      }

      const result = processActions(gameState, [wellTransferAction])

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('transfer point')
    })

    it('should preserve ship facing when transferring between wells', () => {
      const ship = createTestShip('blackhole', 4, 0)
      ship.facing = 'retrograde'
      const gameState = createTestGameState(ship)

      const wellTransferAction: WellTransferAction = {
        type: 'well_transfer',
        playerId: 'player1',
        data: {
          destinationWellId: 'planet-alpha',
        },
        sequence: 1,
      }

      const result = processActions(gameState, [wellTransferAction])

      expect(result.success).toBe(true)
      const finalShip = result.gameState.players[0].ship

      // Facing should be preserved
      expect(finalShip.facing).toBe('retrograde')
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

      // For each black hole → planet transfer, there should be a planet → black hole transfer
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
  })
})
