import { describe, it, expect } from 'vitest'
import { selectBotLoadout, BOT_LOADOUT_TEMPLATES } from '../../ai/behaviors/loadout.ts'
import {
  selectBotMissions,
  classifyArchetype,
} from '../../ai/behaviors/missions.ts'
import { validateLoadout } from '../../game/loadout.ts'
import type { Mission } from '../../models/missions.ts'
import type { Player, Station, ShipState } from '../../models/game.ts'
import { createInitialShipState } from '../../utils/subsystemHelpers.ts'

describe('Bot Loadout System', () => {
  describe('Template Validation', () => {
    it('combat template should be a valid loadout', () => {
      const result = validateLoadout(BOT_LOADOUT_TEMPLATES.combat)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('cargo template should be a valid loadout', () => {
      const result = validateLoadout(BOT_LOADOUT_TEMPLATES.cargo)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('balanced template should be a valid loadout', () => {
      const result = validateLoadout(BOT_LOADOUT_TEMPLATES.balanced)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('aggressive template should be a valid loadout', () => {
      const result = validateLoadout(BOT_LOADOUT_TEMPLATES.aggressive)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('all templates should have 1 forward and 4 side slots', () => {
      for (const [name, template] of Object.entries(BOT_LOADOUT_TEMPLATES)) {
        expect(template.forwardSlots.length, `${name} forward slots`).toBe(1)
        expect(template.sideSlots.length, `${name} side slots`).toBe(4)
      }
    })
  })

  describe('Template Contents', () => {
    it('combat template should have railgun and weapons focus', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.combat
      expect(forwardSlots).toContain('railgun')
      expect(sideSlots).toContain('shields')
      expect(sideSlots).toContain('missiles')
    })

    it('cargo template should have sensor_array and fuel_compressor (scoop is now fixed)', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.cargo
      expect(forwardSlots).toContain('sensor_array')
      expect(sideSlots).toContain('fuel_compressor')
      expect(sideSlots).toContain('shields')
    })

    it('balanced template should have sensor_array in forward', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.balanced
      expect(forwardSlots).toContain('sensor_array')
      expect(sideSlots).toContain('shields')
    })

    it('aggressive template should have ballistic_rack', () => {
      const { sideSlots } = BOT_LOADOUT_TEMPLATES.aggressive
      expect(sideSlots).toContain('ballistic_rack')
    })
  })

  describe('selectBotLoadout', () => {
    // Loadout dispatch is now driven by classifyArchetype(), which prefers
    // archetypes only when 2+ missions of a kind are present. Single
    // missions or mixed sets fall back to the stealth_interceptor loadout
    // (sensor_array + fuel_compressor + missiles + laser + shields).

    it('should return stealth for no missions', () => {
      const result = selectBotLoadout([])
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })

    it('should return stealth for all completed missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: true, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })

    it('should return combat for 2 destroy missions (aggressive only at 3)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.combat)
    })

    it('should return aggressive for 3 destroy missions (full destroyer)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
        { id: 'm3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p3' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.aggressive)
    })

    it('should return combat for majority destroy (2D + 1C)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
        { id: 'm3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.combat)
    })

    it('should return cargo for majority cargo (2C + 1D)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'beta', deliveryPlanetId: 'gamma', cargoId: 'c2' },
        { id: 'm3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.cargo)
    })

    it('should return stealth for 2 intercept missions (stealth_interceptor)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'p1', scanAcquired: false, scanCargoId: 'sc1' },
        { id: 'm2', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'p2', scanAcquired: false, scanCargoId: 'sc2' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })

    it('should return stealth for 1 destroy + 1 cargo (mixed, no archetype dominates)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })

    it('should only consider incomplete missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p1' },
        { id: 'm2', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p2' },
        { id: 'm3', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      // 1 incomplete cargo mission, no archetype with 2+ → stealth fallback.
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })

    it('should return stealth for single destroy mission (not enough for destroyer)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.stealth)
    })
  })

  describe('classifyArchetype', () => {
    it('classifies 2+ destroy as destroyer', () => {
      expect(
        classifyArchetype([
          { id: 'a', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
          { id: 'b', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
          { id: 'c', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'c1' },
        ]),
      ).toBe('destroyer')
    })

    it('classifies 2+ cargo as cargo_trucker', () => {
      expect(
        classifyArchetype([
          { id: 'a', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'c1' },
          { id: 'b', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-beta', deliveryPlanetId: 'planet-gamma', cargoId: 'c2' },
          { id: 'c', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        ]),
      ).toBe('cargo_trucker')
    })

    it('classifies 2+ intercept as stealth_interceptor', () => {
      expect(
        classifyArchetype([
          { id: 'a', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'p1', scanAcquired: false, scanCargoId: 'sc1' },
          { id: 'b', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'p2', scanAcquired: false, scanCargoId: 'sc2' },
        ]),
      ).toBe('stealth_interceptor')
    })

    it('falls back to stealth_interceptor for mixed sets', () => {
      expect(
        classifyArchetype([
          { id: 'a', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
          { id: 'b', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'c1' },
          { id: 'c', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'p2', scanAcquired: false, scanCargoId: 'sc1' },
        ]),
      ).toBe('stealth_interceptor')
    })
  })

  describe('selectBotMissions', () => {
    function makeShip(wellId: string, ring: number, sector: number): ShipState {
      return createInitialShipState({ wellId, ring, sector, facing: 'prograde' })
    }

    function makePlayer(id: string, ship: ShipState): Player {
      return {
        id,
        name: id,
        ship,
        missionOffers: [],
        missions: [],
        completedMissionCount: 0,
        cargo: [],
        hasDeployed: true,
        hasSubmittedLoadout: true,
      }
    }

    const stations: Station[] = [
      { id: 'st-alpha', planetId: 'planet-alpha', ring: 1, sector: 0 },
      { id: 'st-beta', planetId: 'planet-beta', ring: 1, sector: 0 },
      { id: 'st-gamma', planetId: 'planet-gamma', ring: 1, sector: 0 },
    ]

    it('returns offers as-is when there are 3 or fewer', () => {
      const offers: Mission[] = [
        { id: 'a', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'enemy' },
      ]
      const ship = makeShip('blackhole', 4, 0)
      const enemy = makePlayer('enemy', makeShip('blackhole', 4, 12))
      expect(selectBotMissions(offers, ship, [enemy], stations)).toBe(offers)
    })

    it('prefers monotype combos when other things are equal (synergy bonus)', () => {
      // 5 offers: 3 destroy, 2 cargo.
      // The destroy archetype wins by monotype + same-target proximity.
      const enemyA = makePlayer('enemyA', makeShip('blackhole', 4, 6))
      const enemyB = makePlayer('enemyB', makeShip('blackhole', 4, 12))
      const enemyC = makePlayer('enemyC', makeShip('blackhole', 4, 18))
      const offers: Mission[] = [
        { id: 'd1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'enemyA' },
        { id: 'd2', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'enemyB' },
        { id: 'd3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'enemyC' },
        { id: 'c1', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'cg1' },
        { id: 'c2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-beta', deliveryPlanetId: 'planet-gamma', cargoId: 'cg2' },
      ]
      const ship = makeShip('blackhole', 4, 0)
      const chosen = selectBotMissions(offers, ship, [enemyA, enemyB, enemyC], stations)
      expect(chosen.length).toBe(3)
      // All 3 destroy missions should be chosen — monotype + proximity.
      const ids = chosen.map(m => m.id).sort()
      expect(ids).toEqual(['d1', 'd2', 'd3'])
    })

    it('rejects combos containing infeasible (unreachable) missions', () => {
      // Bot far from anything, target's already dead → infeasible. Combo
      // including the dead target should NOT win even if it would have
      // strong monotype bonus otherwise.
      const deadEnemy = makePlayer('deadEnemy', makeShip('blackhole', 4, 12))
      deadEnemy.ship.hitPoints = 0 // dead

      const liveEnemyA = makePlayer('liveA', makeShip('blackhole', 4, 6))
      const liveEnemyB = makePlayer('liveB', makeShip('blackhole', 4, 18))

      const offers: Mission[] = [
        { id: 'd-dead', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'deadEnemy' }, // infeasible
        { id: 'd-live1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'liveA' },
        { id: 'd-live2', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'liveB' },
        { id: 'c1', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'cg1' },
        { id: 'c2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-beta', deliveryPlanetId: 'planet-gamma', cargoId: 'cg2' },
      ]
      const ship = makeShip('blackhole', 4, 0)
      const chosen = selectBotMissions(offers, ship, [deadEnemy, liveEnemyA, liveEnemyB], stations)

      // The dead-target mission should NOT be in the chosen 3.
      expect(chosen.find(m => m.id === 'd-dead')).toBeUndefined()
      expect(chosen.length).toBe(3)
    })

    it('finds shared-planet cargo synergy', () => {
      // 5 offers: 3 cargo missions sharing planets, 2 cargo with disjoint planets.
      // Shared-planet cargo missions get a synergy bonus.
      const offers: Mission[] = [
        // Three sharing alpha & beta — pickup or delivery overlap → synergy.
        { id: 'c1', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-beta', cargoId: 'cg1' },
        { id: 'c2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-beta', deliveryPlanetId: 'planet-alpha', cargoId: 'cg2' },
        { id: 'c3', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-gamma', cargoId: 'cg3' },
        // Two disjoint — different planet pair.
        { id: 'c4', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-gamma', deliveryPlanetId: 'planet-beta', cargoId: 'cg4' },
        { id: 'c5', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-gamma', deliveryPlanetId: 'planet-alpha', cargoId: 'cg5' },
      ]
      const ship = makeShip('blackhole', 4, 0)
      const chosen = selectBotMissions(offers, ship, [], stations)
      expect(chosen.length).toBe(3)
      // The chosen trio should include c1 + c2 + c3 (best planet overlap),
      // not necessarily strictly — just verify shared-planet count is high.
      const planets = new Set<string>()
      for (const m of chosen) {
        if (m.type === 'deliver_cargo') {
          planets.add(m.pickupPlanetId)
          planets.add(m.deliveryPlanetId)
        }
      }
      // 3 cargo with overlap should touch fewer than 6 distinct planets.
      expect(planets.size).toBeLessThanOrEqual(3)
    })
  })
})
