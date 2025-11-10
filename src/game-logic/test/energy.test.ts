import { describe, it, expect } from 'vitest'
import { executeTurn, type TurnResult } from '../turns'
import type { GameState } from '../../types/game'
import {
  createCoastAction,
  createAllocateEnergyAction,
  createDeallocateEnergyAction,
} from './fixtures/actions'
import { createTestGameState, INITIAL_REACTOR_ENERGY } from './fixtures/gameState'

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

describe('Multi-Turn Energy Management', () => {
  describe('Energy Allocation/Deallocation Across Turns', () => {
    it('should allocate energy on turn 1, deallocate on turn 2, and return energy on turn 3', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate 3 energy to engines
      const allocateAction = createAllocateEnergyAction('engines', 3)
      let result = executeTurnWithActions(gameState, allocateAction, createCoastAction())
      gameState = result.gameState

      // After turn 1, engines should have 3 energy
      const enginesSubsystem = gameState.players[0].ship.subsystems.find(s => s.type === 'engines')
      expect(enginesSubsystem?.allocatedEnergy).toBe(3)
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY - 3)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Deallocate energy (returns to reactor WITHOUT generating heat)
      const deallocateAction = createDeallocateEnergyAction('engines', 3) // Deallocate all 3 energy
      result = executeTurnWithActions(gameState, deallocateAction, createCoastAction())
      gameState = result.gameState

      // After turn 2, energy should be back in reactor
      // Deallocation does NOT generate heat - heat only generated from overclocking
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY) // Back to full
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1) // 1 heat from overclocking engines (3 energy > 2 threshold)
    })

    it('should deallocate energy from multiple subsystems without generating heat', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy to multiple subsystems (total 5 energy)
      const allocate1 = createAllocateEnergyAction('engines', 3)
      const allocate2 = createAllocateEnergyAction('shields', 2)
      let result = executeTurnWithActions(gameState, allocate1, allocate2, createCoastAction())
      gameState = result.gameState

      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY - 5)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Deallocate both subsystems at once
      const deallocate1 = createDeallocateEnergyAction('engines', 3) // Deallocate all 3 from engines
      const deallocate2 = createDeallocateEnergyAction('shields', 2) // Deallocate all 2 from shields
      result = executeTurnWithActions(gameState, deallocate1, deallocate2, createCoastAction())
      gameState = result.gameState

      // All energy should return to reactor
      // Deallocation does NOT generate heat - heat only from overclocking during turn 1
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY)
      // Heat from turn 1: engines (3 > 2 threshold = 1 heat), shields not overclocked (2 = 2 threshold) = 1 total
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1)
    })

    it('should allow allocating and using energy in the same turn', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate energy and immediately allocate more
      const allocate1 = createAllocateEnergyAction('engines', 2)
      const allocate2 = createAllocateEnergyAction('engines', 1)
      let result = executeTurnWithActions(gameState, allocate1, allocate2, createCoastAction())
      gameState = result.gameState

      // After turn 1, engines should have 3 energy total
      const enginesSubsystem = gameState.players[0].ship.subsystems.find(s => s.type === 'engines')
      expect(enginesSubsystem?.allocatedEnergy).toBe(3)
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY - 3)
    })

    it('should support partial deallocation respecting the 3-unit limit', () => {
      let gameState = createTestGameState()

      // Turn 1: Allocate 5 energy to railgun
      const allocateAction = createAllocateEnergyAction('railgun', 5)
      let result = executeTurnWithActions(gameState, allocateAction, createCoastAction())
      gameState = result.gameState

      const railgunSubsystem = gameState.players[0].ship.subsystems.find(s => s.type === 'railgun')
      expect(railgunSubsystem?.allocatedEnergy).toBe(5)
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY - 5)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 2: Deallocate only 3 energy (limited by maxReturnRate)
      const deallocateAction = createDeallocateEnergyAction('railgun', 3)
      result = executeTurnWithActions(gameState, deallocateAction, createCoastAction())
      gameState = result.gameState

      // Should have 2 energy remaining in railgun
      const railgunSubsystem2 = gameState.players[0].ship.subsystems.find(s => s.type === 'railgun')
      expect(railgunSubsystem2?.allocatedEnergy).toBe(2)
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY - 2)

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction())
      gameState = result.gameState

      // Turn 3: Deallocate remaining 2 energy
      const deallocateAction2 = createDeallocateEnergyAction('railgun', 2)
      result = executeTurnWithActions(gameState, deallocateAction2, createCoastAction())
      gameState = result.gameState

      // Should be fully deallocated
      const railgunSubsystem3 = gameState.players[0].ship.subsystems.find(s => s.type === 'railgun')
      expect(railgunSubsystem3?.allocatedEnergy).toBe(0)
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(INITIAL_REACTOR_ENERGY)
    })
  })
})
