import { describe, it, expect } from 'vitest'
import {
  computeMissionGoals,
  selectCurrentGoal,
} from '../../ai/behaviors/missions.ts'
import type { Player, GameState } from '../../models/game.ts'
import type { Mission } from '../../models/missions.ts'
import { createInitialShipState } from '../../utils/subsystemHelpers.ts'
import { testDeterminismDefaults } from '../fixtures/gameState.ts'

/**
 * Helper to create a minimal game state
 */
function createTestGameState(players: Player[]): GameState {
  return {
    turn: 1,
    activePlayerIndex: 0,
    players,
    turnLog: [],
    missiles: [],
    phase: 'active',
    stations: [
      { id: 'station-alpha', planetId: 'planet-alpha', ring: 1, sector: 0 },
      { id: 'station-beta', planetId: 'planet-beta', ring: 1, sector: 0 },
      { id: 'station-gamma', planetId: 'planet-gamma', ring: 1, sector: 0 },
    ],
    ...testDeterminismDefaults(),
  }
}

function createTestPlayer(
  id: string,
  name: string,
  config: { wellId: string; ring: number; sector: number; facing: 'prograde' | 'retrograde' },
  missions: Mission[] = [],
): Player {
  return {
    id,
    name,
    ship: createInitialShipState(config),
    missionOffers: [],
    missions,
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  }
}

