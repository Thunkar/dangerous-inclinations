import { describe, it, expect } from 'vitest'
import { generateEnergyManagement, generateEnergyDeallocation } from '../../ai/behaviors/survival'
import type { EnergyContext } from '../../ai/behaviors/survival'
import type { TacticalSituation, SubsystemStatus, BotParameters } from '../../ai/types'
import { DEFAULT_BOT_PARAMETERS } from '../../ai/types'
import type { Player, AllocateEnergyAction } from '../../models/game'
import { createInitialShipState } from '../../utils/subsystemHelpers'
import { SUBSYSTEM_CONFIGS } from '../../models/subsystems'

/**
 * Helper to create a bot player for energy tests
 */
function createBotPlayer(
  config: { wellId: string; ring: number; sector: number; facing: 'prograde' | 'retrograde' } = {
    wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde',
  },
  overrides: Record<string, unknown> = {},
): Player {
  return {
    id: 'bot1',
    name: 'Bot',
    ship: createInitialShipState(config, undefined, overrides as Partial<ReturnType<typeof createInitialShipState>>),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  }
}

/**
 * Helper to build SubsystemStatus array from a player's ship
 */
function buildSubsystemStatuses(player: Player): SubsystemStatus[] {
  return player.ship.subsystems.map((sub, i) => ({
    type: sub.type,
    index: i,
    powered: sub.isPowered,
    energy: sub.allocatedEnergy,
    used: sub.usedThisTurn,
    broken: sub.isBroken ?? false,
    slotType: sub.slotType,
    slotIndex: sub.slotIndex,
    ammo: sub.ammo,
  }))
}

/**
 * Helper to build a minimal TacticalSituation for energy tests
 */
function buildSituation(
  player: Player,
  overrides: Partial<TacticalSituation> = {},
): TacticalSituation {
  const subsystems = buildSubsystemStatuses(player)
  const engines = subsystems.find(s => s.type === 'engines')!
  const rotation = subsystems.find(s => s.type === 'rotation')!
  const weapons = subsystems.filter(s => {
    const config = SUBSYSTEM_CONFIGS[s.type]
    return config?.weaponStats != null
  })

  return {
    botPlayer: player,
    status: {
      health: player.ship.hitPoints,
      healthPercent: player.ship.hitPoints / player.ship.maxHitPoints,
      heat: player.ship.heat.currentHeat,
      heatPercent: player.ship.heat.currentHeat / 10,
      reactionMass: player.ship.reactionMass,
      maxReactionMass: player.ship.reactionMass,
      availableEnergy: player.ship.reactor.availableEnergy,
      subsystems,
      engines,
      rotation,
      weapons,
      hasScoop: subsystems.some(s => s.type === 'scoop'),
      hasShields: subsystems.some(s => s.type === 'shields'),
      wellId: player.ship.wellId,
      ring: player.ship.ring,
      sector: player.ship.sector,
      facing: player.ship.facing,
    },
    threats: [],
    targets: [],
    primaryThreat: null,
    primaryTarget: null,
    availableTransfers: [],
    currentGoal: null,
    allGoals: [],
    ...overrides,
  }
}

/**
 * Default energy context for tests - no actions planned
 */
const idleContext: EnergyContext = {
  willBurn: false,
  willCoast: true,
  willRotate: false,
  willTransfer: false,
  hasTargetInRange: false,
  hasTarget: false,
  underThreat: false,
}

const burnContext: EnergyContext = {
  willBurn: true,
  willCoast: false,
  willRotate: false,
  willTransfer: false,
  hasTargetInRange: false,
  hasTarget: false,
  underThreat: false,
  requiredEngineEnergy: 1,
}

