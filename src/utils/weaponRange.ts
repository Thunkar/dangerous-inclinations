import type { Player, ShipState } from '../types/game'
import type { WeaponStats } from '../types/subsystems'
import { getRingConfig } from '../constants/rings'

export interface FiringSolution {
  targetId: string
  targetPlayer: Player
  inRange: boolean
  distance: number  // Total sectors + rings
  sectorDistance: number
  ringDistance: number
  wrongFacing?: boolean  // For spinal weapons
  requiresEngines?: boolean  // For railgun recoil warning
}

/**
 * Calculate all firing solutions for a weapon
 * Uses separate ring range and sector range
 */
export function calculateFiringSolutions(
  weapon: WeaponStats,
  attackerShip: ShipState,
  allPlayers: Player[],
  currentPlayerId: string,
  pendingFacing?: string
): FiringSolution[] {
  // Use pending facing if provided (planning phase), otherwise use committed facing
  const effectiveShip: ShipState = {
    ...attackerShip,
    facing: (pendingFacing as any) || attackerShip.facing,
  }

  return allPlayers
    .filter(p => p.id !== currentPlayerId && p.ship.hitPoints > 0)
    .map(targetPlayer => calculateSingleTarget(weapon, effectiveShip, targetPlayer))
}

/**
 * Calculate firing solution for a single target
 */
function calculateSingleTarget(
  weapon: WeaponStats,
  attackerShip: ShipState,
  targetPlayer: Player
): FiringSolution {
  const targetShip = targetPlayer.ship

  // Get ring configurations
  const attackerRingConfig = getRingConfig(attackerShip.ring)
  const targetRingConfig = getRingConfig(targetShip.ring)

  if (!attackerRingConfig || !targetRingConfig) {
    return {
      targetId: targetPlayer.id,
      targetPlayer,
      inRange: false,
      distance: Infinity,
      sectorDistance: 0,
      ringDistance: 0,
    }
  }

  // Calculate ring distance
  const ringDist = Math.abs(targetShip.ring - attackerShip.ring)

  // Calculate sector distance (shortest path around the ring)
  let sectorDist = Math.abs(targetShip.sector - attackerShip.sector)
  const halfRing = attackerRingConfig.sectors / 2
  if (sectorDist > halfRing) {
    sectorDist = attackerRingConfig.sectors - sectorDist
  }

  // Total distance for display
  const totalDistance = sectorDist + ringDist

  // Arc-specific checks
  let inRange = false
  let wrongFacing = false
  let requiresEngines = false

  if (weapon.arc === 'spinal') {
    // Spinal weapons fire tangentially along orbit on same ring only
    // Range is 2× current ring number in the facing direction

    // Must be on same ring
    if (ringDist !== 0) {
      inRange = false
      wrongFacing = false
    } else {
      // Calculate dynamic range based on ring: 2× ring number
      const spinalRange = attackerShip.ring * 2

      // Calculate sector distance in facing direction
      let facingDist: number
      if (attackerShip.facing === 'prograde') {
        // Measure distance forward (increasing sector numbers)
        facingDist = (targetShip.sector - attackerShip.sector + attackerRingConfig.sectors) % attackerRingConfig.sectors
      } else {
        // Measure distance backward (decreasing sector numbers)
        facingDist = (attackerShip.sector - targetShip.sector + attackerRingConfig.sectors) % attackerRingConfig.sectors
      }

      // In range if within facing direction and within range
      inRange = facingDist > 0 && facingDist <= spinalRange
      wrongFacing = false
    }

    // Check if railgun recoil compensation is needed
    if (weapon.hasRecoil) {
      requiresEngines = true
    }
  } else if (weapon.arc === 'broadside') {
    // Broadside weapons fire radially from current sector
    // Must be within ring range and sector overlap
    inRange = ringDist <= weapon.ringRange && ringDist > 0 &&
              checkSectorOverlap(attackerShip, attackerRingConfig, targetShip, targetRingConfig, weapon.sectorRange)
  } else if (weapon.arc === 'turret') {
    // Turret has no facing restrictions
    inRange = ringDist <= weapon.ringRange && ringDist > 0 &&
              checkSectorOverlap(attackerShip, attackerRingConfig, targetShip, targetRingConfig, weapon.sectorRange)
  }

  return {
    targetId: targetPlayer.id,
    targetPlayer,
    inRange,
    distance: totalDistance,
    sectorDistance: sectorDist,
    ringDistance: ringDist,
    wrongFacing,
    requiresEngines,
  }
}

/**
 * Check if target is in sector overlap range for broadside/turret weapons
 *
 * Broadside weapons fire radially from the attacker's sector outward.
 * A target is in range if their sector on the target ring overlaps with
 * the angular projection of the attacker's sector.
 *
 * Process:
 * 1. Project the attacker's sector boundaries onto the target ring
 * 2. Find which sectors on the target ring overlap with this projection
 * 3. Check if target is in one of these overlapping sectors
 *
 * Note: sectorRange parameter is currently unused as the visualization
 * only shows geometric sector overlap. May be used for future features.
 */
function checkSectorOverlap(
  attackerShip: ShipState,
  attackerRingConfig: { sectors: number },
  targetShip: ShipState,
  targetRingConfig: { sectors: number },
  _sectorRange: number
): boolean {
  // Calculate attacker's sector boundaries (start and end angles)
  const attackerStartAngle = (attackerShip.sector / attackerRingConfig.sectors) * 2 * Math.PI
  const attackerEndAngle = ((attackerShip.sector + 1) / attackerRingConfig.sectors) * 2 * Math.PI

  // Calculate target sector size
  const targetSectorSize = (2 * Math.PI) / targetRingConfig.sectors

  // Project attacker's sector boundaries onto target ring to find overlapping sectors
  // Find first sector that overlaps with attacker's range
  const firstSectorIndex = Math.floor(attackerStartAngle / targetSectorSize) % targetRingConfig.sectors

  // Find last sector that overlaps with attacker's range
  // Use epsilon to handle floating point precision
  const epsilon = 1e-10
  const endSectorRaw = attackerEndAngle / targetSectorSize
  const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)

  // If we're very close to a sector boundary, don't include the next sector
  const lastSectorIndex = fractionalPart < epsilon
    ? (Math.floor(endSectorRaw) - 1 + targetRingConfig.sectors) % targetRingConfig.sectors
    : Math.floor(endSectorRaw) % targetRingConfig.sectors

  // The valid sectors are those that overlap with the attacker's sector projection
  // sectorRange is not used for expansion - it's handled elsewhere if needed
  const minSector = firstSectorIndex
  const maxSector = lastSectorIndex

  // Check if target sector is in this range
  // Handle wraparound case
  if (minSector <= maxSector) {
    // Range doesn't wrap around 0
    return targetShip.sector >= minSector && targetShip.sector <= maxSector
  } else {
    // Range wraps around 0
    return targetShip.sector >= minSector || targetShip.sector <= maxSector
  }
}
