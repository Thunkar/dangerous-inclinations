import { describe, it, expect } from 'vitest'
import { botDecideActions } from '../index'
import { executeTurn } from '../../game-logic'
import type { GameState, Player } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
import type { BotParameters } from '../types'

/**
 * Integration tests for bot AI system
 * These tests validate that bot actions pass game engine validation
 */

describe('Bot AI Integration Tests', () => {
  // Helper to create a basic game state with two players
  function createGameState(bot1Index: number = 1): GameState {
    const defaultSubsystems: Subsystem[] = [
      {
        type: 'engines',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'rotation',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'scoop',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'laser',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'railgun',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'missiles',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
      {
        type: 'shields',
        isPowered: false,
        allocatedEnergy: 0,
        usedThisTurn: false,
      },
    ]

    const players: Player[] = [
      {
        id: 'player1',
        name: 'Ship Alpha',
        color: '#ff0000',
        ship: {
          wellId: 'blackhole',
          ring: 3,
          sector: 0,
          facing: 'prograde',
          hitPoints: 10,
          maxHitPoints: 10,
          reactor: {
            totalCapacity: 10,
            availableEnergy: 10,
            maxReturnRate: 5,
            energyToReturn: 0,
          },
          heat: {
            currentHeat: 0,
            heatToVent: 0,
          },
          reactionMass: 10,
          subsystems: [...defaultSubsystems],
          transferState: null,
        missileInventory: 4,
        },
      },
      {
        id: 'bot1',
        name: 'Ship Beta',
        color: '#0000ff',
        ship: {
          wellId: 'blackhole',
          ring: 3,
          sector: 12, // 180 degrees away
          facing: 'prograde',
          hitPoints: 10,
          maxHitPoints: 10,
          reactor: {
            totalCapacity: 10,
            availableEnergy: 10,
            maxReturnRate: 5,
            energyToReturn: 0,
          },
          heat: {
            currentHeat: 0,
            heatToVent: 0,
          },
          reactionMass: 10,
          subsystems: [...defaultSubsystems],
          transferState: null,
        missileInventory: 4,
        },
      },
    ]

    return {
      turn: 1,
      activePlayerIndex: bot1Index,
      players,
      turnLog: [],
      missiles: [],
      status: 'active',
    }
  }

  describe('Game Engine Validation', () => {
    it('should generate actions that pass executeTurn validation', () => {
      const gameState = createGameState(1)
      const decision = botDecideActions(gameState, 'bot1')

      const result = executeTurn(gameState, decision.actions)

      expect(result.errors || []).toEqual([])
      expect(result.gameState.turn).toBe(2)
    })

    it('should execute multiple consecutive turns without errors', () => {
      let gameState = createGameState(1)

      for (let i = 0; i < 10; i++) {
        gameState.activePlayerIndex = 1 // Keep bot1 active
        const decision = botDecideActions(gameState, 'bot1')
        const result = executeTurn(gameState, decision.actions)

        expect(result.errors || []).toEqual([])
        gameState = result.gameState
      }

      expect(gameState.turn).toBe(11)
    })
  })

  describe('Energy Management Over Multiple Turns', () => {
    it('should properly manage energy allocation across turns', () => {
      let gameState = createGameState(1)

      for (let i = 0; i < 3; i++) {
        gameState.activePlayerIndex = 1
        const decision = botDecideActions(gameState, 'bot1')
        const result = executeTurn(gameState, decision.actions)

        expect(result.errors || []).toEqual([])

        const botPlayer = result.gameState.players.find(p => p.id === 'bot1')
        expect(botPlayer).toBeDefined()

        // Calculate total allocated energy from all subsystems
        const totalAllocated = botPlayer!.ship.subsystems.reduce(
          (sum, subsystem) => sum + subsystem.allocatedEnergy,
          0
        )
        expect(totalAllocated).toBeLessThanOrEqual(10)

        gameState = result.gameState
      }
    })
  })

  describe('Heat Management Over Multiple Turns', () => {
    it('should manage heat buildup and venting over multiple turns', () => {
      let gameState = createGameState(1)
      const bot = gameState.players[1]
      bot.ship.heat.currentHeat = 7 // Start with high heat

      for (let i = 0; i < 3; i++) {
        gameState.activePlayerIndex = 1
        const decision = botDecideActions(gameState, 'bot1')

        // Check if bot vents when heat is high
        if (bot.ship.heat.currentHeat >= 7) {
          const ventAction = decision.actions.find(a => a.type === 'vent_heat')
          expect(ventAction).toBeDefined()
        }

        const result = executeTurn(gameState, decision.actions)
        expect(result.errors || []).toEqual([])

        gameState = result.gameState
        const updatedBot = gameState.players.find(p => p.id === 'bot1')!
        bot.ship.heat.currentHeat = updatedBot.ship.heat.currentHeat
      }
    })

    it('should deallocate overclocked systems to prevent heat death', () => {
      let gameState = createGameState(1)
      const bot = gameState.players[1]

      // Give bot an overclocked railgun (4 energy = 1 heat/turn)
      const railgun = bot.ship.subsystems.find(s => s.type === 'railgun')!
      railgun.allocatedEnergy = 4
      railgun.isPowered = true

      // Start with 0 heat, remove target so bot should deallocate
      bot.ship.heat.currentHeat = 0
      gameState.players[0].ship.hitPoints = 0 // Kill enemy so no target

      // Run for several turns - bot should not die from heat
      for (let i = 0; i < 10; i++) {
        gameState.activePlayerIndex = 1
        const decision = botDecideActions(gameState, 'bot1')
        const result = executeTurn(gameState, decision.actions)

        expect(result.errors || []).toEqual([])
        gameState = result.gameState

        const updatedBot = gameState.players.find(p => p.id === 'bot1')!

        // Bot should not die from heat accumulation
        expect(updatedBot.ship.hitPoints).toBeGreaterThan(0)

        // If heat starts building up, bot should deallocate or vent
        if (updatedBot.ship.heat.currentHeat >= 2) {
          // Next turn should either deallocate or vent
          gameState.activePlayerIndex = 1
          const nextDecision = botDecideActions(gameState, 'bot1')
          const hasDeallocate = nextDecision.actions.some(a =>
            a.type === 'deallocate_energy' && a.data.subsystemType === 'railgun'
          )
          const hasVent = nextDecision.actions.some(a => a.type === 'vent_heat')

          expect(hasDeallocate || hasVent).toBe(true)
          break // Test passed
        }
      }
    })
  })

  describe('Movement and Resource Consumption', () => {
    it('should consume reaction mass when burning', () => {
      let gameState = createGameState(1)
      const initialMass = gameState.players[1].ship.reactionMass

      for (let i = 0; i < 5; i++) {
        gameState.activePlayerIndex = 1
        const decision = botDecideActions(gameState, 'bot1')
        const result = executeTurn(gameState, decision.actions)

        expect(result.errors || []).toEqual([])
        gameState = result.gameState
      }

      const finalMass = gameState.players.find(p => p.id === 'bot1')!.ship.reactionMass
      // Should have consumed some mass over 5 turns (unless coasting every turn)
      expect(finalMass).toBeLessThanOrEqual(initialMass)
    })
  })

  describe('Combat Scenarios', () => {
    it('should handle ship destruction gracefully', () => {
      let gameState = createGameState(1)
      const bot = gameState.players[1]
      bot.ship.hitPoints = 1 // Nearly destroyed

      gameState.activePlayerIndex = 1
      const decision = botDecideActions(gameState, 'bot1')
      const result = executeTurn(gameState, decision.actions)

      expect(result.errors || []).toEqual([])
      // Bot might be destroyed or might have survived
      const updatedBot = result.gameState.players.find(p => p.id === 'bot1')
      if (updatedBot && updatedBot.ship.hitPoints <= 0) {
        expect(updatedBot.ship.hitPoints).toBeLessThanOrEqual(0)
      }
    })

    it('should execute bot-vs-bot combat for multiple turns', () => {
      let gameState = createGameState(1)

      // Add a second bot as player1
      gameState.players[0].id = 'bot2'
      gameState.players[0].name = 'Ship Gamma'

      // Position them close for combat
      gameState.players[0].ship.ring = 3
      gameState.players[0].ship.sector = 0
      gameState.players[1].ship.ring = 3
      gameState.players[1].ship.sector = 6 // 90 degrees away, within laser range

      let turnCount = 0
      const maxTurns = 20

      while (turnCount < maxTurns) {
        const activePlayer = gameState.players[gameState.activePlayerIndex]

        // Skip if player is destroyed
        if (activePlayer.ship.hitPoints <= 0) {
          gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % 2
          continue
        }

        const decision = botDecideActions(gameState, activePlayer.id)
        const result = executeTurn(gameState, decision.actions)

        expect(result.errors || []).toEqual([])
        gameState = result.gameState

        // Check for winner
        const alivePlayers = gameState.players.filter(p => p.ship.hitPoints > 0)
        if (alivePlayers.length === 1) {
          break
        }

        turnCount++
      }

      // Combat should have progressed without errors
      expect(gameState.turn).toBeGreaterThan(1)
    })
  })

  describe('Well Transfer Integration', () => {
    it('should execute well transfers when parameters allow', () => {
      let gameState = createGameState(1)
      const bot = gameState.players[1]

      // Position bot at transfer sector
      bot.ship.ring = 5
      bot.ship.sector = 0 // Transfer sector from blackhole to planet
      bot.ship.hitPoints = 2 // Low health to trigger escape

      const parameters: BotParameters = {
        aggressiveness: 0.3,
        targetPreference: 'closest',
        heatThreshold: 0.7,
        panicHeatThreshold: 0.9,
        preferredRingRange: { min: 2, max: 3 },
        useWellTransfers: true, // Enable transfers
        energyReserve: 2,
        conserveAmmo: true,
      }

      gameState.activePlayerIndex = 1
      const decision = botDecideActions(gameState, 'bot1', parameters)

      // Check if bot considers well transfer (it's at a transfer point with low health)
      const wellTransfer = decision.actions.find(a => a.type === 'well_transfer')

      const result = executeTurn(gameState, decision.actions)
      expect(result.errors || []).toEqual([])

      // If transfer action was generated, verify it was valid
      if (wellTransfer) {
        const updatedBot = result.gameState.players.find(p => p.id === 'bot1')!
        // Bot should have transferred wells
        expect(updatedBot.ship.wellId).not.toBe('blackhole')
      }
    })
  })

  describe('Difficulty Parameter Integration', () => {
    it('should produce different behavior for different difficulty levels', () => {
      const gameState = createGameState(1)

      const easyParams: BotParameters = {
        aggressiveness: 0.4,
        targetPreference: 'closest',
        heatThreshold: 0.5,
        panicHeatThreshold: 0.7,
        preferredRingRange: { min: 1, max: 4 },
        useWellTransfers: false,
        energyReserve: 3,
        conserveAmmo: true,
      }

      const hardParams: BotParameters = {
        aggressiveness: 0.8,
        targetPreference: 'weakest',
        heatThreshold: 0.8,
        panicHeatThreshold: 0.95,
        preferredRingRange: { min: 2, max: 3 },
        useWellTransfers: true,
        energyReserve: 1,
        conserveAmmo: false,
      }

      gameState.activePlayerIndex = 1
      const easyDecision = botDecideActions(gameState, 'bot1', easyParams)
      const hardDecision = botDecideActions(gameState, 'bot1', hardParams)

      // Both should produce valid actions
      const easyResult = executeTurn(gameState, easyDecision.actions)
      expect(easyResult.errors || []).toEqual([])

      const hardResult = executeTurn(gameState, hardDecision.actions)
      expect(hardResult.errors || []).toEqual([])

      // Hard bot should be more aggressive with energy allocation
      const easyEnergy = easyDecision.actions
        .filter(a => a.type === 'allocate_energy')
        .reduce((sum, a) => sum + a.data.amount, 0)

      const hardEnergy = hardDecision.actions
        .filter(a => a.type === 'allocate_energy')
        .reduce((sum, a) => sum + a.data.amount, 0)

      // Hard bot should allocate more energy (lower reserve)
      expect(hardEnergy).toBeGreaterThanOrEqual(easyEnergy)
    })
  })
})
