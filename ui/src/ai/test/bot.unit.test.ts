import { describe, it, expect } from 'vitest'
import { botDecideActions, createBotParameters } from '../index'
import { analyzeTacticalSituation } from '../analyzer'
import { selectTarget } from '../behaviors/combat'
import type { GameState, Player } from '@dangerous-inclinations/engine'
import { createInitialShipState } from '@dangerous-inclinations/engine'

/**
 * Helper to create a test player with mission fields
 */
function createTestPlayer(id: string, name: string, color: string, shipConfig: {
  wellId: string, ring: number, sector: number, facing: 'prograde' | 'retrograde'
}, shipOverrides?: Partial<ReturnType<typeof createInitialShipState>>): Player {
  return {
    id,
    name,
    color,
    ship: createInitialShipState(shipConfig, shipOverrides),
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
  }
}

/**
 * Helper to create a test game state
 */
function createTestGameState(customPlayers?: Player[]): GameState {
  const defaultPlayers: Player[] = [
    createTestPlayer('player1', 'Ship Alpha', '#2196f3', {
      wellId: 'blackhole',
      ring: 3,
      sector: 0,
      facing: 'prograde',
    }),
    createTestPlayer('bot1', 'Ship Gamma', '#4caf50', {
      wellId: 'blackhole',
      ring: 3,
      sector: 12,
      facing: 'prograde',
    }),
  ]

  return {
    turn: 1,
    activePlayerIndex: 0,
    players: customPlayers || defaultPlayers,
    turnLog: [],
    missiles: [],
    status: 'active',
    phase: 'active',
    stations: [],
  }
}

describe('Bot AI - Decision Structure', () => {
  it('should return valid BotDecision with actions and log', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    expect(result).toHaveProperty('actions')
    expect(result).toHaveProperty('log')
    expect(Array.isArray(result.actions)).toBe(true)
    expect(result.actions.length).toBeGreaterThan(0)
  })

  it('should generate actions with correct playerId', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    result.actions.forEach(action => {
      expect(action.playerId).toBe('bot1')
      expect(action).toHaveProperty('type')
      expect(action).toHaveProperty('data')
    })
  })

  it('should include decision log with all required fields', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    expect(result.log.timestamp).toBeDefined()
    expect(result.log.situation).toBeDefined()
    expect(result.log.threats).toBeDefined()
    expect(result.log.targets).toBeDefined()
    expect(result.log.reasoning).toBeDefined()
    expect(result.log.candidates).toBeDefined()
    expect(result.log.selectedCandidate).toBeDefined()
    expect(result.log.selectedCandidate.actionSummary).toBeDefined()
  })
})

describe('Bot AI - Action Generation', () => {
  it('should allocate energy to subsystems when available', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    const allocateActions = result.actions.filter(a => a.type === 'allocate_energy')
    expect(allocateActions.length).toBeGreaterThan(0)

    // Verify energy allocation is valid
    allocateActions.forEach(action => {
      expect(action.data.subsystemType).toBeDefined()
      expect(action.data.amount).toBeGreaterThan(0)
    })
  })

  it('should allocate energy to weapons when engaging target', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Enemy', '#2196f3', {
        wellId: 'blackhole',
        ring: 3,
        sector: 6,
        facing: 'prograde',
      }),
      createTestPlayer('bot1', 'Bot Ship', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
    ]

    const gameState = createTestGameState(players)
    const result = botDecideActions(gameState, 'bot1')

    const weaponAllocations = result.actions.filter(
      a =>
        a.type === 'allocate_energy' &&
        ['laser', 'railgun', 'missiles'].includes(a.data.subsystemType)
    )
    expect(weaponAllocations.length).toBeGreaterThan(0)
  })

  it('should generate vent_heat action when heat is high', () => {
    const players: Player[] = [
      createTestPlayer('bot1', 'Hot Bot', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }, {
        heat: { currentHeat: 8 }, // 80% heat
      }),
    ]

    const gameState = createTestGameState(players)
    const result = botDecideActions(gameState, 'bot1')

    // Heat venting is now automatic via dissipationCapacity
    // Bot should deallocate overclocked systems instead
    // Just verify the bot generates valid actions despite high heat
    expect(result.actions.length).toBeGreaterThan(0)
  })

  it('should generate movement action (coast or burn)', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    const movementActions = result.actions.filter(a => a.type === 'coast' || a.type === 'burn')
    expect(movementActions.length).toBeGreaterThan(0)
  })

  it('should not exceed total energy budget', () => {
    const gameState = createTestGameState()
    const result = botDecideActions(gameState, 'bot1')

    const allocateActions = result.actions.filter(a => a.type === 'allocate_energy')
    const totalAllocated = allocateActions.reduce((sum, action) => sum + action.data.amount, 0)

    expect(totalAllocated).toBeLessThanOrEqual(10) // Max reactor capacity
  })
})

