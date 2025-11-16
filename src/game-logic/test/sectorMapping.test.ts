import { describe, it, expect } from 'vitest'
import { mapSectorOnTransfer, getRingConfig, RING_CONFIGS } from '../../constants/rings'

describe('Sector Mapping', () => {
  describe('Ring Transfers (All rings have 24 sectors)', () => {
    it('should map R1→R2 (24→24 sectors, 1:1 mapping)', () => {
      // All rings have 24 sectors, so sector number stays the same
      const result = mapSectorOnTransfer(1, 2, 0)
      expect(result).toBe(0)
    })

    it('should map R1→R2 halfway point', () => {
      // Ring 1 sector 12 (halfway) → Ring 2 sector 12 (same sector)
      const result = mapSectorOnTransfer(1, 2, 12)
      expect(result).toBe(12)
    })

    it('should map R2→R3 (24→24 sectors, 1:1 mapping)', () => {
      // Ring 2 sector 6 → Ring 3 sector 6 (same sector)
      const result = mapSectorOnTransfer(2, 3, 6)
      expect(result).toBe(6)
    })

    it('should map R3→R4 (24→24 sectors, 1:1 mapping)', () => {
      // Ring 3 sector 12 → Ring 4 sector 12 (same sector)
      const result = mapSectorOnTransfer(3, 4, 12)
      expect(result).toBe(12)
    })

    it('should map any sector to same sector across all rings', () => {
      // Test several sectors to ensure 1:1 mapping
      for (let sector = 0; sector < 24; sector++) {
        expect(mapSectorOnTransfer(1, 2, sector)).toBe(sector)
        expect(mapSectorOnTransfer(2, 3, sector)).toBe(sector)
        expect(mapSectorOnTransfer(3, 4, sector)).toBe(sector)
      }
    })
  })

  describe('Reverse Transfers (still 1:1 with uniform sectors)', () => {
    it('should map R2→R1 (24→24 sectors)', () => {
      // Ring 2 sector 6 → Ring 1 sector 6 (same sector)
      const result = mapSectorOnTransfer(2, 1, 6)
      expect(result).toBe(6)
    })

    it('should map R3→R2 (24→24 sectors)', () => {
      // Ring 3 sector 12 → Ring 2 sector 12 (same sector)
      const result = mapSectorOnTransfer(3, 2, 12)
      expect(result).toBe(12)
    })

    it('should map R4→R3 (24→24 sectors)', () => {
      // Ring 4 sector 18 → Ring 3 sector 18 (same sector)
      const result = mapSectorOnTransfer(4, 3, 18)
      expect(result).toBe(18)
    })

    it('should map reverse transfers correctly', () => {
      // Test bidirectional symmetry
      for (let sector = 0; sector < 24; sector++) {
        expect(mapSectorOnTransfer(4, 1, sector)).toBe(sector)
        expect(mapSectorOnTransfer(1, 4, sector)).toBe(sector)
      }
    })
  })

  describe('Multi-Ring Transfers (still 1:1)', () => {
    it('should map R1→R3 (24→24 sectors)', () => {
      // Ring 1 sector 15 → Ring 3 sector 15 (same sector)
      const result = mapSectorOnTransfer(1, 3, 15)
      expect(result).toBe(15)
    })

    it('should map R1→R4 (24→24 sectors)', () => {
      // Ring 1 sector 8 → Ring 4 sector 8 (same sector)
      const result = mapSectorOnTransfer(1, 4, 8)
      expect(result).toBe(8)
    })

    it('should map R2→R4 (24→24 sectors)', () => {
      // Ring 2 sector 20 → Ring 4 sector 20 (same sector)
      const result = mapSectorOnTransfer(2, 4, 20)
      expect(result).toBe(20)
    })

    it('should map R4→R1 (24→24 sectors)', () => {
      // Ring 4 sector 5 → Ring 1 sector 5 (same sector)
      const result = mapSectorOnTransfer(4, 1, 5)
      expect(result).toBe(5)
    })
  })

  describe('Edge Cases and Wraparound', () => {
    it('should handle sector 0 transfer', () => {
      const result = mapSectorOnTransfer(3, 4, 0)
      expect(result).toBe(0)
    })

    it('should handle last sector transfer from R3', () => {
      const result = mapSectorOnTransfer(3, 4, 23) // Last sector of R3
      expect(result).toBe(23)
    })

    it('should handle last sector transfer from R5', () => {
      // Ring 5 doesn't exist in new system, test R4
      const result = mapSectorOnTransfer(4, 3, 23) // Last sector of R4
      expect(result).toBe(23)
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
      // Should map to same sector with uniform sector counts
      expect(result).toBe(12)
    })
  })

  describe('Prograde Preference (Most Forward Sector)', () => {
    it('should prefer most prograde sector in overlapping range', () => {
      // With uniform 24 sectors, no overlap exists - 1:1 mapping
      const result = mapSectorOnTransfer(1, 2, 0)
      expect(result).toBe(0)
    })

    it('should be consistent with reverse mapping', () => {
      // Forward and reverse should be perfectly consistent
      const forward = mapSectorOnTransfer(2, 3, 6)
      const reverse = mapSectorOnTransfer(3, 2, forward)
      expect(reverse).toBe(6)
    })
  })

  describe('Ring Configurations', () => {
    it('should have valid ring configs for all rings', () => {
      // New system: 4 rings only
      for (let ring = 1; ring <= 4; ring++) {
        const config = getRingConfig(ring)
        expect(config).toBeDefined()
        expect(config?.ring).toBe(ring)
        expect(config?.sectors).toBe(24) // All rings have 24 sectors
      }
    })

    it('should have variable velocities (dramatic doubling)', () => {
      // New system: All rings have 24 sectors, but velocities differ dramatically
      expect(RING_CONFIGS[0].sectors).toBe(24)
      expect(RING_CONFIGS[1].sectors).toBe(24)
      expect(RING_CONFIGS[2].sectors).toBe(24)
      expect(RING_CONFIGS[3].sectors).toBe(24)

      // Velocities should decrease with doubling: 8, 4, 2, 1
      expect(RING_CONFIGS[0].velocity).toBe(8) // Ring 1 - BLAZING FAST
      expect(RING_CONFIGS[1].velocity).toBe(4) // Ring 2 - Very Fast
      expect(RING_CONFIGS[2].velocity).toBe(2) // Ring 3 - Medium
      expect(RING_CONFIGS[3].velocity).toBe(1) // Ring 4 - Slow
    })

    it('should have increasing radii', () => {
      for (let i = 1; i < RING_CONFIGS.length; i++) {
        expect(RING_CONFIGS[i].radius).toBeGreaterThan(RING_CONFIGS[i - 1].radius)
      }
    })

    it('should have variable velocity (inner rings faster with doubling)', () => {
      // Velocity decreases with doubling progression as ring number increases
      for (let i = 1; i < RING_CONFIGS.length; i++) {
        expect(RING_CONFIGS[i].velocity).toBeLessThan(RING_CONFIGS[i - 1].velocity)
        // Each ring should be exactly half the speed of the previous ring
        expect(RING_CONFIGS[i].velocity).toBe(RING_CONFIGS[i - 1].velocity / 2)
      }
    })
  })

  describe('Transfer Accuracy', () => {
    it('should maintain angular position through transfers', () => {
      // With 1:1 sector mapping, angular position is perfectly preserved
      const r1ToR2 = mapSectorOnTransfer(1, 2, 0)
      expect(r1ToR2).toBe(0) // Perfect preservation
    })

    it('should preserve exact angular position in transfers', () => {
      // A ship at any sector should remain at same sector after transfer
      const r1HalfwaySector = 12 // 180° in ring 1
      const r3Result = mapSectorOnTransfer(1, 3, r1HalfwaySector)
      expect(r3Result).toBe(12) // Exact preservation
    })
  })
})
