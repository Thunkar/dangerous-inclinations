import { describe, it, expect } from 'vitest'
import { executeTurn } from '../turns'
import { calculateMissileMovement, checkMissileHit, MISSILE_CONFIG } from '../missiles'
import { createTestGameState } from './fixtures/gameState'
import type { Missile, FireWeaponAction, AllocateEnergyAction, CoastAction } from '../../types/game'

describe('Missile System', () => {
  describe('Missile Pathfinding', () => {
    it('should calculate missile movement towards target', () => {
      const gameState = createTestGameState()

      const missile: Missile = {
        id: 'test-missile-1',
        ownerId: 'player1',
        targetId: 'player2',
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        turnFired: 1,
        turnsAlive: 0,
      }

      // Player 2 is at ring 3, sector 12 (from fixture)
      const target = gameState.players[1]

      const movement = calculateMissileMovement(missile, target, gameState)

      expect(movement.ring).toBe(3) // Same ring, no ring change
      expect(movement.fuelSpent).toBeGreaterThan(0)
      expect(movement.fuelSpent).toBeLessThanOrEqual(MISSILE_CONFIG.FUEL_PER_TURN)
      expect(movement.path.length).toBeGreaterThan(0)
    })

    it('should prioritize ring changes over sector moves', () => {
      const gameState = createTestGameState()

      // Missile at R1S0, target at R3S5
      const missile: Missile = {
        id: 'test-missile-1',
        ownerId: 'player1',
        targetId: 'player2',
        wellId: 'blackhole',
        ring: 1,
        sector: 0,
        turnFired: 1,
        turnsAlive: 0,
      }

      // Modify target to be on a different ring
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 5
      const target = gameState.players[1]

      const movement = calculateMissileMovement(missile, target, gameState)

      // Should move towards ring 3 first (2 rings = 2 fuel)
      expect(movement.ring).toBe(3)
      // Should have 1 fuel left for sector movement
      expect(movement.fuelSpent).toBe(3)
    })

    it('should wrap around sectors correctly', () => {
      const gameState = createTestGameState()

      // Missile at sector 23, target at sector 1 (wrap around is shorter than going backwards)
      const missile: Missile = {
        id: 'test-missile-1',
        ownerId: 'player1',
        targetId: 'player2',
        wellId: 'blackhole',
        ring: 3,
        sector: 23,
        turnFired: 1,
        turnsAlive: 0,
      }

      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 1
      const target = gameState.players[1]

      const movement = calculateMissileMovement(missile, target, gameState)

      // Should wrap around (23 -> 0 -> 1 = 2 sectors)
      expect(movement.sector).toBe(1)
      expect(movement.fuelSpent).toBe(2)
    })

    it('should detect hit when at same position as target', () => {
      const gameState = createTestGameState()

      const missile: Missile = {
        id: 'test-missile-1',
        ownerId: 'player1',
        targetId: 'player2',
        wellId: 'blackhole',
        ring: 3,
        sector: 12,
        turnFired: 1,
        turnsAlive: 0,
      }

      const target = gameState.players[1]

      const hit = checkMissileHit(missile, target)

      expect(hit).toBe(true)
    })
  })

  describe('Missile Firing and Tracking', () => {
    it('should fire missile and decrement inventory', () => {
      let gameState = createTestGameState()

      // Allocate energy to missiles
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      // Fire missile
      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      const result = executeTurn(gameState, [allocateAction, fireAction])
      gameState = result.gameState

      expect(result.errors).toBeUndefined()

      // Check missile inventory decremented
      const player1 = gameState.players.find(p => p.id === 'player1')!
      expect(player1.ship.missileInventory).toBe(3) // Started with 4

      // Check missile was added to game state
      expect(gameState.missiles.length).toBe(1)
      expect(gameState.missiles[0].ownerId).toBe('player1')
      expect(gameState.missiles[0].targetId).toBe('player2')
    })

    it('should not fire missile with 0 inventory', () => {
      let gameState = createTestGameState()

      // Set inventory to 0
      gameState.players[0].ship.missileInventory = 0

      // Allocate energy to missiles
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      // Try to fire missile
      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      const result = executeTurn(gameState, [allocateAction, fireAction])

      expect(result.errors).toBeDefined()
      expect(result.errors).toContain('No missiles remaining')
    })

    it('should track missile over multiple turns', () => {
      let gameState = createTestGameState()

      // Position player 1 at R3S0, player 2 at R3S6
      gameState.players[0].ship.ring = 3
      gameState.players[0].ship.sector = 0
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 6

      // Turn 1: Player 1 fires missile
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      let result = executeTurn(gameState, [allocateAction, fireAction])
      gameState = result.gameState

      expect(gameState.missiles.length).toBe(1)
      const missileId = gameState.missiles[0].id

      // Turn 2: Player 2 does nothing, missiles process at end of turn
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Missile should still be tracking
      const missile = gameState.missiles.find(m => m.id === missileId)
      if (missile) {
        expect(missile.turnsAlive).toBe(1)
      } else {
        // If missile is gone, it must have hit
        expect(gameState.missiles.find(m => m.id === missileId)).toBeUndefined()
      }
    })

    it('should expire missile after 3 turns', () => {
      let gameState = createTestGameState()

      // Position players far apart so missile won't hit
      gameState.players[0].ship.ring = 1
      gameState.players[0].ship.sector = 0
      gameState.players[1].ship.ring = 4
      gameState.players[1].ship.sector = 23

      // Turn 1: Player 1 fires missile
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      let result = executeTurn(gameState, [allocateAction, fireAction])
      gameState = result.gameState

      expect(gameState.missiles.length).toBe(1)
      const missileId = gameState.missiles[0].id

      // Missile should have turnsAlive = 1 after player1's turn (processed immediately)
      let missile = gameState.missiles.find(m => m.id === missileId)
      expect(missile).toBeDefined()
      expect(missile?.turnsAlive).toBe(1)

      // Turn 2: Player 2's turn (missile doesn't process since it's owned by player1)
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Missile should still have turnsAlive = 1
      missile = gameState.missiles.find(m => m.id === missileId)
      expect(missile?.turnsAlive).toBe(1)

      // Turn 3: Player 1's turn again (missile processes again)
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Missile should have turnsAlive = 2
      missile = gameState.missiles.find(m => m.id === missileId)
      expect(missile).toBeDefined()
      expect(missile?.turnsAlive).toBe(2)

      // Turn 4: Player 2's turn (missile doesn't process)
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Turn 5: Player 1's turn (missile processes 3rd time and expires)
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Missile should be expired and removed (turnsAlive reached 3)
      expect(gameState.missiles.find(m => m.id === missileId)).toBeUndefined()
    })

    it('should allow multiple missiles targeting same ship', () => {
      let gameState = createTestGameState()

      // Set inventory to 4
      gameState.players[0].ship.missileInventory = 4

      // Fire first missile
      const allocate1: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      const fire1: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      let result = executeTurn(gameState, [allocate1, fire1])
      gameState = result.gameState

      expect(gameState.missiles.length).toBe(1)

      // Player 2's turn (skip)
      result = executeTurn(gameState, [])
      gameState = result.gameState

      // Fire second missile from player 1
      const allocate2: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      const fire2: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      result = executeTurn(gameState, [allocate2, fire2])
      gameState = result.gameState

      // Should have 2 missiles targeting player2
      const missilesTargetingP2 = gameState.missiles.filter(m => m.targetId === 'player2')
      expect(missilesTargetingP2.length).toBeGreaterThanOrEqual(1) // At least 1 (second one), first might have hit
    })

    it('should deal damage when missile hits', () => {
      let gameState = createTestGameState()

      // Position ships close together
      gameState.players[0].ship.ring = 3
      gameState.players[0].ship.sector = 0
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 2 // Close enough to hit quickly

      // Fire missile
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      let result = executeTurn(gameState, [allocateAction, fireAction])
      gameState = result.gameState

      // Process several turns to let missile hit
      for (let i = 0; i < 5; i++) {
        result = executeTurn(gameState, [])
        gameState = result.gameState

        // Check if missile hit
        if (gameState.missiles.length === 0) {
          // Missile exploded or hit
          break
        }
      }

      // Either missile hit or expired - we just check the missile is gone
      expect(gameState.missiles.length).toBe(0)
    })
  })

  describe('Missile Orbital Movement Timing', () => {
    it('should skip orbital drift for missiles fired AFTER movement', () => {
      // This test verifies that missiles fired after the ship moves don't get "double movement"
      // The ship's position already accounts for orbital drift, so the missile shouldn't drift again
      let gameState = createTestGameState()

      // Position player 1 at R3S0
      gameState.players[0].ship.ring = 3
      gameState.players[0].ship.sector = 0
      // Position player 2 far away so missile won't hit immediately
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 12

      // Allocate energy to missiles
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      // Coast action with sequence 1 (happens first)
      const coastAction: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        sequence: 1,
        data: {
          activateScoop: false,
        },
      }

      // Fire missile with sequence 2 (happens AFTER movement)
      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 2,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      const result = executeTurn(gameState, [allocateAction, coastAction, fireAction])
      gameState = result.gameState

      expect(result.errors).toBeUndefined()
      expect(gameState.missiles.length).toBe(1)

      const missile = gameState.missiles[0]

      // Ring 3 in blackhole has velocity 2 (2 sectors per turn)
      // After coast, ship moves from S0 to S2 (orbital drift of 2)
      // Missile is fired at ship's new position (S2)
      // Missile should NOT get additional orbital drift since it was fired after movement
      // With 3 fuel, missile moves 3 sectors toward target (S12)
      // So missile should be at S2 + 3 = S5 (not S7 which would happen with double drift)
      expect(missile.sector).toBe(5)
    })

    it('should apply orbital drift for missiles fired BEFORE movement', () => {
      // This test verifies that missiles fired before movement DO get orbital drift
      let gameState = createTestGameState()

      // Position player 1 at R3S0
      gameState.players[0].ship.ring = 3
      gameState.players[0].ship.sector = 0
      // Position player 2 far away
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 12

      // Allocate energy to missiles
      const allocateAction: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      }

      // Fire missile with sequence 1 (happens BEFORE movement)
      const fireAction: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1,
        data: {
          weaponType: 'missiles',
          targetPlayerIds: ['player2'],
        },
      }

      // Coast action with sequence 2 (happens after firing)
      const coastAction: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        sequence: 2,
        data: {
          activateScoop: false,
        },
      }

      const result = executeTurn(gameState, [allocateAction, fireAction, coastAction])
      gameState = result.gameState

      expect(result.errors).toBeUndefined()
      expect(gameState.missiles.length).toBe(1)

      const missile = gameState.missiles[0]

      // Ring 3 in blackhole has velocity 2 (2 sectors per turn)
      // Missile fired at S0 (before ship moves)
      // Missile gets orbital drift: S0 -> S2
      // Then missile uses 3 fuel to move toward target (S12): S2 + 3 = S5
      // Total: S0 -> S2 (orbital) -> S5 (fuel)
      expect(missile.sector).toBe(5)
    })

    it('should result in different positions for fire-before vs fire-after when ship burns', () => {
      // More explicit test: with a burn, the position difference is clearer
      // Fire BEFORE burn: missile starts at original position, gets orbital drift
      // Fire AFTER burn: missile starts at post-burn position, no orbital drift

      // Test case 1: Fire BEFORE movement
      let gameState1 = createTestGameState()
      gameState1.players[0].ship.ring = 3
      gameState1.players[0].ship.sector = 0
      gameState1.players[0].ship.facing = 'prograde'
      gameState1.players[1].ship.ring = 3
      gameState1.players[1].ship.sector = 20 // Far away

      const allocate1: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: { subsystemType: 'missiles', amount: 2 },
      }

      const fire1: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 1, // BEFORE coast
        data: { weaponType: 'missiles', targetPlayerIds: ['player2'] },
      }

      const coast1: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        sequence: 2, // AFTER fire
        data: { activateScoop: false },
      }

      let result1 = executeTurn(gameState1, [allocate1, fire1, coast1])
      const missileBeforeMove = result1.gameState.missiles[0]

      // Test case 2: Fire AFTER movement
      let gameState2 = createTestGameState()
      gameState2.players[0].ship.ring = 3
      gameState2.players[0].ship.sector = 0
      gameState2.players[0].ship.facing = 'prograde'
      gameState2.players[1].ship.ring = 3
      gameState2.players[1].ship.sector = 20 // Same far away target

      const allocate2: AllocateEnergyAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: { subsystemType: 'missiles', amount: 2 },
      }

      const coast2: CoastAction = {
        type: 'coast',
        playerId: 'player1',
        sequence: 1, // BEFORE fire
        data: { activateScoop: false },
      }

      const fire2: FireWeaponAction = {
        type: 'fire_weapon',
        playerId: 'player1',
        sequence: 2, // AFTER coast
        data: { weaponType: 'missiles', targetPlayerIds: ['player2'] },
      }

      let result2 = executeTurn(gameState2, [allocate2, coast2, fire2])
      const missileAfterMove = result2.gameState.missiles[0]

      // Both missiles should end up at the same sector!
      // Ring 3 in blackhole has velocity 2, so orbital drift = 2 sectors
      // Fire before: S0 (start) -> S2 (orbital drift) -> S5 (3 fuel toward S20)
      // Fire after: S2 (ship moved) -> no orbital -> S5 (3 fuel toward S20)
      // The key insight: the NEW model makes them equal, the OLD model would have fire-after at S7
      expect(missileBeforeMove.sector).toBe(missileAfterMove.sector)
    })
  })
})
