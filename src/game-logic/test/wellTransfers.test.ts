import { describe, it, expect, beforeEach } from 'vitest'
import { applyOrbitalMovement } from '../movement'
import { processActions } from '../actionProcessors'
import { calculateTransferPoints, getAvailableWellTransfers } from '../../utils/transferPoints'
import { GRAVITY_WELLS, TRANSFER_POINTS } from '../../constants/gravityWells'
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
      turnLog: [],
      missiles: [],
      status: 'active',
    }
  }

  describe('Transfer Point Calculation', () => {
    it('should calculate transfer points for all planets', () => {
      const transferPoints = calculateTransferPoints(GRAVITY_WELLS)

      // Should have bidirectional transfers for 3 planets = 6 total
      expect(transferPoints).toHaveLength(6)

      // Check black hole → planet transfers
      const blackHoleToPlanets = transferPoints.filter(tp => tp.fromWellId === 'blackhole')
      expect(blackHoleToPlanets).toHaveLength(3)

      // Check planet → black hole transfers
      const planetsToBlackHole = transferPoints.filter(tp => tp.toWellId === 'blackhole')
      expect(planetsToBlackHole).toHaveLength(3)
    })

    it('should place transfer points at correct fixed sectors', () => {
      const transferPoints = calculateTransferPoints(GRAVITY_WELLS)

      // Planet Alpha: Outbound BH R4 S17 → Alpha R3 S7, Return Alpha R3 S16 → BH R4 S6
      const alphaOutbound = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-alpha'
      )
      expect(alphaOutbound?.fromSector).toBe(17)
      expect(alphaOutbound?.toSector).toBe(7)
      expect(alphaOutbound?.requiredEngineLevel).toBe(3)

      const alphaReturn = transferPoints.find(
        tp => tp.fromWellId === 'planet-alpha' && tp.toWellId === 'blackhole'
      )
      expect(alphaReturn?.fromSector).toBe(16)
      expect(alphaReturn?.toSector).toBe(6)
      expect(alphaReturn?.requiredEngineLevel).toBe(3)

      // Planet Beta: Outbound BH R4 S1 → Beta R3 S7, Return Beta R3 S16 → BH R4 S14
      const betaOutbound = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-beta'
      )
      expect(betaOutbound?.fromSector).toBe(1)
      expect(betaOutbound?.toSector).toBe(7)
      expect(betaOutbound?.requiredEngineLevel).toBe(3)

      const betaReturn = transferPoints.find(
        tp => tp.fromWellId === 'planet-beta' && tp.toWellId === 'blackhole'
      )
      expect(betaReturn?.fromSector).toBe(16)
      expect(betaReturn?.toSector).toBe(14)
      expect(betaReturn?.requiredEngineLevel).toBe(3)

      // Planet Gamma: Outbound BH R4 S9 → Gamma R3 S7, Return Gamma R3 S16 → BH R4 S22
      const gammaOutbound = transferPoints.find(
        tp => tp.fromWellId === 'blackhole' && tp.toWellId === 'planet-gamma'
      )
      expect(gammaOutbound?.fromSector).toBe(9)
      expect(gammaOutbound?.toSector).toBe(7)
      expect(gammaOutbound?.requiredEngineLevel).toBe(3)

      const gammaReturn = transferPoints.find(
        tp => tp.fromWellId === 'planet-gamma' && tp.toWellId === 'blackhole'
      )
      expect(gammaReturn?.fromSector).toBe(16)
      expect(gammaReturn?.toSector).toBe(22)
      expect(gammaReturn?.requiredEngineLevel).toBe(3)
    })

    it('should only allow transfers from outermost rings', () => {
      const transferPoints = calculateTransferPoints(GRAVITY_WELLS)

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
      transferPoints = calculateTransferPoints(GRAVITY_WELLS)
    })

    it('should find available transfers from black hole transfer sector', () => {
      const ship = createTestShip('blackhole', 4, 17) // Ring 4 (outermost), Sector 17 (Alpha outbound)

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      // Should be able to transfer to Planet Alpha
      expect(available).toHaveLength(1)
      expect(available[0].toWellId).toBe('planet-alpha')
      expect(available[0].toSector).toBe(7)
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
      const ship = createTestShip('planet-alpha', 3, 16) // Ring 3 (outermost for planets), Sector 16 (Alpha return)

      const available = getAvailableWellTransfers(
        ship.wellId,
        ship.ring,
        ship.sector,
        transferPoints
      )

      // Should be able to transfer to black hole
      expect(available).toHaveLength(1)
      expect(available[0].toWellId).toBe('blackhole')
      expect(available[0].toSector).toBe(6)
    })
  })

  describe('Well Transfer Execution', () => {
    it('should execute well transfer + coast from Black Hole R4S17 to Planet Alpha R3S7', () => {
      // This test uses the production action processors to execute a well transfer + coast
      // Expected flow: Black Hole R4S17 → Planet Alpha R3S7 → coast applies orbital movement (velocity 2) → R3S9

      const ship = createTestShip('blackhole', 4, 17)
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines (required for well transfer)
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7 // 10 - 3

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

      // After well transfer: should be at Planet Alpha R3S7
      // After coast: orbital movement applies velocity 1 → sector 8
      expect(finalShip.wellId).toBe('planet-alpha')
      expect(finalShip.ring).toBe(3)
      expect(finalShip.sector).toBe(8) // 7 + velocity(1) = 8
    })

    it('should use correct velocities for different planet rings', () => {
      // Planet Ring 1: velocity 4
      const shipR1 = createTestShip('planet-alpha', 1, 0)
      const movedR1 = applyOrbitalMovement(shipR1)
      expect(movedR1.sector).toBe(4) // 0 + 4 = 4

      // Planet Ring 2: velocity 2
      const shipR2 = createTestShip('planet-alpha', 2, 0)
      const movedR2 = applyOrbitalMovement(shipR2)
      expect(movedR2.sector).toBe(2) // 0 + 2 = 2

      // Planet Ring 3: velocity 1
      const shipR3 = createTestShip('planet-alpha', 3, 0)
      const movedR3 = applyOrbitalMovement(shipR3)
      expect(movedR3.sector).toBe(1) // 0 + 1 = 1
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
      // Planet Ring 3 (velocity 1) at sector 23 should wrap to sector 0
      const ship = createTestShip('planet-alpha', 3, 23)
      const movedShip = applyOrbitalMovement(ship)
      expect(movedShip.sector).toBe(0) // (23 + 1) % 24 = 0
    })

    it('should handle sector wrap-around correctly for black hole', () => {
      // Black Hole Ring 1 (velocity 8) at sector 20 should wrap to sector 4
      const ship = createTestShip('blackhole', 1, 20)
      const movedShip = applyOrbitalMovement(ship)
      expect(movedShip.sector).toBe(2) // (20 + 6) % 24 = 2
    })

    it('should correctly transfer from Planet Beta R3S16 to Black Hole R4S14', () => {
      // Planet Beta return: Beta R3 S16 → BH R4 S14
      const ship = createTestShip('planet-beta', 3, 16)
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines (required for well transfer)
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

      // Verify available transfer
      const availableTransfers = getAvailableWellTransfers(
        'planet-beta',
        3,
        16,
        TRANSFER_POINTS
      )
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(14)

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

      // After transfer: Black Hole R4S14
      // After coast: orbital movement applies velocity 1 → sector 15
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
      expect(finalShip.sector).toBe(15)
    })

    it('should correctly transfer from Planet Gamma R3S16 to Black Hole R4S22', () => {
      // Planet Gamma return: Gamma R3 S16 → BH R4 S22
      const ship = createTestShip('planet-gamma', 3, 16)
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines (required for well transfer)
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

      // Verify available transfer
      const availableTransfers = getAvailableWellTransfers(
        'planet-gamma',
        3,
        16,
        TRANSFER_POINTS
      )
      expect(availableTransfers).toHaveLength(1)
      expect(availableTransfers[0].toWellId).toBe('blackhole')
      expect(availableTransfers[0].toSector).toBe(22)

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

      // After transfer: Black Hole R4S22
      // After coast: orbital movement applies velocity 1 → sector 23
      expect(finalShip.wellId).toBe('blackhole')
      expect(finalShip.ring).toBe(4)
      expect(finalShip.sector).toBe(23)
    })

    it('should fail well transfer when not on outermost ring', () => {
      const ship = createTestShip('blackhole', 3, 20) // Ring 3, not outermost
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

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

      // Allocate 3 energy to engines
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

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

    it('should fail well transfer when engines not at level 3', () => {
      const ship = createTestShip('blackhole', 4, 17) // Correct position (Alpha outbound)
      const gameState = createTestGameState(ship)

      // Allocate only 2 energy to engines (need 3)
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 2
      gameState.players[0].ship.reactor.availableEnergy = 8

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
      expect(result.errors![0]).toContain('requires engines at level 3')
    })

    it('should preserve ship facing when transferring between wells', () => {
      const ship = createTestShip('blackhole', 4, 17) // Alpha outbound transfer sector
      ship.facing = 'prograde' // Well transfers require prograde facing
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

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
      expect(finalShip.facing).toBe('prograde')
    })

    it('should fail well transfer when not facing prograde', () => {
      const ship = createTestShip('blackhole', 4, 17) // Alpha outbound transfer sector
      ship.facing = 'retrograde' // Ship not facing prograde
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines and give enough reaction mass
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7
      gameState.players[0].ship.reactionMass = 10

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
      expect(result.errors![0]).toContain('must be facing prograde')
    })

    it('should fail well transfer when not enough reaction mass', () => {
      const ship = createTestShip('blackhole', 4, 17) // Alpha outbound transfer sector
      ship.facing = 'prograde'
      ship.reactionMass = 2 // Not enough (needs 3)
      const gameState = createTestGameState(ship)

      // Allocate 3 energy to engines
      gameState.players[0].ship.subsystems.find(s => s.type === 'engines')!.allocatedEnergy = 3
      gameState.players[0].ship.reactor.availableEnergy = 7

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
      expect(result.errors![0]).toContain('Not enough reaction mass')
    })
  })

  describe('Well Transfer Mechanics', () => {
    it('should handle multiple planets at different angles', () => {
      const transferPoints = calculateTransferPoints(GRAVITY_WELLS)

      // Each planet should have unique transfer sectors
      const blackHoleTransfers = transferPoints.filter(tp => tp.fromWellId === 'blackhole')
      const sectors = blackHoleTransfers.map(tp => tp.fromSector)

      // All sectors should be unique
      expect(new Set(sectors).size).toBe(sectors.length)
    })

    it('should maintain bidirectional transfers', () => {
      const transferPoints = calculateTransferPoints(GRAVITY_WELLS)

      // For each black hole → planet transfer, there should be a planet → black hole transfer
      const blackHoleToPlanets = transferPoints.filter(tp => tp.fromWellId === 'blackhole')

      blackHoleToPlanets.forEach(bhToPlanet => {
        const planetToBlackHole = transferPoints.find(
          tp => tp.fromWellId === bhToPlanet.toWellId && tp.toWellId === 'blackhole'
        )

        // Each outbound transfer should have a corresponding return transfer
        expect(planetToBlackHole).toBeDefined()
        // Note: sectors are NOT symmetrical - outbound and return use different fixed sectors
        // But both should have the same engine level requirement
        expect(planetToBlackHole?.requiredEngineLevel).toBe(bhToPlanet.requiredEngineLevel)
      })
    })
  })
})