describe('Mission Goal System', () => {
  // Station-position prediction has moved into the planner (see
  // movementPlanner/targets.ts:orbitingTarget). Tests for the math live
  // alongside the planner; this suite covers mission-goal generation.

  describe('computeMissionGoals', () => {
    it('should return empty goals when player has no missions', () => {
      const player = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      })
      const gameState = createTestGameState([player])

      const goals = computeMissionGoals(player, gameState)
      expect(goals).toEqual([])
    })

    it('should create destroy_target goal for destroy mission', () => {
      const target = createTestPlayer('enemy1', 'Enemy', {
        wellId: 'blackhole', ring: 3, sector: 12, facing: 'prograde',
      })
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-1',
          type: 'destroy_ship',
          isCompleted: false,
          targetPlayerId: 'enemy1',
        },
      ])

      const gameState = createTestGameState([bot, target])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(1)
      expect(goals[0].type).toBe('destroy_target')
      expect(goals[0].targetPlayerId).toBe('enemy1')
      expect(goals[0].missionId).toBe('mission-1')
      expect(goals[0].estimatedTurns).toBeGreaterThan(0)
    })

    it('should skip completed missions', () => {
      const target = createTestPlayer('enemy1', 'Enemy', {
        wellId: 'blackhole', ring: 3, sector: 12, facing: 'prograde',
      })
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-1',
          type: 'destroy_ship',
          isCompleted: true,
          targetPlayerId: 'enemy1',
        },
      ])

      const gameState = createTestGameState([bot, target])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(0)
    })

    it('should skip destroy mission if target is dead', () => {
      const target = createTestPlayer('enemy1', 'Enemy', {
        wellId: 'blackhole', ring: 3, sector: 12, facing: 'prograde',
      })
      target.ship.hitPoints = 0 // Dead

      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-1',
          type: 'destroy_ship',
          isCompleted: false,
          targetPlayerId: 'enemy1',
        },
      ])

      const gameState = createTestGameState([bot, target])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(0)
    })

    it('should create pickup_cargo goal for undelivered cargo mission', () => {
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-2',
          type: 'deliver_cargo',
          isCompleted: false,
          pickupPlanetId: 'planet-alpha',
          deliveryPlanetId: 'planet-beta',
          cargoId: 'cargo-1',
        },
      ])
      // No cargo picked up yet
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', isPickedUp: false }]

      const gameState = createTestGameState([bot])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(1)
      expect(goals[0].type).toBe('pickup_cargo')
      expect(goals[0].targetWellId).toBe('planet-alpha')
      expect(goals[0].missionId).toBe('mission-2')
    })

    it('should create deliver_cargo goal when cargo is picked up', () => {
      // Bot is right at the BH→planet-beta transfer point on alpha (R3 S18)
      // so the planner can land it on planet-beta R1 within its budget.
      // (The planner now omits goals it cannot reach; we test reachability
      // separately above.)
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'planet-alpha', ring: 3, sector: 18, facing: 'prograde',
      }, [
        {
          id: 'mission-2',
          type: 'deliver_cargo',
          isCompleted: false,
          pickupPlanetId: 'planet-alpha',
          deliveryPlanetId: 'planet-beta',
          cargoId: 'cargo-1',
        },
      ])
      // Cargo already picked up
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', isPickedUp: true }]

      const gameState = createTestGameState([bot])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(1)
      expect(goals[0].type).toBe('deliver_cargo')
      expect(goals[0].targetWellId).toBe('planet-beta')
    })

    it('should sort goals by estimated turns (most urgent first)', () => {
      const target = createTestPlayer('enemy1', 'Enemy', {
        wellId: 'blackhole', ring: 3, sector: 6, facing: 'prograde',
      })
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-1',
          type: 'destroy_ship',
          isCompleted: false,
          targetPlayerId: 'enemy1',
        },
        {
          id: 'mission-2',
          type: 'deliver_cargo',
          isCompleted: false,
          pickupPlanetId: 'planet-alpha',
          deliveryPlanetId: 'planet-beta',
          cargoId: 'cargo-1',
        },
      ])
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', isPickedUp: false }]

      const gameState = createTestGameState([bot, target])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(2)
      // Should be sorted by estimatedTurns ascending
      expect(goals[0].estimatedTurns).toBeLessThanOrEqual(goals[1].estimatedTurns)
    })
  })

  describe('selectCurrentGoal', () => {
    const destroyGoal = {
      type: 'destroy_target' as const,
      missionId: 'm1',
      targetPlayerId: 'enemy1',
      estimatedTurns: 5,
    }
    const pickupGoal = {
      type: 'pickup_cargo' as const,
      missionId: 'm2',
      targetWellId: 'planet-alpha' as const,
      targetRing: 1,
      targetSector: 0,
      estimatedTurns: 3,
    }
    const deliverGoal = {
      type: 'deliver_cargo' as const,
      missionId: 'm3',
      targetWellId: 'planet-beta' as const,
      targetRing: 1,
      targetSector: 0,
      estimatedTurns: 8,
    }

    it('should return null for empty goals', () => {
      expect(selectCurrentGoal([], 'auto')).toBeNull()
    })

    // Cargo-in-hand commitment: deliver_cargo trumps every other goal
    // regardless of strategy. The bot has invested ~25-30 turns getting
    // the pickup; bailing now means starting over. Tests below use
    // pickupGoal+destroyGoal (no deliver_cargo) when exercising strategy
    // tie-breakers.
    it('deliver_cargo always wins when cargo is in hand', () => {
      const goals = [pickupGoal, destroyGoal, deliverGoal]
      for (const strategy of ['auto', 'combat', 'cargo', 'balanced'] as const) {
        const result = selectCurrentGoal(goals, strategy)
        expect(result?.type).toBe('deliver_cargo')
      }
    })

    it('should pick cheapest goal with auto strategy (no in-progress goal)', () => {
      const goals = [pickupGoal, destroyGoal]
      // Sorted by estimatedTurns: pickup(3), destroy(5)
      const result = selectCurrentGoal(goals, 'auto')
      expect(result).toEqual(goals[0])
    })

    it('should prefer destroy missions with combat strategy (no in-progress goal)', () => {
      const goals = [pickupGoal, destroyGoal]
      const result = selectCurrentGoal(goals, 'combat')
      expect(result?.type).toBe('destroy_target')
    })

    it('should prefer cargo missions with cargo strategy (no in-progress goal)', () => {
      const goals = [destroyGoal, pickupGoal]
      const result = selectCurrentGoal(goals, 'cargo')
      expect(result?.type).toBe('pickup_cargo')
    })

    it('should fall back to first goal if preferred type not found', () => {
      const goals = [destroyGoal]
      const result = selectCurrentGoal(goals, 'cargo')
      // No cargo goal, falls back to first
      expect(result).toEqual(destroyGoal)
    })

    it('should select deliver_cargo with cargo strategy', () => {
      const goals = [destroyGoal, deliverGoal]
      const result = selectCurrentGoal(goals, 'cargo')
      expect(result?.type).toBe('deliver_cargo')
    })
  })
})