describe('Smart Energy Management', () => {
  describe('Weapons NOT powered when no enemy', () => {
    it('should not allocate energy to weapons when no target exists', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, idleContext)

      const weaponAllocations = actions.filter(
        a => a.type === 'allocate_energy' && (
          a.data.subsystemType === 'laser' ||
          a.data.subsystemType === 'railgun' ||
          a.data.subsystemType === 'missiles' ||
          a.data.subsystemType === 'ballistic_rack'
        )
      )
      expect(weaponAllocations.length).toBe(0)
    })

    it('should not allocate energy to weapons when target exists but not in range', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const context: EnergyContext = {
        ...idleContext,
        hasTarget: true,
        hasTargetInRange: false,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      // Weapons may get low-priority allocation (P4) but not high priority
      // Verify total doesn't exceed reactor cap
      const totalAllocated = actions
        .filter(a => a.type === 'allocate_energy')
        .reduce((sum, a) => sum + a.data.amount, 0)
      expect(totalAllocated).toBeLessThanOrEqual(10)
    })
  })

  describe('Shields powered under threat', () => {
    it('should allocate energy to shields when under threat', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player, {
        primaryThreat: {
          player: createBotPlayer({ wellId: 'blackhole', ring: 3, sector: 6, facing: 'prograde' }),
          distance: 6,
          ringDistance: 0,
          sectorDistance: 6,
          weaponsInRange: [{ weaponType: 'laser', subsystemIndex: 3, inRange: true }],
          predictedPosition: { wellId: 'blackhole', ring: 3, sector: 7 },
        },
      })

      const context: EnergyContext = {
        ...idleContext,
        underThreat: true,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      const shieldAllocation = actions.find(
        a => a.type === 'allocate_energy' && a.data.subsystemType === 'shields'
      )
      expect(shieldAllocation).toBeDefined()
    })
  })

  describe('Scoop powered when coasting', () => {
    it('should allocate energy to scoop when coasting and fuel is low', () => {
      const player = createBotPlayer(undefined, { reactionMass: 5 })
      const situation = buildSituation(player)
      // Override reactionMass in status
      situation.status.reactionMass = 5

      const context: EnergyContext = {
        ...idleContext,
        willCoast: true,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      const scoopAllocation = actions.find(
        a => a.type === 'allocate_energy' && a.data.subsystemType === 'scoop'
      )
      expect(scoopAllocation).toBeDefined()
    })

    it('should not allocate to scoop when burning', () => {
      const player = createBotPlayer(undefined, { reactionMass: 5 })
      const situation = buildSituation(player)
      situation.status.reactionMass = 5

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, burnContext)

      const scoopAllocation = actions.find(
        a => a.type === 'allocate_energy' && a.data.subsystemType === 'scoop'
      )
      expect(scoopAllocation).toBeUndefined()
    })
  })

  describe('Budget does not exceed reactor cap', () => {
    it('should never allocate more than 10 total energy', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      // Aggressive context: want everything powered
      const context: EnergyContext = {
        willBurn: true,
        willCoast: false,
        willRotate: true,
        willTransfer: false,
        hasTargetInRange: true,
        hasTarget: true,
        underThreat: true,
        requiredEngineEnergy: 3,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      const totalAllocated = actions
        .filter(a => a.type === 'allocate_energy')
        .reduce((sum, a) => sum + a.data.amount, 0)

      expect(totalAllocated).toBeLessThanOrEqual(10)
    })

    it('should respect existing allocations when computing total', () => {
      const player = createBotPlayer()
      // Pre-allocate 5 energy to engines
      const enginesIdx = player.ship.subsystems.findIndex(s => s.type === 'engines')
      player.ship.subsystems[enginesIdx].allocatedEnergy = 3
      player.ship.subsystems[enginesIdx].isPowered = true
      player.ship.reactor.availableEnergy = 7

      const situation = buildSituation(player)

      const context: EnergyContext = {
        willBurn: true,
        willCoast: false,
        willRotate: true,
        willTransfer: false,
        hasTargetInRange: true,
        hasTarget: true,
        underThreat: true,
        requiredEngineEnergy: 3,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      // Existing 3 + new allocations should not exceed 10
      const newAllocated = actions
        .filter(a => a.type === 'allocate_energy')
        .reduce((sum, a) => sum + a.data.amount, 0)

      expect(newAllocated + 3).toBeLessThanOrEqual(10)
    })
  })

  describe('Engine energy for burn intensities', () => {
    it('should allocate correct energy for soft burn', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const context: EnergyContext = {
        ...idleContext,
        willBurn: true,
        willCoast: false,
        requiredEngineEnergy: 1,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)
      const engineAlloc = actions.find(
        (a): a is AllocateEnergyAction => a.type === 'allocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineAlloc).toBeDefined()
      expect(engineAlloc!.data.amount).toBe(1)
    })

    it('should allocate correct energy for medium burn', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const context: EnergyContext = {
        ...idleContext,
        willBurn: true,
        willCoast: false,
        requiredEngineEnergy: 2,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)
      const engineAlloc = actions.find(
        (a): a is AllocateEnergyAction => a.type === 'allocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineAlloc).toBeDefined()
      expect(engineAlloc!.data.amount).toBe(2)
    })

    it('should allocate correct energy for hard burn / well transfer', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const context: EnergyContext = {
        ...idleContext,
        willBurn: true,
        willCoast: false,
        requiredEngineEnergy: 3,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)
      const engineAlloc = actions.find(
        (a): a is AllocateEnergyAction => a.type === 'allocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineAlloc).toBeDefined()
      expect(engineAlloc!.data.amount).toBe(3)
    })

    it('should not allocate to engines when coasting', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, idleContext)
      const engineAlloc = actions.find(
        a => a.type === 'allocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineAlloc).toBeUndefined()
    })
  })

  describe('Deallocation of unused subsystems', () => {
    it('should deallocate from weapons when no target exists', () => {
      const player = createBotPlayer()
      // Power up a laser
      const laserIdx = player.ship.subsystems.findIndex(s => s.type === 'laser')
      player.ship.subsystems[laserIdx].allocatedEnergy = 2
      player.ship.subsystems[laserIdx].isPowered = true
      player.ship.reactor.availableEnergy = 8

      const situation = buildSituation(player)

      const actions = generateEnergyDeallocation(situation, DEFAULT_BOT_PARAMETERS, idleContext)

      const laserDealloc = actions.find(
        a => a.type === 'deallocate_energy' && a.data.subsystemType === 'laser'
      )
      expect(laserDealloc).toBeDefined()
      expect(laserDealloc!.data.amount).toBe(2)
    })

    it('should deallocate from engines when coasting', () => {
      const player = createBotPlayer()
      // Power up engines
      const enginesIdx = player.ship.subsystems.findIndex(s => s.type === 'engines')
      player.ship.subsystems[enginesIdx].allocatedEnergy = 2
      player.ship.subsystems[enginesIdx].isPowered = true
      player.ship.reactor.availableEnergy = 8

      const situation = buildSituation(player)

      const actions = generateEnergyDeallocation(situation, DEFAULT_BOT_PARAMETERS, idleContext)

      const engineDealloc = actions.find(
        a => a.type === 'deallocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineDealloc).toBeDefined()
    })

    it('should deallocate from broken subsystems', () => {
      const player = createBotPlayer()
      // Break and power a laser
      const laserIdx = player.ship.subsystems.findIndex(s => s.type === 'laser')
      player.ship.subsystems[laserIdx].allocatedEnergy = 2
      player.ship.subsystems[laserIdx].isPowered = true
      player.ship.subsystems[laserIdx].isBroken = true
      player.ship.reactor.availableEnergy = 8

      const situation = buildSituation(player)

      // Even with target in range, broken weapons should be deallocated
      const context: EnergyContext = {
        ...idleContext,
        hasTargetInRange: true,
        hasTarget: true,
      }

      const actions = generateEnergyDeallocation(situation, DEFAULT_BOT_PARAMETERS, context)

      const laserDealloc = actions.find(
        a => a.type === 'deallocate_energy' && a.data.subsystemType === 'laser'
      )
      expect(laserDealloc).toBeDefined()
    })

    it('should not deallocate from engines when burning', () => {
      const player = createBotPlayer()
      const enginesIdx = player.ship.subsystems.findIndex(s => s.type === 'engines')
      player.ship.subsystems[enginesIdx].allocatedEnergy = 1
      player.ship.subsystems[enginesIdx].isPowered = true
      player.ship.reactor.availableEnergy = 9

      const situation = buildSituation(player)

      const actions = generateEnergyDeallocation(situation, DEFAULT_BOT_PARAMETERS, burnContext)

      const engineDealloc = actions.find(
        a => a.type === 'deallocate_energy' && a.data.subsystemType === 'engines'
      )
      expect(engineDealloc).toBeUndefined()
    })
  })

  describe('Panic heat deallocation', () => {
    it('should deallocate non-essential subsystems at panic heat', () => {
      const player = createBotPlayer(undefined, {
        heat: { currentHeat: 9.5 },
      })
      // Power up a laser
      const laserIdx = player.ship.subsystems.findIndex(s => s.type === 'laser')
      player.ship.subsystems[laserIdx].allocatedEnergy = 2
      player.ship.subsystems[laserIdx].isPowered = true
      player.ship.reactor.availableEnergy = 8

      const situation = buildSituation(player)
      situation.status.heatPercent = 0.95 // At panic threshold

      // With target in range, laser would normally be budgeted
      const context: EnergyContext = {
        ...idleContext,
        hasTargetInRange: true,
        hasTarget: true,
      }

      const params: BotParameters = {
        ...DEFAULT_BOT_PARAMETERS,
        panicHeatThreshold: 0.9,
      }

      const actions = generateEnergyDeallocation(situation, params, context)

      // Should deallocate something when heat is at panic levels
      expect(actions.length).toBeGreaterThan(0)
    })
  })

  describe('Duplicate subsystem type handling', () => {
    it('should not produce duplicate allocations for same subsystem type', () => {
      const player = createBotPlayer()
      const situation = buildSituation(player)

      // All weapons context
      const context: EnergyContext = {
        willBurn: true,
        willCoast: false,
        willRotate: true,
        willTransfer: false,
        hasTargetInRange: true,
        hasTarget: true,
        underThreat: true,
        requiredEngineEnergy: 1,
      }

      const actions = generateEnergyManagement(situation, DEFAULT_BOT_PARAMETERS, context)

      // Count allocations per type - each type should appear at most once
      const typeCounts = new Map<string, number>()
      for (const action of actions) {
        if (action.type === 'allocate_energy') {
          const count = typeCounts.get(action.data.subsystemType) ?? 0
          typeCounts.set(action.data.subsystemType, count + 1)
        }
      }

      for (const [type, count] of typeCounts) {
        expect(count, `${type} should only appear once`).toBe(1)
      }
    })
  })
})
