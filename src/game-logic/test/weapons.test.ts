import { describe, it, expect } from 'vitest'
import { calculateFiringSolutions } from '../../utils/weaponRange'
import { calculatePostMovementPosition } from '../../utils/tacticalSequence'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../../utils/subsystemHelpers'
import { STARTING_REACTION_MASS } from '../../constants/rings'
import type { Player } from '../../types/game'
import type { WeaponStats } from '../../types/subsystems'

// Helper to create test players
function createTestPlayer(id: string, name: string, ring: number, sector: number, facing: 'prograde' | 'retrograde'): Player {
  return {
    id,
    name,
    color: '#ffffff',
    ship: {
      wellId: 'blackhole',
      ring,
      sector,
      facing,
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
  }
}

describe('Weapon Targeting', () => {
  const broadsideLaser: WeaponStats = {
    arc: 'broadside',
    ringRange: 1, // Can target ±1 ring
    sectorRange: 1, // Can target ±1 sector
    damage: 2,
  }

  const spinalRailgun: WeaponStats = {
    arc: 'spinal',
    ringRange: 0, // Same ring only
    sectorRange: 0, // Calculated dynamically
    damage: 4,
    hasRecoil: true,
  }

  describe('Broadside Laser Targeting (±1 sector spread)', () => {
    it('should hit target at same sector on outer adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 5, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should hit target at sector-1 on outer adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 4, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should hit target at sector+1 on outer adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 6, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should hit target at sector-1 on inner adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 1, 4, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should hit target at same sector on inner adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 1, 5, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should hit target at sector+1 on inner adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 1, 6, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should NOT hit target at sector+2 on adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 7, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(false)
    })

    it('should NOT hit target at sector-2 on adjacent ring', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 3, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(false)
    })

    it('should NOT hit target on same ring (broadside only hits adjacent rings)', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 2, 5, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(false)
    })

    it('should NOT hit target 2 rings away', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 5, 'prograde')
      const target = createTestPlayer('target', 'Target', 4, 5, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(false)
    })

    it('should handle wrap-around at sector 0 (target at sector 23)', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 23, 'prograde') // 23 is one sector before 0

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should handle wrap-around at sector 23 (target at sector 0)', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 2, 23, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 0, 'prograde') // 0 is one sector after 23

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })
  })

  describe('Pre-movement targeting', () => {
    it('should calculate broadside weapon range from current position', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 4, 0, 'prograde')

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should calculate spinal weapon range from current position', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 4, 'prograde')

      const solutions = calculateFiringSolutions(
        spinalRailgun,
        attacker.ship,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      // Target at R3S4, attacker at R3S0 -> 4 sectors away, within range (6 sectors)
      expect(targetSolution?.inRange).toBe(true)
    })
  })

  describe('Post-movement targeting', () => {
    it('should calculate broadside weapon range after coasting', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 4, 2, 'prograde') // Same sector after movement

      // Calculate attacker position after movement (+2 sectors for Ring 3 velocity=2)
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: 'coast',
          sectorAdjustment: 0,
        }
      )

      expect(postMoveShip.sector).toBe(2) // Ring 3 has velocity=2
      expect(postMoveShip.ring).toBe(3)

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        postMoveShip,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      // Attacker at R3S2 projects onto R4
      // Broadside laser has ±1 ring, ±1 sector range
      // Target at R4S2 is within range (same sector, adjacent ring)
      expect(targetSolution).toBeDefined()
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should calculate spinal weapon range closer after orbital movement', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 5, 'prograde')

      // Before movement: 5 sectors away (within Ring 3 railgun range of 6 sectors)
      const beforeSolutions = calculateFiringSolutions(
        spinalRailgun,
        attacker.ship,
        [attacker, target],
        attacker.id
      )
      const before = beforeSolutions.find(s => s.targetId === target.id)
      expect(before?.inRange).toBe(true)

      // After movement: attacker moves to S2 (velocity=2), target still at S5 -> 3 sectors away
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: 'coast',
          sectorAdjustment: 0,
        }
      )

      expect(postMoveShip.sector).toBe(2) // Ring 3 velocity=2

      const afterSolutions = calculateFiringSolutions(
        spinalRailgun,
        postMoveShip,
        [attacker, target],
        attacker.id
      )
      const after = afterSolutions.find(s => s.targetId === target.id)
      expect(after?.inRange).toBe(true)
    })

    it('should calculate range from current ring when burning (transfer not completed)', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 6, 'prograde') // Adjusted for velocity

      // Attacker burns (initiates transfer to R4 but stays on R3 this turn)
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: 'burn',
          burnIntensity: 'light',
          sectorAdjustment: 0,
        }
      )

      // Ship is STILL on ring 3 (transfer completes next turn)
      expect(postMoveShip.ring).toBe(3)
      expect(postMoveShip.sector).toBe(2) // Moved +2 sectors (Ring 3 velocity=2)

      // Calculate weapon range from current ring (R3), not destination ring (R4)
      const solutions = calculateFiringSolutions(
        spinalRailgun,
        postMoveShip,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      // Target at R3S6, attacker at R3S2 -> 4 sectors away, within range
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should calculate broadside range after rotation', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 4, 2, 'prograde') // Same sector after movement

      // Rotate to retrograde before movement
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        'retrograde',
        {
          actionType: 'coast',
          sectorAdjustment: 0,
        }
      )

      expect(postMoveShip.facing).toBe('retrograde')
      expect(postMoveShip.sector).toBe(2) // Ring 3 velocity=2

      // Calculate weapon range (broadside doesn't care about facing)
      const solutions = calculateFiringSolutions(
        broadsideLaser,
        postMoveShip,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      expect(targetSolution?.inRange).toBe(true)
    })
  })
})
