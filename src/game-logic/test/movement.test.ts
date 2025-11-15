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

      // Turn 1: Player 1 allocates energy and burns to transfer to ring 5
      const allocateAction = createAllocateEnergyAction('engines', 2, 'player1')
      const burnAction = createBurnAction('medium', 'prograde', 0, 'player1')

      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      // After turn 1, player 1 should be in transfer
      const player1AfterBurn = gameState.players[0]
      expect(player1AfterBurn.ship.transferState).not.toBeNull()
      expect(player1AfterBurn.ship.transferState?.destinationRing).toBe(5) // Ring 3 + 2
      expect(player1AfterBurn.ship.reactionMass).toBe(INITIAL_REACTION_MASS - 2)

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
      expect(gameState.players[0].ship.ring).toBe(5)
      // Sector should be mapped from ring 3 (24 sectors) to ring 5 (96 sectors)
      // Sector 1 on ring 3 maps to sector 7 on ring 5 (no additional movement yet)
      expect(gameState.players[0].ship.sector).toBe(7)
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

      // Should be in transfer to ring 2
      expect(gameState.players[0].ship.transferState?.destinationRing).toBe(2)

      // Player 2 coasts
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Player 1's turn, transfer should complete
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(2)
      // Sector should be mapped from ring 3 (24 sectors) to ring 2 (12 sectors)
      // Starting from sector 1 (after orbital movement) on ring 3
      expect(gameState.players[0].ship.sector).toBe(1) // Sector 1 / 2 rounded forward = 1
    })

    it('should handle transfer with sector adjustment', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy and burn with sector adjustment
      const allocateAction = createAllocateEnergyAction('engines', 1)
      const burnAction = createBurnAction('light', 'prograde', 1) // +1 sector adjustment
      let result = executeTurnWithActions(gameState, allocateAction, burnAction)
      gameState = result.gameState

      const sectorAdjustment = gameState.players[0].ship.transferState?.sectorAdjustment
      expect(sectorAdjustment).toBe(1)

      // Advance to next turn (player 2)
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Complete transfer (back to player 1)
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Transfer should be complete and sector adjustment should have been applied
      expect(gameState.players[0].ship.transferState).toBeNull()
      expect(gameState.players[0].ship.ring).toBe(4)
      // Sector should be mapped from ring 3 (24 sectors) to ring 4 (48 sectors)
      // Sector 1 on ring 3 maps to sector 3, +1 adjustment = 4, +1 orbital movement on coast = 5
      expect(gameState.players[0].ship.sector).toBe(5)
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
      expect(gameState.players[0].ship.sector).toBe(1) // 0 + 1 orbital movement
      expect(gameState.players[0].ship.facing).toBe('prograde') // Unchanged
      expect(gameState.players[0].ship.ring).toBe(INITIAL_RING) // Unchanged
    })
  })
})
