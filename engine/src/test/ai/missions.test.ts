import { describe, it, expect } from 'vitest'
import {
  computeMissionGoals,
  selectCurrentGoal,
  predictStationPosition,
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
      { id: 'station-alpha', planetId: 'alpha', ring: 1, sector: 0 },
      { id: 'station-beta', planetId: 'beta', ring: 1, sector: 0 },
      { id: 'station-gamma', planetId: 'gamma', ring: 1, sector: 0 },
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
  describe('predictStationPosition', () => {
    it('should predict station position after N turns', () => {
      // Station at sector 0, velocity 1, 6 sectors in ring
      expect(predictStationPosition(0, 3, 6, 1)).toBe(3)
    })

    it('should wrap around when exceeding sector count', () => {
      // Station at sector 4, moves 3 turns at velocity 1 in 6-sector ring
      expect(predictStationPosition(4, 3, 6, 1)).toBe(1) // (4+3) % 6 = 1
    })

    it('should handle velocity > 1', () => {
      // Station at sector 0, velocity 4, 24 sectors
      expect(predictStationPosition(0, 3, 24, 4)).toBe(12) // (0 + 4*3) % 24 = 12
    })

    it('should handle zero turns ahead', () => {
      expect(predictStationPosition(5, 0, 24, 1)).toBe(5)
    })

    it('should handle large turn counts with wrapping', () => {
      // After enough turns, should wrap multiple times
      expect(predictStationPosition(0, 24, 24, 1)).toBe(0) // Full loop
      expect(predictStationPosition(0, 25, 24, 1)).toBe(1) // One past
    })
  })

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
          pickupPlanetId: 'alpha',
          deliveryPlanetId: 'beta',
          cargoId: 'cargo-1',
        },
      ])
      // No cargo picked up yet
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', isPickedUp: false }]

      const gameState = createTestGameState([bot])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(1)
      expect(goals[0].type).toBe('pickup_cargo')
      expect(goals[0].targetWellId).toBe('alpha')
      expect(goals[0].missionId).toBe('mission-2')
    })

    it('should create deliver_cargo goal when cargo is picked up', () => {
      const bot = createTestPlayer('bot1', 'Bot', {
        wellId: 'alpha', ring: 1, sector: 0, facing: 'prograde',
      }, [
        {
          id: 'mission-2',
          type: 'deliver_cargo',
          isCompleted: false,
          pickupPlanetId: 'alpha',
          deliveryPlanetId: 'beta',
          cargoId: 'cargo-1',
        },
      ])
      // Cargo already picked up
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', isPickedUp: true }]

      const gameState = createTestGameState([bot])
      const goals = computeMissionGoals(bot, gameState)

      expect(goals.length).toBe(1)
      expect(goals[0].type).toBe('deliver_cargo')
      expect(goals[0].targetWellId).toBe('beta')
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
          pickupPlanetId: 'alpha',
          deliveryPlanetId: 'beta',
          cargoId: 'cargo-1',
        },
      ])
      bot.cargo = [{ id: 'cargo-1', missionId: 'mission-2', type: 'standard' as const, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', isPickedUp: false }]

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
      targetWellId: 'alpha' as const,
      targetRing: 1,
      targetSector: 0,
      estimatedTurns: 3,
    }
    const deliverGoal = {
      type: 'deliver_cargo' as const,
      missionId: 'm3',
      targetWellId: 'beta' as const,
      targetRing: 1,
      targetSector: 0,
      estimatedTurns: 8,
    }

    it('should return null for empty goals', () => {
      expect(selectCurrentGoal([], 'auto')).toBeNull()
    })

    it('should pick cheapest goal with auto strategy', () => {
      const goals = [pickupGoal, destroyGoal, deliverGoal]
      // Sorted by estimatedTurns: pickup(3), destroy(5), deliver(8)
      const result = selectCurrentGoal(goals, 'auto')
      expect(result).toEqual(goals[0]) // First in array (already sorted by estimatedTurns)
    })

    it('should prefer destroy missions with combat strategy', () => {
      const goals = [pickupGoal, destroyGoal, deliverGoal]
      const result = selectCurrentGoal(goals, 'combat')
      expect(result?.type).toBe('destroy_target')
    })

    it('should prefer cargo missions with cargo strategy', () => {
      const goals = [destroyGoal, pickupGoal, deliverGoal]
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
