import { describe, it, expect } from 'vitest'
import { executeTurn, type TurnResult } from '../turns'
import type { GameState } from '../../types/game'
import { createCoastAction, createVentHeatAction } from './fixtures/actions'
import { createTestGameState, INITIAL_HIT_POINTS } from './fixtures/gameState'

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

describe('Multi-Turn Heat Management', () => {
  describe('Heat Accumulation and Venting', () => {
    it('should accumulate heat and vent it over multiple turns', () => {
      let gameState = createTestGameState()

      // Turn 1: Manually set some heat (simulating heat generation)
      gameState.players[0].ship.heat.currentHeat = 5

      const initialHP = gameState.players[0].ship.hitPoints

      // Turn 1: Coast without venting - should take 5 damage
      let result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 5)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(5) // Heat persists

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Vent 3 heat, take 2 damage from remaining heat
      const ventAction = createVentHeatAction(3)
      result = executeTurnWithActions(gameState, ventAction, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.heat.currentHeat).toBe(2) // 5 - 3 vented
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 5 - 2) // Previous 5 + current 2

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 3: Vent remaining heat
      const ventAction2 = createVentHeatAction(2)
      result = executeTurnWithActions(gameState, ventAction2, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.heat.currentHeat).toBe(0) // All vented
      // No damage this turn because heat was fully vented
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 5 - 2) // No additional damage
    })

    it('should apply heat damage based on heat at start of turn', () => {
      let gameState = createTestGameState()

      // Set initial heat
      gameState.players[0].ship.heat.currentHeat = 5

      const initialHP = INITIAL_HIT_POINTS

      // Turn 1: Coast without venting
      let result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Heat damage should be applied: effectiveHeat (5 - 0 venting) = 5 damage
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 5)

      // Heat should remain (not automatically vented)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(5)
    })

    it('should allow partial heat venting to reduce damage', () => {
      let gameState = createTestGameState()

      // Manually set 5 heat
      gameState.players[0].ship.heat.currentHeat = 5

      const initialHP = INITIAL_HIT_POINTS

      // Turn 1: Request to vent 3 heat (leaving 2 for damage)
      const ventAction = createVentHeatAction(3)
      let result = executeTurnWithActions(gameState, ventAction, createCoastAction())
      gameState = result.gameState

      // Effective heat for damage = 5 - 3 = 2 damage
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 2)

      // Remaining heat after venting = 5 - 3 = 2
      expect(gameState.players[0].ship.heat.currentHeat).toBe(2)
    })

    it('should accumulate heat over multiple turns without venting', () => {
      let gameState = createTestGameState()

      // Manually set initial heat
      gameState.players[0].ship.heat.currentHeat = 2

      const initialHP = INITIAL_HIT_POINTS

      // Turn 1: Coast without venting - 2 damage
      let result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 2)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(2) // Heat persists

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Add more heat manually (simulating heat generation)
      gameState.players[0].ship.heat.currentHeat = 4 // Now 4 heat total

      // Coast again - 4 more damage
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 2 - 4) // 10 - 6 = 4
      expect(gameState.players[0].ship.heat.currentHeat).toBe(4)
    })

    it('should vent multiple times in sequence', () => {
      let gameState = createTestGameState()

      // Set high heat
      gameState.players[0].ship.heat.currentHeat = 10

      // Turn 1: Vent 3 heat
      let result = executeTurnWithActions(gameState, createVentHeatAction(3), createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.heat.currentHeat).toBe(7) // 10 - 3

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Vent 3 more heat
      result = executeTurnWithActions(gameState, createVentHeatAction(3), createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.heat.currentHeat).toBe(4) // 7 - 3

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 3: Vent remaining heat (can only vent 3 at a time due to max return rate)
      result = executeTurnWithActions(gameState, createVentHeatAction(3), createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.heat.currentHeat).toBe(1) // 4 - 3
    })
  })
})
