import { describe, it, expect } from 'vitest'
import {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getPredecessors,
  getReachablePositions,
  positionsMatch,
} from '../../ai/movementPlanner'
import type { OrientedPosition, OrbitalPosition } from '../../ai/movementPlanner/types'

describe('Movement Planner', () => {
  describe('Predecessors', () => {
    it('should find coast predecessors on same ring', () => {
      const target: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8, // Ring 3 velocity = 4, so predecessor was at sector 4
        facing: 'prograde',
      }

      const predecessors = getPredecessors(target, 10, false)

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

      const predecessors = getPredecessors(target, 10, false)

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

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 10 })

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

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 10 })

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

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 10, availableMass: 10 })

      expect(plan).not.toBeNull()
      expect(plan!.totalTurns).toBe(2) // 2 coasts at velocity 4
    })

    it('should find fast route from BH R4S4 to Beta R3S1 (cross-well)', () => {
      // Real scenario: ship at BH R4S4 needs to reach Beta R3S1
      // Transfer to Beta is at BH R5 S2 -> Beta R3 S5
      // After transfer + orbital movement (velocity=1): lands at Beta R3 S6
      // Then needs to reach Beta R3 S1
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 4,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-beta',
        ring: 3,
        sector: 1,
      }

      // With fuel scoop, the ship recovers mass while coasting on inner rings,
      // making burn-heavy routes affordable even with limited starting fuel
      const result = planMovementAlternatives(origin, destination, {
        maxTurns: 25,
        availableMass: 10,
        allowWellTransfers: true,
        hasFuelScoop: true,
      })

      expect(result).not.toBeNull()
      expect(result!.alternatives.length).toBeGreaterThanOrEqual(1)

      const fastest = result!.alternatives[0]
      console.log(`BH R4S4 -> Beta R3S1: ${fastest.totalTurns} turns, ${fastest.totalMassCost} mass`)
      console.log('Steps:')
      for (const step of fastest.steps) {
        console.log(`  ${step.actionType}${step.burnIntensity ? ` (${step.burnIntensity})` : ''}: R${step.from.ring}S${step.from.sector} [${step.from.wellId}] -> R${step.to.ring}S${step.to.sector} [${step.to.wellId}]`)
      }

      // Should NOT take 10+ turns of coasting. Using inner rings should be much faster.
      expect(fastest.totalTurns).toBeLessThanOrEqual(10)
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

      const plan = planMovement(origin, destination, { mode: 'fastest', maxTurns: 20, availableMass: 10 })

      expect(plan).not.toBeNull()
      // Should find a path faster than 10 turns by using inner rings
      // Inner rings have higher velocity (R3=4, R2=6, R1=8 sectors/turn)
      expect(plan!.totalTurns).toBeLessThan(10)
      console.log(`R4S3 -> R5S2: ${plan!.totalTurns} turns, ${plan!.totalMassCost} mass`)
      console.log('Steps:', plan!.steps.map(s => `${s.actionType} -> R${s.to.ring}S${s.to.sector}`).join(', '))
    })

    it('should find cheaper routes with fuel scoop enabled', () => {
      // Use economical mode to see the difference in mass cost
      // Ship starts with 6 mass (partially depleted), so scooping can recover up to max 10
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      // Same ring, 2 coasts ahead — scoop should recover fuel on each coast
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8, // 2 turns of coasting at velocity 4
      }

      // Without scoop: 2 coasts, 0 mass cost
      const planNoScoop = planMovement(origin, destination, {
        mode: 'economical', maxTurns: 10, availableMass: 6,
      })

      // With scoop: 2 coasts, each recovers velocity=4, but capped at tank room (4 units)
      const planWithScoop = planMovement(origin, destination, {
        mode: 'economical', maxTurns: 10, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
      })

      expect(planNoScoop).not.toBeNull()
      expect(planWithScoop).not.toBeNull()

      // Without scoop: coast is free, total mass = 0
      expect(planNoScoop!.totalMassCost).toBe(0)

      // With scoop: each coast recovers fuel, net mass should be negative
      // but capped at -(maxFuelCapacity - availableMass) = -(10-6) = -4
      expect(planWithScoop!.totalMassCost).toBeLessThan(0)
      expect(planWithScoop!.totalMassCost).toBeGreaterThanOrEqual(-4) // Can't exceed tank capacity
      console.log(`Coast route mass: no scoop=${planNoScoop!.totalMassCost}, scoop=${planWithScoop!.totalMassCost}`)
    })

    it('should respect fuel reserve when planning', () => {
      // With limited mass and reserve, routes that cost too much should be rejected
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 4, // Requires a burn (costs mass)
      }

      // With 5 available mass: should find route
      const planWithMass = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 10, availableMass: 5,
      })
      expect(planWithMass).not.toBeNull()

      // With only 0 available mass (e.g., reserve equals current mass): can't burn
      const planNoMass = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 10, availableMass: 0,
      })
      expect(planNoMass).toBeNull()
    })

    it('should find route with scoop that would be impossible without it', () => {
      // A route that requires burning (costs mass) then coasting (recovers mass with scoop)
      // then burning again. Without scoop, the total mass cost exceeds available.
      // Ship has a fuel tank (max capacity 16) and starts with 10 mass.
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

      // Without scoop and only 10 mass, the fast inner-ring route (costs ~14) should fail
      const planNoScoop = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 20, availableMass: 10,
      })
      // Either null (can't afford) or a slower route that costs <= 10
      if (planNoScoop) {
        expect(planNoScoop.totalMassCost).toBeLessThanOrEqual(10)
      }

      // With scoop and fuel tank (max 16), coasting on inner rings recovers fuel
      // making the fast route affordable
      const planWithScoop = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 20, availableMass: 10, hasFuelScoop: true, maxFuelCapacity: 16,
      })
      expect(planWithScoop).not.toBeNull()
      expect(planWithScoop!.totalTurns).toBeLessThan(10)
      console.log(`Inner ring route: no scoop=${planNoScoop?.totalTurns ?? 'null'}T/${planNoScoop?.totalMassCost ?? 'null'}M, scoop=${planWithScoop!.totalTurns}T/${planWithScoop!.totalMassCost}M`)
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
        availableMass: 10,
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
        availableMass: 10,
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
        availableMass: 10,
        allowWellTransfers: true,
        hasFuelScoop: true,
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
        availableMass: 10,
        allowWellTransfers: true,
        hasFuelScoop: true,
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

      expect(isReachable(origin, destination, 5, 10, true)).toBe(true)
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

      const reachable = getReachablePositions(origin, 1, 10, false)

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

      const reachable = getReachablePositions(origin, 2, 10, false)

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

  describe('algorithm correctness', () => {
    it('should be monotonic: more fuel should never produce a slower route', () => {
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

      // Test with increasing available mass — turns should never increase
      let prevTurns = Infinity
      for (const mass of [3, 5, 7, 10]) {
        const plan = planMovement(origin, destination, {
          mode: 'fastest', maxTurns: 20, availableMass: mass, hasFuelScoop: true, maxFuelCapacity: 10,
        })
        if (plan) {
          expect(plan.totalTurns).toBeLessThanOrEqual(prevTurns)
          prevTurns = plan.totalTurns
        }
      }
    })

    it('should find optimal mass cost in economical mode with scoop', () => {
      // Economical mode should prefer scoop-heavy routes even if they take more turns
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8,
      }

      const fastest = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 10, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
      })
      const economical = planMovement(origin, destination, {
        mode: 'economical', maxTurns: 10, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
      })

      expect(fastest).not.toBeNull()
      expect(economical).not.toBeNull()

      // Economical should have massCost <= fastest
      expect(economical!.totalMassCost).toBeLessThanOrEqual(fastest!.totalMassCost)
    })

    it('should pick lowest massCost among equal-turn paths in fastest mode', () => {
      // Ship at R3S0 going to R3S8: 2 coasts. With scoop and room in tank,
      // the massCost should be negative (fuel recovered), not zero.
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 0,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 3,
        sector: 8,
      }

      const plan = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 10, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
      })

      expect(plan).not.toBeNull()
      expect(plan!.totalTurns).toBe(2)
      // With scoop, coasting should recover fuel, so massCost should be negative
      expect(plan!.totalMassCost).toBeLessThan(0)
    })

    it('BHR4S6 to BetaR3S1: reserve 4 vs 5 regression (planMovement)', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 6,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-beta',
        ring: 3,
        sector: 1,
      }

      // Reserve 4: availableMass = 6
      const plan4 = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 20, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
        allowWellTransfers: true,
      })
      // Reserve 5: availableMass = 5
      const plan5 = planMovement(origin, destination, {
        mode: 'fastest', maxTurns: 20, availableMass: 5, hasFuelScoop: true, maxFuelCapacity: 10,
        allowWellTransfers: true,
      })

      // More fuel should NEVER produce a slower route
      if (plan4 && plan5) {
        expect(plan4.totalTurns).toBeLessThanOrEqual(plan5.totalTurns)
      }
    })

    it('BHR4S6 to BetaR3S1: reserve 4 vs 5 regression (planMovementAlternatives)', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 6,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-beta',
        ring: 3,
        sector: 1,
      }

      // Reserve 4: availableMass = 6
      const result4 = planMovementAlternatives(origin, destination, {
        maxTurns: 20, availableMass: 6, hasFuelScoop: true, maxFuelCapacity: 10,
        allowWellTransfers: true,
      })
      // Reserve 5: availableMass = 5
      const result5 = planMovementAlternatives(origin, destination, {
        maxTurns: 20, availableMass: 5, hasFuelScoop: true, maxFuelCapacity: 10,
        allowWellTransfers: true,
      })

      const fastest4 = result4?.alternatives[0]
      const fastest5 = result5?.alternatives[0]

      // More fuel should NEVER produce a slower route
      if (fastest4 && fastest5) {
        expect(fastest4.totalTurns).toBeLessThanOrEqual(fastest5.totalTurns)
      }
    })

    it('should not give worse routes when fuel reserve increases slightly (same-well)', () => {
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 4,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'blackhole',
        ring: 5,
        sector: 2,
      }

      const plans = []
      for (const reserve of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const avail = Math.max(0, 10 - reserve)
        const plan = planMovement(origin, destination, {
          mode: 'fastest', maxTurns: 20, availableMass: avail, hasFuelScoop: true, maxFuelCapacity: 10,
        })
        plans.push({ reserve, avail, turns: plan?.totalTurns ?? Infinity, mass: plan?.totalMassCost ?? Infinity })
      }

      // Turns should be non-decreasing as fuel decreases (reserve increases)
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].turns).toBeGreaterThanOrEqual(plans[i - 1].turns)
      }
    })

    it('should not give worse routes when fuel reserve increases (cross-well via alternatives)', () => {
      // This mirrors how the UI calls the planner
      const origin: OrientedPosition = {
        wellId: 'blackhole',
        ring: 4,
        sector: 6,
        facing: 'prograde',
      }
      const destination: OrbitalPosition = {
        wellId: 'planet-beta',
        ring: 3,
        sector: 1,
      }

      const plans = []
      for (const reserve of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const avail = Math.max(0, 10 - reserve)
        const result = planMovementAlternatives(origin, destination, {
          maxTurns: 20,
          availableMass: avail,
          hasFuelScoop: true,
          maxFuelCapacity: 10,
          allowWellTransfers: true,
          fuelReserve: reserve,
        })
        const fastest = result?.alternatives[0]
        plans.push({
          reserve,
          avail,
          turns: fastest?.totalTurns ?? Infinity,
          mass: fastest?.totalMassCost ?? Infinity,
        })
      }

      // Turns should be non-decreasing as fuel decreases (reserve increases)
      for (let i = 1; i < plans.length; i++) {
        if (plans[i].turns < plans[i - 1].turns) {
          console.log(`NON-MONOTONIC: reserve ${plans[i-1].reserve} (avail=${plans[i-1].avail}) -> ${plans[i-1].turns}T, reserve ${plans[i].reserve} (avail=${plans[i].avail}) -> ${plans[i].turns}T`)
        }
        expect(plans[i].turns).toBeGreaterThanOrEqual(plans[i - 1].turns)
      }
    })
  })
})