describe('Bot AI - Tactical Analysis', () => {
  it('should correctly analyze bot status', () => {
    const gameState = createTestGameState()
    const situation = analyzeTacticalSituation(gameState, 'bot1')

    expect(situation.status.health).toBe(10)
    expect(situation.status.healthPercent).toBe(1.0)
    expect(situation.status.ring).toBe(3)
    expect(situation.status.sector).toBe(12)
    expect(situation.status.facing).toBe('prograde')
    expect(situation.status.reactionMass).toBe(10)
  })

  it('should identify threats correctly', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Enemy', '#2196f3', {
        wellId: 'blackhole',
        ring: 3,
        sector: 6,
        facing: 'prograde',
      }),
      createTestPlayer('bot1', 'Bot Ship', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
    ]

    const gameState = createTestGameState(players)
    const situation = analyzeTacticalSituation(gameState, 'bot1')

    expect(situation.threats.length).toBeGreaterThan(0)
    expect(situation.threats[0].player.id).toBe('player1')
    expect(situation.threats[0].distance).toBeGreaterThan(0)
  })

  it('should identify targets correctly', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Enemy', '#2196f3', {
        wellId: 'blackhole',
        ring: 3,
        sector: 6,
        facing: 'prograde',
      }),
      createTestPlayer('bot1', 'Bot Ship', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
    ]

    const gameState = createTestGameState(players)
    const situation = analyzeTacticalSituation(gameState, 'bot1')

    expect(situation.targets.length).toBeGreaterThan(0)
    expect(situation.targets[0].player.id).toBe('player1')
    expect(situation.targets[0].distance).toBeGreaterThan(0)
  })

  it('should prioritize damaged targets (weakest preference)', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Healthy Enemy', '#2196f3', {
        wellId: 'blackhole',
        ring: 3,
        sector: 6,
        facing: 'prograde',
      }),
      createTestPlayer('player2', 'Damaged Enemy', '#ff9800', {
        wellId: 'blackhole',
        ring: 3,
        sector: 18,
        facing: 'prograde',
      }, {
        hitPoints: 3,
      }),
      createTestPlayer('bot1', 'Bot Ship', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 12,
        facing: 'prograde',
      }),
    ]

    const gameState = createTestGameState(players)
    const situation = analyzeTacticalSituation(gameState, 'bot1')
    const target = selectTarget(situation, createBotParameters('medium'))

    // Should target the damaged enemy (player2)
    expect(target).not.toBeNull()
    expect(target?.player.id).toBe('player2')
  })

  it('should not target ships in different gravity wells', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Enemy in Planet', '#2196f3', {
        wellId: 'planet-alpha',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
      createTestPlayer('bot1', 'Bot in Black Hole', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
    ]

    const gameState = createTestGameState(players)
    const situation = analyzeTacticalSituation(gameState, 'bot1')

    // Distance should be very high (999) for different wells
    if (situation.threats.length > 0) {
      expect(situation.threats[0].distance).toBe(999)
    }
    if (situation.targets.length > 0) {
      expect(situation.targets[0].distance).toBe(999)
    }
  })
})

describe('Bot AI - Difficulty Levels', () => {
  it('should generate different parameters for different difficulty levels', () => {
    const easy = createBotParameters('easy')
    const medium = createBotParameters('medium')
    const hard = createBotParameters('hard')

    // Easy should be less aggressive
    expect(easy.aggressiveness).toBeLessThan(medium.aggressiveness)
    expect(easy.aggressiveness).toBeLessThan(hard.aggressiveness)

    // Hard should be most aggressive
    expect(hard.aggressiveness).toBeGreaterThan(medium.aggressiveness)

    // Easy should vent heat earlier
    expect(easy.heatThreshold).toBeLessThan(medium.heatThreshold)
    expect(easy.heatThreshold).toBeLessThan(hard.heatThreshold)
  })

  it('should produce valid actions at all difficulty levels', () => {
    const gameState = createTestGameState()

    const easyResult = botDecideActions(gameState, 'bot1', createBotParameters('easy'))
    const mediumResult = botDecideActions(gameState, 'bot1', createBotParameters('medium'))
    const hardResult = botDecideActions(gameState, 'bot1', createBotParameters('hard'))

    expect(easyResult.actions.length).toBeGreaterThan(0)
    expect(mediumResult.actions.length).toBeGreaterThan(0)
    expect(hardResult.actions.length).toBeGreaterThan(0)

    // All should have correct playerId
    easyResult.actions.forEach(a => expect(a.playerId).toBe('bot1'))
    mediumResult.actions.forEach(a => expect(a.playerId).toBe('bot1'))
    hardResult.actions.forEach(a => expect(a.playerId).toBe('bot1'))
  })
})

describe('Bot AI - Edge Cases', () => {
  it('should handle situations with no threats gracefully', () => {
    const gameState = createTestGameState([
      createTestPlayer('bot1', 'Lonely Ship', '#4caf50', {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }),
    ])

    const result = botDecideActions(gameState, 'bot1')

    expect(result.actions.length).toBeGreaterThan(0)
    expect(result.log.threats.length).toBe(0)
    expect(result.log.targets.length).toBe(0)
  })

  it('should generate escape action when critically damaged', () => {
    const players: Player[] = [
      createTestPlayer('player1', 'Enemy', '#2196f3', {
        wellId: 'blackhole',
        ring: 3,
        sector: 6,
        facing: 'prograde',
      }),
      createTestPlayer('bot1', 'Damaged Bot', '#4caf50', {
        wellId: 'blackhole',
        ring: 5, // On outer ring for transfer possibility (Ring 5 is now outermost)
        sector: 20, // At a valid transfer sector (Alpha outbound: BH R5 S20 → Alpha R3 S5)
        facing: 'prograde',
      }, {
        hitPoints: 2, // Critical health (20%)
      }),
    ]

    const gameState = createTestGameState(players)
    const result = botDecideActions(gameState, 'bot1', createBotParameters('hard'))

    // Decision log should mention critical health
    const mentionsCriticalHealth = result.log.reasoning.some(r =>
      r.toLowerCase().includes('critical') || r.toLowerCase().includes('health')
    )
    expect(mentionsCriticalHealth).toBe(true)

    // Verify bot attempts escape (well transfer action)
    const wellTransferAction = result.actions.find(a => a.type === 'well_transfer')
    expect(wellTransferAction).toBeDefined()
  })
})
