import { describe, it, expect } from 'vitest'
import { calculateFiringSolutions } from '../../utils/weaponRange'
import { calculatePostMovementPosition } from '../../utils/tacticalSequence'
import { createInitialSubsystems } from '../../utils/subsystemHelpers'
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
      ring,
      sector,
      facing,
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
    },
  }
}

describe('Weapon Targeting', () => {
  const broadsideLaser: WeaponStats = {
    arc: 'broadside',
    ringRange: 1,
    sectorRange: 2,
    damage: 2,
  }

  const spinalRailgun: WeaponStats = {
    arc: 'spinal',
    ringRange: 0, // Same ring only
    sectorRange: 0, // Calculated dynamically
    damage: 4,
    hasRecoil: true,
  }

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
      const target = createTestPlayer('target', 'Target', 4, 2, 'prograde')

      // Calculate attacker position after movement (+1 sector orbital movement)
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: 'coast',
          sectorAdjustment: 0,
        }
      )

      expect(postMoveShip.sector).toBe(1)
      expect(postMoveShip.ring).toBe(3)

      const solutions = calculateFiringSolutions(
        broadsideLaser,
        postMoveShip,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      // Attacker at R3S1 projects sectors onto R4
      // R3S1 boundaries will overlap with sectors on R4 including S2
      expect(targetSolution).toBeDefined()
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should calculate spinal weapon range closer after orbital movement', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 3, 5, 'prograde')

      // Before movement: 5 sectors away
      const beforeSolutions = calculateFiringSolutions(
        spinalRailgun,
        attacker.ship,
        [attacker, target],
        attacker.id
      )
      const before = beforeSolutions.find(s => s.targetId === target.id)
      expect(before?.inRange).toBe(true)

      // After movement: attacker moves to S1, target still at S5 -> 4 sectors away
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: 'coast',
          sectorAdjustment: 0,
        }
      )

      expect(postMoveShip.sector).toBe(1)

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
      const target = createTestPlayer('target', 'Target', 3, 4, 'prograde')

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
      expect(postMoveShip.sector).toBe(1) // Moved +1 sector orbitally

      // Calculate weapon range from current ring (R3), not destination ring (R4)
      const solutions = calculateFiringSolutions(
        spinalRailgun,
        postMoveShip,
        [attacker, target],
        attacker.id
      )

      const targetSolution = solutions.find(s => s.targetId === target.id)
      // Target at R3S4, attacker at R3S1 -> 3 sectors away, within range
      expect(targetSolution?.inRange).toBe(true)
    })

    it('should calculate broadside range after rotation', () => {
      const attacker = createTestPlayer('attacker', 'Attacker', 3, 0, 'prograde')
      const target = createTestPlayer('target', 'Target', 4, 2, 'prograde')

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
      expect(postMoveShip.sector).toBe(1)

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
