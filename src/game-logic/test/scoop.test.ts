import { describe, it, expect } from 'vitest'
import { createCoastAction, createAllocateEnergyAction } from './fixtures/actions'
import { createTestGameState } from './fixtures/gameState'
import { executeTurnWithActions } from './testUtils'
import { getGravityWell } from '../../constants/gravityWells'

describe('Fuel Scoop', () => {
  describe('Scoop Activation', () => {
    it('should recover reaction mass equal to velocity when scoop is activated', () => {
      let gameState = createTestGameState()

      // Ship starts at ring 3 in black hole (velocity=4) with full reaction mass (10)
      // Reduce mass to test recovery
      gameState.players[0].ship.reactionMass = 5

      // Allocate 3 energy to scoop (required to activate)
      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true) // activateScoop = true

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      // Should succeed
      expect(result.errors).toBeUndefined()

      // Should recover 4 mass (velocity of ring 3 = 4)
      expect(gameState.players[0].ship.reactionMass).toBe(9) // 5 + 4 = 9
    })

    it('should cap recovery at max reaction mass', () => {
      let gameState = createTestGameState()

      // Ship has 9 mass, velocity is 4, so recovery would be 13 but should cap at 10
      gameState.players[0].ship.reactionMass = 9

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()
      expect(gameState.players[0].ship.reactionMass).toBe(10) // Capped at max
    })

    it('should recover more mass on higher velocity rings', () => {
      let gameState = createTestGameState()

      // Move to ring 1 (velocity = 8)
      gameState.players[0].ship.ring = 1
      gameState.players[0].ship.reactionMass = 2

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()

      // Should recover 8 mass (velocity of ring 1 = 8)
      expect(gameState.players[0].ship.reactionMass).toBe(10) // 2 + 8 = 10 (capped at max)
    })

    it('should recover less mass on lower velocity rings', () => {
      let gameState = createTestGameState()

      // Move to ring 5 (velocity = 1)
      gameState.players[0].ship.ring = 5
      gameState.players[0].ship.reactionMass = 5

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()

      // Should recover 1 mass (velocity of ring 5 = 1)
      expect(gameState.players[0].ship.reactionMass).toBe(6) // 5 + 1 = 6
    })

    it('should not recover mass when scoop is not activated', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 5

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', false) // activateScoop = false

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()
      expect(gameState.players[0].ship.reactionMass).toBe(5) // No recovery
    })
  })

  describe('Scoop Validation', () => {
    it('should fail if scoop has insufficient energy', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 5

      // Only allocate 2 energy (need 3)
      const allocateAction = createAllocateEnergyAction('scoop', 2, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Need 3 energy in scoop')
    })

    it('should fail if scoop has no energy allocated', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 5

      // No energy allocation
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, coastAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Need 3 energy in scoop')
    })

    it('should succeed with exactly 3 energy in scoop', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 5

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()
      expect(gameState.players[0].ship.reactionMass).toBe(9) // 5 + 4 (velocity of Ring 3 = 4)
    })
  })

  describe('Scoop with Different Gravity Wells', () => {
    it('should work correctly in planet gravity wells', () => {
      let gameState = createTestGameState()

      // Move to a planet (ring 2 in planet has velocity=2)
      gameState.players[0].ship.wellId = 'planet-alpha'
      gameState.players[0].ship.ring = 2
      gameState.players[0].ship.reactionMass = 4

      const allocateAction = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction = createCoastAction('player1', 'prograde', true)

      const result = executeTurnWithActions(gameState, allocateAction, coastAction)
      gameState = result.gameState

      expect(result.errors).toBeUndefined()

      // Planet ring 2 has velocity=2
      const well = getGravityWell('planet-alpha')
      const ringConfig = well?.rings.find(r => r.ring === 2)
      const expectedRecovery = ringConfig?.velocity || 0

      expect(gameState.players[0].ship.reactionMass).toBe(4 + expectedRecovery)
    })
  })

  describe('Scoop Integration', () => {
    it('should allow multiple scoops over multiple turns', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 2

      // Turn 1: Scoop
      const allocateAction1 = createAllocateEnergyAction('scoop', 3, 'player1')
      const coastAction1 = createCoastAction('player1', 'prograde', true)
      let result = executeTurnWithActions(gameState, allocateAction1, coastAction1)
      gameState = result.gameState

      expect(gameState.players[0].ship.reactionMass).toBe(6) // 2 + 4 (Ring 3 velocity = 4)

      // Turn 2: Switch to player 2 (bot), then back to player 1
      // Execute bot turn (simple coast)
      const botCoastAction = createCoastAction('bot1', 'prograde', false)
      result = executeTurnWithActions(gameState, botCoastAction)
      gameState = result.gameState

      // Turn 3: Player 1 scoops again
      const coastAction2 = createCoastAction('player1', 'prograde', true)
      result = executeTurnWithActions(gameState, coastAction2)
      gameState = result.gameState

      expect(gameState.players[0].ship.reactionMass).toBe(10) // 6 + 4 = 10 (capped at max)
    })
  })
})
