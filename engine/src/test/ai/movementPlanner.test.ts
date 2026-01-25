import { describe, it, expect } from 'vitest'
import {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getPredecessors,
  getReachablePositions,
  positionsMatch,
  PriorityQueue,
} from '../../ai/movementPlanner'
import type { OrientedPosition, OrbitalPosition } from '../../ai/movementPlanner/types'

describe('Movement Planner', () => {
  describe('Priority Queue', () => {
    it('should order elements by priority (min-heap)', () => {
      const pq = new PriorityQueue<{ value: number; priority: number }>(
        (a, b) => a.priority - b.priority
      )

      pq.enqueue({ value: 3, priority: 3 })
      pq.enqueue({ value: 1, priority: 1 })
      pq.enqueue({ value: 2, priority: 2 })

      expect(pq.dequeue()?.value).toBe(1)
      expect(pq.dequeue()?.value).toBe(2)
      expect(pq.dequeue()?.value).toBe(3)
    })

    it('should return undefined when empty', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b)
      expect(pq.dequeue()).toBeUndefined()
      expect(pq.peek()).toBeUndefined()
    })

    it('should report correct size', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b)
      expect(pq.size()).toBe(0)
      expect(pq.isEmpty()).toBe(true)

      pq.enqueue(1)
      expect(pq.size()).toBe(1)
      expect(pq.isEmpty()).toBe(false)
    })
  })

  describe('Predecessors', () => {
    it('should find coast predecessors on same ring', () => {
      const target: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8, // Ring 3 velocity = 4, so predecessor was at sector 4
        facing: 'prograde',
      }

      const predecessors = getPredecessors(target, 100, false)

      // Coast predecessors should be at sector 4 (8 - 4 = 4)
      const coastPreds = predecessors.filter(p => p.actionType === 'coast')
      expect(coastPreds.length).toBe(2) // Both facings

      const coastPred = coastPreds[0]
      expect(coastPred.position.sector).toBe(4)
      expect(coastPred.position.ring).toBe(3)
      expect(coastPred.massCost).toBe(0)
    })

    it('should find burn predecessors from adjacent rings', () => {
      const target: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 10,
        facing: 'prograde',
      }

      const predecessors = getPredecessors(target, 100, false)

      // Prograde burn raises orbit (outward), so to reach ring 3 via prograde,
      // predecessor was at INNER ring (ring 1 or 2)
      const progradePreds = predecessors.filter(p => p.actionType === 'burn_prograde')
      expect(progradePreds.length).toBeGreaterThan(0)

      // Prograde burn predecessors should be at rings <= 2 (inner rings)
      for (const pred of progradePreds) {
        expect(pred.position.ring).toBeLessThanOrEqual(2)
      }

      // Retrograde burn lowers orbit (inward), so to reach ring 3 via retrograde,
      // predecessor was at OUTER ring (ring 4, 5, or 6)
      const retrogradePreds = predecessors.filter(p => p.actionType === 'burn_retrograde')
      expect(retrogradePreds.length).toBeGreaterThan(0)

      // Retrograde burn predecessors should be at rings >= 4 (outer rings)
      for (const pred of retrogradePreds) {
        expect(pred.position.ring).toBeGreaterThanOrEqual(4)
      }
    })

    it('should respect mass constraints', () => {
      const target: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 10,
        facing: 'prograde',
      }

      // With 0 mass, only coast should be available
      const noBurnPreds = getPredecessors(target, 0, false)
      const burnPreds = noBurnPreds.filter(
        p => p.actionType === 'burn_prograde' || p.actionType === 'burn_retrograde'
      )
      expect(burnPreds.length).toBe(0)

      // Coast should still be available
      const coastPreds = noBurnPreds.filter(p => p.actionType === 'coast')
      expect(coastPreds.length).toBe(2)
    })

    it('should handle sector wraparound correctly', () => {
      const target: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 2, // Near sector 0
        facing: 'prograde',
      }

      const predecessors = getPredecessors(target, 0, false)
      const coastPreds = predecessors.filter(p => p.actionType === 'coast')

      // Ring 3 velocity = 4, so predecessor at sector 2 - 4 = -2 → 22 (wrap)
      expect(coastPreds[0].position.sector).toBe(22)
    })
  })

  describe('planMovement', () => {
    it('should find simple coast path on same ring', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 4, // 1 turn of coasting at velocity 4
      }

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 100 })

      expect(plan).not.toBeNull()
      expect(plan!.totalTurns).toBe(1)
      expect(plan!.totalMassCost).toBe(0) // Coast is free
      expect(plan!.steps.length).toBe(1)
      expect(plan!.steps[0].actionType).toBe('coast')
    })

    it('should find simple burn path to adjacent ring', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde', // Need prograde to go to outer ring (raises orbit)
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 4, // After orbital movement and soft burn
      }

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 100 })

      expect(plan).not.toBeNull()
      expect(plan!.totalTurns).toBe(1)
      expect(plan!.totalMassCost).toBe(1) // Soft burn costs 1 mass
      // Prograde burn raises orbit (ring 3 → ring 4)
      expect(plan!.steps[0].actionType).toBe('burn_prograde')
    })

    it('should return null when destination is unreachable', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 1,
        sector: 0,
      }

      // With only 0 mass, can't burn, so ring 1 is unreachable
      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 5, availableMass: 0 })

      expect(plan).toBeNull()
    })

    it('should prefer faster path in fastest mode', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8, // 2 turns of coasting
      }

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 100 })

      expect(plan).not.toBeNull()
      expect(plan!.totalTurns).toBe(2) // 2 coasts at velocity 4
    })

    it('should use faster inner rings to reach distant sectors', () => {
      // From R4S3 to R5S2 - this used to take 10 turns of coasting
      // The planner should find a faster path using inner rings with higher velocity
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 3,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 5,
        sector: 2,
      }

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 20, availableMass: 20 })

      expect(plan).not.toBeNull()
      // Should find a path faster than 10 turns by using inner rings
      // Inner rings have higher velocity (R3=4, R2=6, R1=8 sectors/turn)
      expect(plan!.totalTurns).toBeLessThan(10)
      console.log(`R4S3 -> R5S2: ${plan!.totalTurns} turns, ${plan!.totalMassCost} mass`)
      console.log('Steps:', plan!.steps.map(s => `${s.actionType} -> R${s.to.ring}S${s.to.sector}`).join(', '))
    })

    it('should find path to different gravity well', () => {
      // Start at black hole ring 5 at the correct transfer sector
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 5,
        sector: 18, // Alpha outbound transfer sector
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-alpha',
        ring: 3,
        sector: 6, // After transfer (toSector=5) + velocity 1 = sector 6
      }

      const plan = planMovement(origin, destination, {
        mode: 'fastest',
        maxTurns: 10,
        availableMass: 100,
        allowWellTransfers: true,
      })

      expect(plan).not.toBeNull()
      expect(plan!.crossesWells).toBe(true)
    })
  })

  describe('planMovementAlternatives', () => {
    it('should find alternatives for same-well routes', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 3,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 5,
        sector: 2,
      }

      const result = planMovementAlternatives(origin, destination, {
        maxTurns: 20,
        availableMass: 20,
      })

      expect(result).not.toBeNull()
      expect(result!.alternatives.length).toBeGreaterThanOrEqual(1)
      // First alternative should be labeled as fastest
      expect(result!.alternatives[0].label).toContain('Fastest')
    })

    it('should find alternatives for cross-well routes', () => {
      // Start at black hole ring 3, need to get to planet-alpha ring 2
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-alpha',
        ring: 2,
        sector: 5,
      }

      const result = planMovementAlternatives(origin, destination, {
        maxTurns: 20,
        availableMass: 50,
        allowWellTransfers: true,
      })

      expect(result).not.toBeNull()
      expect(result!.alternatives.length).toBeGreaterThanOrEqual(1)

      // All alternatives should cross wells
      for (const alt of result!.alternatives) {
        expect(alt.crossesWells).toBe(true)
        // Should have a well_transfer step
        const hasTransfer = alt.steps.some(s => s.actionType === 'well_transfer')
        expect(hasTransfer).toBe(true)
      }

      console.log(`Cross-well alternatives found: ${result!.alternatives.length}`)
      for (const alt of result!.alternatives) {
        console.log(`  ${alt.label}: ${alt.totalTurns}T, ${alt.totalMassCost}M, ${alt.steps.length} steps`)
      }
    })

    it('should compute cross-well routes in two phases', () => {
      // Start away from the transfer point
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 2,
        sector: 10,
        facing: 'retrograde',
      }
      // Destination is also away from the landing sector
      const destination: OrbitalPosition = {
        wellId: 'planet-alpha',
        ring: 1,
        sector: 8,
      }

      const result = planMovementAlternatives(origin, destination, {
        maxTurns: 25,
        availableMass: 50,
        allowWellTransfers: true,
      })

      expect(result).not.toBeNull()

      // The route should have steps in both wells
      const alt = result!.alternatives[0]
      const bhSteps = alt.steps.filter(s => s.from.wellId === 'blackhole')
      const planetSteps = alt.steps.filter(s => s.from.wellId === 'planet-alpha')

      console.log(`Two-phase route: ${bhSteps.length} BH steps, ${planetSteps.length} planet steps`)
      console.log(`Total: ${alt.totalTurns}T, ${alt.totalMassCost}M`)

      // Should have steps in source well (getting to transfer point)
      expect(bhSteps.length).toBeGreaterThan(0)
    })
  })

  describe('isReachable', () => {
    it('should return true for reachable positions', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 4,
      }

      expect(isReachable(origin, destination, 5, 100, true)).toBe(true)
    })

    it('should return false for unreachable positions', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-alpha',
        ring: 1,
        sector: 0,
      }

      // Can't reach planet ring 1 from BH in 2 turns with no mass
      expect(isReachable(origin, destination, 2, 0, false)).toBe(false)
    })
  })

  describe('getReachablePositions', () => {
    it('should find positions reachable in 1 turn', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }

      const reachable = getReachablePositions(origin, 1, 100, false)

      // Should include origin (0 turns)
      expect(reachable.has('blackhole:3:0')).toBe(true)

      // Should include coast destination (1 turn)
      expect(reachable.has('blackhole:3:4')).toBe(true)

      // Should include burn destinations (1 turn)
      // After soft prograde burn: ring 4
      const ring4Positions = Array.from(reachable.values()).filter(
        p => p.position.wellId === 'blackhole' && p.position.ring === 4
      )
      expect(ring4Positions.length).toBeGreaterThan(0)
    })

    it('should track turn count correctly', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }

      const reachable = getReachablePositions(origin, 2, 100, false)

      // Origin should be at turn 0
      const originData = reachable.get('blackhole:3:0')
      expect(originData?.turns).toBe(0)

      // Coast destination should be at turn 1
      const coast1 = reachable.get('blackhole:3:4')
      expect(coast1?.turns).toBe(1)

      // 2 turns of coasting should reach sector 8
      const coast2 = reachable.get('blackhole:3:8')
      expect(coast2?.turns).toBe(2)
    })
  })

  describe('positionsMatch', () => {
    it('should match identical positions', () => {
      const a: OrbitalPosition = { wellId: 'blackhole', ring: 3, sector: 5 }
      const b: OrbitalPosition = { wellId: 'blackhole', ring: 3, sector: 5 }
      expect(positionsMatch(a, b)).toBe(true)
    })

    it('should not match different positions', () => {
      const a: OrbitalPosition = { wellId: 'blackhole', ring: 3, sector: 5 }
      const b: OrbitalPosition = { wellId: 'blackhole', ring: 3, sector: 6 }
      expect(positionsMatch(a, b)).toBe(false)
    })

    it('should not match different wells', () => {
      const a: OrbitalPosition = { wellId: 'blackhole', ring: 3, sector: 5 }
      const b: OrbitalPosition = { wellId: 'planet-alpha', ring: 3, sector: 5 }
      expect(positionsMatch(a, b)).toBe(false)
    })
  })
})
