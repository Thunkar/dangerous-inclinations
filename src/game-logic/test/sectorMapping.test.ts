import { describe, it, expect } from 'vitest'
import { mapSectorOnTransfer, getRingConfig, RING_CONFIGS } from '../../constants/rings'

describe('Sector Mapping', () => {
  describe('Adjacent Ring Transfers', () => {
    it('should map R1→R2 (6→12 sectors)', () => {
      // Ring 1 sector 0 → Ring 2 should map to sector 0-1 range
      const result = mapSectorOnTransfer(1, 2, 0)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(2)
    })

    it('should map R1→R2 halfway point', () => {
      // Ring 1 sector 3 (halfway) → Ring 2 sector 6-7 range (halfway)
      const result = mapSectorOnTransfer(1, 2, 3)
      expect(result).toBeGreaterThanOrEqual(6)
      expect(result).toBeLessThanOrEqual(7)
    })

    it('should map R2→R3 (12→24 sectors)', () => {
      // Ring 2 sector 6 → Ring 3 sector 13 (most prograde edge)
      const result = mapSectorOnTransfer(2, 3, 6)
      expect(result).toBeGreaterThanOrEqual(12)
      expect(result).toBeLessThanOrEqual(13)
    })

    it('should map R3→R4 (24→48 sectors)', () => {
      // Ring 3 sector 12 → Ring 4 sector 25 (most prograde edge)
      const result = mapSectorOnTransfer(3, 4, 12)
      expect(result).toBeGreaterThanOrEqual(24)
      expect(result).toBeLessThanOrEqual(25)
    })

    it('should map R4→R5 (48→96 sectors)', () => {
      // Ring 4 sector 24 → Ring 5 sector 49 (most prograde edge)
      const result = mapSectorOnTransfer(4, 5, 24)
      expect(result).toBeGreaterThanOrEqual(48)
      expect(result).toBeLessThanOrEqual(49)
    })
  })

  describe('Reverse Adjacent Ring Transfers', () => {
    it('should map R2→R1 (12→6 sectors)', () => {
      // Ring 2 sector 6 → Ring 1 sector 3 (most prograde edge)
      const result = mapSectorOnTransfer(2, 1, 6)
      expect(result).toBe(3)
    })

    it('should map R3→R2 (24→12 sectors)', () => {
      // Ring 3 sector 12 → Ring 2 sector 6 (most prograde edge)
      const result = mapSectorOnTransfer(3, 2, 12)
      expect(result).toBe(6)
    })

    it('should map R4→R3 (48→24 sectors)', () => {
      // Ring 4 sector 24 → Ring 3 sector 12 (most prograde edge)
      const result = mapSectorOnTransfer(4, 3, 24)
      expect(result).toBe(12)
    })

    it('should map R5→R4 (96→48 sectors)', () => {
      // Ring 5 sector 48 → Ring 4 sector 24 (most prograde edge)
      const result = mapSectorOnTransfer(5, 4, 48)
      expect(result).toBe(24)
    })
  })

  describe('Non-Adjacent Ring Transfers', () => {
    it('should map R1→R3 (6→24 sectors)', () => {
      // Ring 1 sector 3 (halfway) → Ring 3 around sector 15 (most prograde edge)
      const result = mapSectorOnTransfer(1, 3, 3)
      expect(result).toBeGreaterThanOrEqual(14)
      expect(result).toBeLessThanOrEqual(16)
    })

    it('should map R1→R4 (6→48 sectors)', () => {
      // Ring 1 sector 3 (halfway) → Ring 4 around sector 31 (most prograde edge)
      const result = mapSectorOnTransfer(1, 4, 3)
      expect(result).toBeGreaterThanOrEqual(30)
      expect(result).toBeLessThanOrEqual(32)
    })

    it('should map R1→R5 (6→96 sectors)', () => {
      // Ring 1 sector 3 (halfway) → Ring 5 around sector 63 (most prograde edge)
      const result = mapSectorOnTransfer(1, 5, 3)
      expect(result).toBeGreaterThanOrEqual(62)
      expect(result).toBeLessThanOrEqual(64)
    })

    it('should map R5→R1 (96→6 sectors)', () => {
      // Ring 5 sector 48 (halfway) → Ring 1 sector 3 (most prograde edge)
      const result = mapSectorOnTransfer(5, 1, 48)
      expect(result).toBe(3)
    })

    it('should map R2→R4 (12→48 sectors)', () => {
      // Ring 2 sector 6 (halfway) → Ring 4 around sector 27 (most prograde edge)
      const result = mapSectorOnTransfer(2, 4, 6)
      expect(result).toBeGreaterThanOrEqual(26)
      expect(result).toBeLessThanOrEqual(28)
    })

    it('should map R4→R2 (48→12 sectors)', () => {
      // Ring 4 sector 24 (halfway) → Ring 2 sector 6 (most prograde edge)
      const result = mapSectorOnTransfer(4, 2, 24)
      expect(result).toBe(6)
    })
  })

  describe('Edge Cases and Wraparound', () => {
    it('should handle sector 0 transfer', () => {
      const result = mapSectorOnTransfer(3, 4, 0)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(48)
    })

    it('should handle last sector transfer from R3', () => {
      const result = mapSectorOnTransfer(3, 4, 23) // Last sector of R3
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(48)
    })

    it('should handle last sector transfer from R5', () => {
      const result = mapSectorOnTransfer(5, 4, 95) // Last sector of R5
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(48)
    })

    it('should return 0 for invalid from ring', () => {
      const result = mapSectorOnTransfer(99, 3, 0)
      expect(result).toBe(0)
    })

    it('should return 0 for invalid to ring', () => {
      const result = mapSectorOnTransfer(3, 99, 0)
      expect(result).toBe(0)
    })
  })

  describe('Same Ring Transfer (edge case)', () => {
    it('should map sector correctly when transferring within same ring', () => {
      // This shouldn't happen in game, but test the math
      const result = mapSectorOnTransfer(3, 3, 12)
      // Should map to same or very close sector
      expect(result).toBeGreaterThanOrEqual(11)
      expect(result).toBeLessThan(13)
    })
  })

  describe('Prograde Preference (Most Forward Sector)', () => {
    it('should prefer most prograde sector in overlapping range', () => {
      // When a sector in ring 1 overlaps multiple sectors in ring 2,
      // the function should choose the most prograde (forward) one
      const result = mapSectorOnTransfer(1, 2, 0)

      // Ring 1 sector 0 spans from 0° to 60°
      // Ring 2 has sectors every 30°, so sectors 0 and 1 overlap
      // Should choose the one closest to the END of R1 sector 0 (most prograde)
      expect(result).toBeLessThan(2)
    })

    it('should be consistent with reverse mapping', () => {
      // Forward and reverse should be consistent
      const forward = mapSectorOnTransfer(2, 3, 6)
      const reverse = mapSectorOnTransfer(3, 2, forward)

      // Reverse should map back to same or adjacent sector
      expect(reverse).toBeGreaterThanOrEqual(5)
      expect(reverse).toBeLessThanOrEqual(6)
    })
  })

  describe('Ring Configurations', () => {
    it('should have valid ring configs for all rings', () => {
      for (let ring = 1; ring <= 5; ring++) {
        const config = getRingConfig(ring)
        expect(config).toBeDefined()
        expect(config?.ring).toBe(ring)
        expect(config?.velocity).toBe(1) // All rings have velocity 1
        expect(config?.sectors).toBeGreaterThan(0)
      }
    })

    it('should have doubling sector progression', () => {
      // Each ring should have double the sectors of the previous
      expect(RING_CONFIGS[1].sectors).toBe(RING_CONFIGS[0].sectors * 2) // 12 = 6*2
      expect(RING_CONFIGS[2].sectors).toBe(RING_CONFIGS[1].sectors * 2) // 24 = 12*2
      expect(RING_CONFIGS[3].sectors).toBe(RING_CONFIGS[2].sectors * 2) // 48 = 24*2
      expect(RING_CONFIGS[4].sectors).toBe(RING_CONFIGS[3].sectors * 2) // 96 = 48*2
    })

    it('should have increasing radii', () => {
      for (let i = 1; i < RING_CONFIGS.length; i++) {
        expect(RING_CONFIGS[i].radius).toBeGreaterThan(RING_CONFIGS[i - 1].radius)
      }
    })

    it('should all have same velocity (constant angular velocity)', () => {
      RING_CONFIGS.forEach(config => {
        expect(config.velocity).toBe(1)
      })
    })
  })

  describe('Transfer Accuracy', () => {
    it('should maintain angular position through transfers', () => {
      // A ship at 0° (sector 0) should remain at ~0° after transfer
      const r1ToR2 = mapSectorOnTransfer(1, 2, 0)
      const r2Config = getRingConfig(2)!

      // Calculate approximate angles
      const r1Angle = 0 // Start of sector 0
      const r2Angle = (r1ToR2 / r2Config.sectors) * 360

      // Should be close to same angle
      expect(Math.abs(r2Angle - r1Angle)).toBeLessThan(60) // Within one R1 sector width
    })

    it('should preserve approximate angular position in transfers', () => {
      // A ship at 180° should remain at approximate position after transfer
      const r1HalfwaySector = 3 // 180° in ring 1
      const r3Result = mapSectorOnTransfer(1, 3, r1HalfwaySector)

      const r3Config = getRingConfig(3)!
      const r3Angle = (r3Result / r3Config.sectors) * 360

      // Should be in general vicinity (within reasonable error)
      // The "most prograde" bias means it will be slightly ahead
      expect(r3Angle).toBeGreaterThan(150)
      expect(r3Angle).toBeLessThan(270)
    })
  })
})
