import { describe, it, expect } from 'vitest'
import { selectBotLoadout, BOT_LOADOUT_TEMPLATES } from '../../ai/behaviors/loadout'
import { validateLoadout } from '../../game/loadout'
import type { Mission } from '../../models/missions'

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

    it('all templates should have 2 forward and 4 side slots', () => {
      for (const [name, template] of Object.entries(BOT_LOADOUT_TEMPLATES)) {
        expect(template.forwardSlots.length, `${name} forward slots`).toBe(2)
        expect(template.sideSlots.length, `${name} side slots`).toBe(4)
      }
    })
  })

  describe('Template Contents', () => {
    it('combat template should have railgun and weapons focus', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.combat
      expect(forwardSlots).toContain('railgun')
      expect(forwardSlots).toContain('sensor_array')
      expect(sideSlots).toContain('shields')
      expect(sideSlots).toContain('missiles')
    })

    it('cargo template should have sensor_array and fuel_compressor (scoop is now fixed)', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.cargo
      expect(forwardSlots).toContain('sensor_array')
      expect(sideSlots).toContain('fuel_compressor')
      expect(sideSlots).toContain('shields')
    })

    it('balanced template should have railgun and sensor_array', () => {
      const { forwardSlots, sideSlots } = BOT_LOADOUT_TEMPLATES.balanced
      expect(forwardSlots).toContain('railgun')
      expect(forwardSlots).toContain('sensor_array')
      expect(sideSlots).toContain('shields')
    })

    it('aggressive template should have ballistic_rack', () => {
      const { sideSlots } = BOT_LOADOUT_TEMPLATES.aggressive
      expect(sideSlots).toContain('ballistic_rack')
    })
  })

  describe('selectBotLoadout', () => {
    it('should return balanced for no missions', () => {
      const result = selectBotLoadout([])
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.balanced)
    })

    it('should return balanced for all completed missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: true, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.balanced)
    })

    it('should return aggressive for 2+ destroy missions only', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.aggressive)
    })

    it('should return combat for majority destroy missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
        { id: 'm3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p2' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.combat)
    })

    it('should return cargo for majority cargo missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'beta', deliveryPlanetId: 'gamma', cargoId: 'c2' },
        { id: 'm3', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.cargo)
    })

    it('should return balanced for equal destroy/cargo missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
        { id: 'm2', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.balanced)
    })

    it('should only consider incomplete missions', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p1' },
        { id: 'm2', type: 'destroy_ship', isCompleted: true, targetPlayerId: 'p2' },
        { id: 'm3', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'alpha', deliveryPlanetId: 'beta', cargoId: 'c1' },
      ]
      const result = selectBotLoadout(missions)
      // Only 1 incomplete cargo mission → cargo
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.cargo)
    })

    it('should return combat for single destroy mission (not enough for aggressive)', () => {
      const missions: Mission[] = [
        { id: 'm1', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'p1' },
      ]
      const result = selectBotLoadout(missions)
      // 1 destroy, 0 cargo → destroy > cargo → combat
      expect(result).toBe(BOT_LOADOUT_TEMPLATES.combat)
    })
  })
})
