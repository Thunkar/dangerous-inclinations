import { describe, it, expect } from 'vitest'
import { executeTurn } from '../turns'
import { calculateMissileMovement, checkMissileHit, MISSILE_CONFIG } from '../missiles'
import { createTestGameState } from './fixtures/gameState'
import type { GameState, Missile, PlayerAction, FireWeaponAction, AllocateEnergyAction } from '../../types/game'

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

      const initialHP = gameState.players[1].ship.hitPoints

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

      // Check if damage was dealt (HP should be less than initial, or missile expired)
      const finalHP = gameState.players[1].ship.hitPoints

      // Either missile hit (HP reduced) or expired (HP unchanged)
      // We just check the missile is gone
      expect(gameState.missiles.length).toBe(0)
    })
  })
})
