import { describe, it, expect } from 'vitest'
import { createBurnAction, createCoastAction, createAllocateEnergyAction } from './fixtures/actions'
import {
  createTestGameState,
  INITIAL_RING,
  INITIAL_REACTION_MASS,
} from './fixtures/gameState'
import { executeTurnWithActions } from './testUtils'

describe('Multi-Turn Movement', () => {
  describe('Transfer Completion Across Turns', () => {
    it('should complete transfer immediately on same turn', () => {
      let gameState = createTestGameState()

      // Turn 1: Player 1 allocates energy and burns to transfer to ring 4
      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', 0, 'player1') // Soft burn: +1 ring

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // After turn 1, transfer completes immediately (no transferState)
      const player1AfterBurn = gameState.players[0]
      expect(player1AfterBurn.ship.transferState).toBeNull()
      expect(player1AfterBurn.ship.ring).toBe(4) // Ring 3 + 1 = Ring 4
      expect(player1AfterBurn.ship.reactionMass).toBe(INITIAL_REACTION_MASS - 1) // Soft burn costs 1

      // After player 1's turn, it's player 2's turn (activePlayerIndex = 1)
      expect(gameState.activePlayerIndex).toBe(1)

      // Player started at sector 0, moved 4 sectors (Ring 3 velocity=4) during orbital movement,
      // then transferred to Ring 4 (1:1 sector mapping keeps sector at 4)
      expect(gameState.players[0].ship.sector).toBe(4)
    })

    it('should handle retrograde burn with immediate completion', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = INITIAL_RING
      gameState.players[0].ship.facing = 'retrograde' // Already facing retrograde, no rotation needed

      // Turn 1: Allocate energy and burn retrograde
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('soft', 'retrograde', 0)
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Transfer completes immediately (no transferState)
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(2) // Ring 3 - 1 = Ring 2

      // Movement trace:
      // Start at sector 0, move 4 sectors (Ring 3 velocity=4) → sector 4, then transfer completes to Ring 2 (1:1 mapping keeps sector at 4)
      expect(gameState.players[0].ship.sector).toBe(4)
    })

    it('should complete transfer immediately with 1:1 sector mapping', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy and burn (no sector adjustment in new system)
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('soft', 'prograde', 0) // No sector adjustment
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Transfer completes immediately with 1:1 sector mapping
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(4) // Ring 3 + 1 = Ring 4

      // Movement trace:
      // Start at sector 0, move 4 sectors (Ring 3 velocity=4) → sector 4, then transfer completes to Ring 4 (1:1 mapping keeps sector at 4)
      expect(gameState.players[0].ship.sector).toBe(4)
    })

    it('should allow coasting without rotation when already facing the desired direction', () => {
      let gameState = createTestGameState()

      // Ship is already prograde, coast without changing facing
      const coastAction = createCoastAction('player1')

      const result = executeTurnWithActions(gameState, coastAction)
      gameState = result.gameState

      // Should succeed without errors
      expect(result.errors).toBeUndefined()

      // Ship should have moved orbitally
      // Ring 3 has velocity=4, so moves 4 sectors per turn: 0 + 4 = 4
      expect(gameState.players[0].ship.sector).toBe(4)
      expect(gameState.players[0].ship.facing).toBe('prograde') // Unchanged
      expect(gameState.players[0].ship.ring).toBe(INITIAL_RING) // Unchanged
    })

    it('should allow rotation after movement', () => {
      let gameState = createTestGameState()

      // Turn 1: Player 1 coasts, then rotates
      // First allocate energy to rotation subsystem
      const allocateAction = {
        playerId: 'player1',
        type: 'allocate_energy' as const,
        data: {
          subsystemType: 'rotation' as const,
          amount: 1,
        },
      }

      const coastAction = {
        playerId: 'player1',
        type: 'coast' as const,
        sequence: 1,
        data: {
          activateScoop: false,
        },
      }

      const rotateAction = {
        playerId: 'player1',
        type: 'rotate' as const,
        sequence: 2, // After coast
        data: {
          targetFacing: 'retrograde' as const,
        },
      }

      const result = executeTurnWithActions(gameState, allocateAction, coastAction, rotateAction)
      gameState = result.gameState

      // Should succeed without errors
      expect(result.errors).toBeUndefined()

      // Ship should have moved orbitally FIRST (prograde direction)
      // Ring 3 has velocity=4, so moves 4 sectors per turn: 0 + 4 = 4
      expect(gameState.players[0].ship.sector).toBe(4)

      // THEN rotation should have been applied
      expect(gameState.players[0].ship.facing).toBe('retrograde')

      // Ship should still be on same ring (coasted)
      expect(gameState.players[0].ship.ring).toBe(INITIAL_RING)
    })

    it('should allow burn, then rotate, maintaining correct facing order', () => {
      let gameState = createTestGameState()

      // Turn 1: Player 1 allocates energy, burns prograde, then rotates to retrograde
      const allocateEngines = {
        playerId: 'player1',
        type: 'allocate_energy' as const,
        data: {
          subsystemType: 'engines' as const,
          amount: 2,
        },
      }

      const allocateRotation = {
        playerId: 'player1',
        type: 'allocate_energy' as const,
        data: {
          subsystemType: 'rotation' as const,
          amount: 1,
        },
      }

      const burnAction = {
        playerId: 'player1',
        type: 'burn' as const,
        sequence: 1,
        data: {
          burnIntensity: 'soft' as const,
          sectorAdjustment: 0,
        },
      }

      const rotateAction = {
        playerId: 'player1',
        type: 'rotate' as const,
        sequence: 2, // After burn
        data: {
          targetFacing: 'retrograde' as const,
        },
      }

      const result = executeTurnWithActions(
        gameState,
        allocateEngines,
        allocateRotation,
        burnAction,
        rotateAction
      )
      gameState = result.gameState

      // Should succeed without errors
      expect(result.errors).toBeUndefined()

      // Ship should have burned with PROGRADE facing (sequence 1)
      // Ring 3 + 1 = Ring 4 (prograde burn)
      expect(gameState.players[0].ship.ring).toBe(4)

      // THEN rotation should have been applied (sequence 2)
      expect(gameState.players[0].ship.facing).toBe('retrograde')

      // Note: usedThisTurn flags are reset at end of turn, so we verify rotation worked by checking facing changed
    })
  })

  describe('Sector Adjustment (Phasing Maneuvers)', () => {
    it('should handle positive sector adjustment (+3) with extra mass cost', () => {
      let gameState = createTestGameState()
      // Ring 3 has velocity=4, so can adjust -3 to +3

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', 3, 'player1') // +3 adjustment

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Soft burn base cost: 1 mass, adjustment cost: 3 mass, total: 4 mass
      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 4)
      expect(gameState.players[0].ship.ring).toBe(4) // Ring 3 + 1 = Ring 4
      expect(gameState.players[0].ship.transferState).toBeNull() // Transfer completes immediately
    })

    it('should handle negative sector adjustment (-1) with extra mass cost', () => {
      let gameState = createTestGameState()
      // Ring 3 has velocity=4, so can adjust -3 to +3

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', -1, 'player1') // -1 adjustment

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Soft burn base cost: 1 mass, adjustment cost: 1 mass (absolute value), total: 2 mass
      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 2)
      expect(gameState.players[0].ship.ring).toBe(4) // Ring 3 + 1 = Ring 4
    })

    it('should handle zero sector adjustment (perfect Hohmann) with no extra cost', () => {
      let gameState = createTestGameState()

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', 0, 'player1') // No adjustment

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Soft burn base cost: 1 mass, no adjustment cost, total: 1 mass
      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 1)
      expect(gameState.players[0].ship.ring).toBe(4)
    })

    it('should reject sector adjustment beyond maximum positive range', () => {
      let gameState = createTestGameState()
      // Ring 3 has velocity=4, so max adjustment is +3

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', 4, 'player1') // +4 is out of range

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Sector adjustment 4 out of range')
    })

    it('should reject sector adjustment beyond maximum negative range', () => {
      let gameState = createTestGameState()
      // Ring 3 has velocity=4, so min adjustment is -3 (velocity - 1)

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', -4, 'player1') // -4 is out of range

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Sector adjustment -4 out of range')
    })

    it('should reject sector adjustment when insufficient reaction mass', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.reactionMass = 3 // Only 3 mass available

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', 3, 'player1') // Needs 1 base + 3 adjustment = 4 mass

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Need 4 reaction mass')
    })

    it('should allow maximum adjustment range for high velocity rings', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = 1 // Ring 1 has velocity=8

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      const burnAction = createBurnAction('soft', 'prograde', -3, 'player1') // velocity 8, can adjust -7 to +3, -3 is valid

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Should succeed
      expect(result.errors).toBeUndefined()
      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 4) // 1 base + 3 adjustment
      expect(gameState.players[0].ship.ring).toBe(2) // Ring 1 + 1 = Ring 2
    })

    it('should limit negative adjustment for low velocity rings', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = 5 // Ring 5 has velocity=1

      const allocateAction = createAllocateEnergyAction('engines', 1, 'player1')
      // velocity 1, can only adjust 0 to +3 (no negative adjustment, must always move at least 1 sector)
      const burnAction = createBurnAction('soft', 'prograde', -1, 'player1')

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)

      // Should have validation error
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('Sector adjustment -1 out of range')
    })

    it('should allow zero adjustment for velocity 1 rings', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = 5 // Ring 5 has velocity=1

      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('soft', 'retrograde', 0, 'player1')

      gameState.players[0].ship.facing = 'retrograde' // Already facing retrograde

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Should succeed with no adjustment
      expect(result.errors).toBeUndefined()
      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 1) // Only base cost
      expect(gameState.players[0].ship.ring).toBe(4) // Ring 5 - 1 = Ring 4
    })

    it('should calculate mass cost correctly for different burn intensities with adjustment', () => {
      let gameState = createTestGameState()

      // Medium burn (2 mass base) + 2 sector adjustment (2 mass) = 4 mass total
      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('medium', 'prograde', 2, 'player1')

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      expect(gameState.players[0].ship.reactionMass).toBe(INITIAL_REACTION_MASS - 4)
      expect(gameState.players[0].ship.ring).toBe(5) // Ring 3 + 2 = Ring 5
    })
  })
})
