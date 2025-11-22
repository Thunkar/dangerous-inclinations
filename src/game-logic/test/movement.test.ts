import { describe, it, expect } from 'vitest'
import { executeTurn, type TurnResult } from '../turns'
import type { GameState } from '../../types/game'
import { createBurnAction, createCoastAction, createAllocateEnergyAction } from './fixtures/actions'
import {
  createTestGameState,
  INITIAL_RING,
  INITIAL_REACTION_MASS,
} from './fixtures/gameState'

/**
 * Helper to execute a turn with actions for the active player
 */
function executeTurnWithActions(gameState: GameState, ...actions: any[]): TurnResult {
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  const actionsWithCorrectPlayer = actions
    .map(action => (action ? { ...action, playerId: activePlayer.id } : action))
    .filter(Boolean)

  return executeTurn(gameState, actionsWithCorrectPlayer)
}

describe('Multi-Turn Movement', () => {
  describe('Transfer Completion Across Turns', () => {
    it('should complete transfer immediately on same turn', () => {
      let gameState = createTestGameState()

      // Turn 1: Player 1 allocates energy and burns to transfer to ring 4 (max ring for black hole)
      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('light', 'prograde', 0, 'player1') // Light burn: +1 ring

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // After turn 1, transfer completes immediately (no transferState)
      const player1AfterBurn = gameState.players[0]
      expect(player1AfterBurn.ship.transferState).toBeNull()
      expect(player1AfterBurn.ship.ring).toBe(4) // Ring 3 + 1 = Ring 4
      expect(player1AfterBurn.ship.reactionMass).toBe(INITIAL_REACTION_MASS - 1) // Light burn costs 1

      // After player 1's turn, it's player 2's turn (activePlayerIndex = 1)
      expect(gameState.activePlayerIndex).toBe(1)

      // Player started at sector 0, moved 2 sectors (Ring 3 velocity=2) during orbital movement,
      // then transferred to Ring 4 (1:1 sector mapping keeps sector at 2)
      expect(gameState.players[0].ship.sector).toBe(2)
    })

    it('should handle retrograde burn with immediate completion', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = INITIAL_RING
      gameState.players[0].ship.facing = 'retrograde' // Already facing retrograde, no rotation needed

      // Turn 1: Allocate energy and burn retrograde
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('light', 'retrograde', 0)
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Transfer completes immediately (no transferState)
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(2) // Ring 3 - 1 = Ring 2

      // Movement trace:
      // Start at sector 0, move 2 sectors (Ring 3 velocity=2) → sector 2, then transfer completes to Ring 2 (1:1 mapping keeps sector at 2)
      expect(gameState.players[0].ship.sector).toBe(2)
    })

    it('should complete transfer immediately with 1:1 sector mapping', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy and burn (no sector adjustment in new system)
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('light', 'prograde', 0) // No sector adjustment
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Transfer completes immediately with 1:1 sector mapping
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(4) // Ring 3 + 1 = Ring 4

      // Movement trace:
      // Start at sector 0, move 2 sectors (Ring 3 velocity=2) → sector 2, then transfer completes to Ring 4 (1:1 mapping keeps sector at 2)
      expect(gameState.players[0].ship.sector).toBe(2)
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
      // Ring 3 has velocity=2, so moves 2 sectors per turn: 0 + 2 = 2
      expect(gameState.players[0].ship.sector).toBe(2)
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
      // Ring 3 has velocity=2, so moves 2 sectors per turn: 0 + 2 = 2
      expect(gameState.players[0].ship.sector).toBe(2)

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
          burnIntensity: 'light' as const,
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
})
