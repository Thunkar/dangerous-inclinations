import { describe, it, expect } from 'vitest'
import { createCoastAction, createVentHeatAction } from './fixtures/actions'
import { createTestGameState, INITIAL_HIT_POINTS } from './fixtures/gameState'
import { executeTurnWithActions } from './testUtils'

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

      // Give player 1 enough HP to survive heat damage during multi-turn venting
      // Turn 1: 10 heat - 3 vent = 7 damage, Turn 2: 7 heat - 3 vent = 4 damage, Turn 3: 4 heat - 3 vent = 1 damage
      // Total damage = 7 + 4 + 1 = 12, so need at least 13 HP
      gameState.players[0].ship.hitPoints = 20
      gameState.players[0].ship.maxHitPoints = 20

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

  describe('Heat Venting Bug Fix', () => {
    it('should not cause damage when consistently venting heat from overclocked systems', () => {
      // Scenario: Engines at 3 power level (overclocked by 1), generating 1 heat per turn
      // If we vent 1 heat every turn, no damage should occur
      // Heat generated in previous turn - heat vented = 0 damage
      // New heat generated at end of turn doesn't cause damage until next turn

      let gameState = createTestGameState()

      // Turn 1: Allocate 3 energy to engines (overclocked by 1, will generate 1 heat)
      const allocateAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: { subsystemType: 'engines', amount: 3 },
      }
      let result = executeTurnWithActions(gameState, allocateAction, createCoastAction())
      gameState = result.gameState

      // After turn 1: Should have 1 heat, no damage yet
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Vent 1 heat, coast (engines still at 3 energy)
      const ventAction = createVentHeatAction(1)
      result = executeTurnWithActions(gameState, ventAction, createCoastAction())
      gameState = result.gameState

      // After turn 2: No damage (heat was vented), but 1 new heat generated
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS) // NO DAMAGE - this is the key fix
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1) // New heat from overclock

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 3: Vent 1 heat again, coast (engines still at 3 energy)
      const ventAction2 = createVentHeatAction(1)
      result = executeTurnWithActions(gameState, ventAction2, createCoastAction())
      gameState = result.gameState

      // After turn 3: Still no damage, heat remains at 1
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS) // NO DAMAGE
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1) // New heat from overclock

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 4: Same pattern
      const ventAction3 = createVentHeatAction(1)
      result = executeTurnWithActions(gameState, ventAction3, createCoastAction())
      gameState = result.gameState

      // After turn 4: Still no damage
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS) // NO DAMAGE
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1)
    })

    it('should cause damage when overclocked system heat is not vented', () => {
      // Control test: If we don't vent, damage should occur from accumulated heat

      let gameState = createTestGameState()

      // Turn 1: Allocate 3 energy to engines (overclocked by 1)
      const allocateAction = {
        type: 'allocate_energy',
        playerId: 'player1',
        data: { subsystemType: 'engines', amount: 3 },
      }
      let result = executeTurnWithActions(gameState, allocateAction, createCoastAction())
      gameState = result.gameState

      // After turn 1: 1 heat, no damage yet
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Coast without venting
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // After turn 2: Should take 1 damage (from the 1 heat at start of turn), plus 1 new heat
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS - 1) // DAMAGE OCCURRED
      expect(gameState.players[0].ship.heat.currentHeat).toBe(2) // Original heat + new heat

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 3: Coast without venting
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // After turn 3: Should take 2 damage (from 2 heat at start of turn), plus 1 new heat
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS - 1 - 2) // DAMAGE OCCURRED
      expect(gameState.players[0].ship.heat.currentHeat).toBe(3) // Accumulated heat
    })

    it('should partially reduce damage when venting less than current heat', () => {
      // Test case: 2 heat at start of turn, vent 1 heat
      // Should take 1 damage (2 heat - 1 vented = 1 damage)

      let gameState = createTestGameState()

      // Manually set initial heat
      gameState.players[0].ship.heat.currentHeat = 2

      // Turn 1: Vent only 1 heat (not enough to prevent all damage)
      const ventAction = createVentHeatAction(1)
      const result = executeTurnWithActions(gameState, ventAction, createCoastAction())
      gameState = result.gameState

      // After turn 1: Should take 1 damage (2 heat - 1 vented = 1 damage)
      expect(gameState.players[0].ship.hitPoints).toBe(INITIAL_HIT_POINTS - 1) // 1 damage
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1) // 2 original - 1 vented = 1 remaining
    })
  })
})
