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
    it('should initiate transfer on turn 1 and complete it on turn 2', () => {
      let gameState = createTestGameState()

      // Turn 1: Player 1 allocates energy and burns to transfer to ring 4 (max ring for black hole)
      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('light', 'prograde', 0, 'player1') // Light burn: +1 ring

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // After turn 1, player 1 should be in transfer
      const player1AfterBurn = gameState.players[0]
      expect(player1AfterBurn.ship.transferState).not.toBeNull()
      expect(player1AfterBurn.ship.transferState?.destinationRing).toBe(4) // Ring 3 + 1 = Ring 4
      expect(player1AfterBurn.ship.reactionMass).toBe(INITIAL_REACTION_MASS - 1) // Light burn costs 1

      // After player 1's turn, it's player 2's turn (activePlayerIndex = 1)
      expect(gameState.activePlayerIndex).toBe(1)

      // Turn 1b: Player 2 coasts
      result = executeTurnWithActions(gameState, createCoastAction('player2'))
      gameState = result.gameState

      // Now it's turn 2, back to player 1 (activePlayerIndex = 0)
      // Transfer should be completed BEFORE player 1 sees their turn (prepared at end of player 2's turn)
      expect(gameState.turn).toBe(2)
      expect(gameState.activePlayerIndex).toBe(0)
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(4)
      // Sector should stay the same (1:1 mapping with uniform 24 sectors)
      // Player started at sector 0, moved 2 sectors (Ring 3 velocity=2) during burn turn
      expect(gameState.players[0].ship.sector).toBe(2)
    })

    it('should handle retrograde burn and transfer completion', () => {
      let gameState = createTestGameState()
      gameState.players[0].ship.ring = INITIAL_RING
      gameState.players[0].ship.facing = 'retrograde' // Already facing retrograde, no rotation needed

      // Turn 1: Allocate energy and burn retrograde
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('light', 'retrograde', 0)
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Should be in transfer to ring 2 (Ring 3 - 1)
      expect(gameState.players[0].ship.transferState?.destinationRing).toBe(2)

      // Player 2 coasts
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Player 1's turn, transfer should complete
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(2)
      // Movement trace:
      // Turn 1: Start at sector 0, move 2 sectors (Ring 3 velocity=2) → sector 2, then transfer initiated
      // Turn 2: Transfer completes (Ring 3→Ring 2, 1:1 mapping keeps sector at 2), then coast moves 4 sectors (Ring 2 velocity=4) → sector 6
      expect(gameState.players[0].ship.sector).toBe(6)
    })

    it('should handle transfer without sector adjustment (removed feature)', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy and burn (no sector adjustment in new system)
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('light', 'prograde', 0) // No sector adjustment
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // Sector adjustment should be 0 (feature removed)
      const sectorAdjustment = gameState.players[0].ship.transferState?.sectorAdjustment
      expect(sectorAdjustment).toBe(0)

      // Advance to next turn (player 2)
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Complete transfer (back to player 1)
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Transfer should be complete with 1:1 sector mapping
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(4)
      // Movement trace:
      // Turn 1: Start at sector 0, move 2 sectors (Ring 3 velocity=2) → sector 2, then transfer initiated
      // Turn 2: Transfer completes (Ring 3→Ring 4, 1:1 mapping keeps sector at 2), then coast moves 1 sector (Ring 4 velocity=1) → sector 3
      expect(gameState.players[0].ship.sector).toBe(3)
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
  })
})
