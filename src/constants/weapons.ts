/**
 * Weapon system for orbital combat
 *
 * Ranges are measured in ANGULAR DEGREES to ensure consistency across rings
 * with different sector counts.
 *
 * Ring targeting: Weapons can target adjacent rings (±1) or same ring.
 *
 * NOTE: Weapon configurations are defined in subsystems.ts as SUBSYSTEM_CONFIGS.
 * This file only contains the range calculation logic.
 */

import { SUBSYSTEM_CONFIGS, type SubsystemType } from '../types/subsystems'

export interface WeaponConfig {
  name: string
  energyCost: number
  damage: number
  rangeInDegrees: number  // Angular range from ship's position
  ringRange: number       // How many rings away can be targeted (0 = same ring only, 1 = ±1 ring, etc)
  arc: 'forward' | 'broadside' | 'aft' | 'turret'  // Firing arc relative to ship facing
}

/**
 * Get weapon configuration from subsystems
 */
export function getWeaponConfig(weaponType: SubsystemType): WeaponConfig | undefined {
  const subsystemConfig = SUBSYSTEM_CONFIGS[weaponType]
  if (!subsystemConfig?.weaponStats) return undefined

  const stats = subsystemConfig.weaponStats

  // Convert arc from weaponStats format to WeaponConfig format
  let arc: 'forward' | 'broadside' | 'aft' | 'turret'
  if (stats.arc === 'spinal') {
    arc = 'forward'
  } else if (stats.arc === 'broadside') {
    arc = 'broadside'
  } else if (stats.arc === 'turret') {
    arc = 'turret'
  } else {
    arc = 'forward'
  }

  // Calculate rangeInDegrees from sectorRange
  // For broadside weapons, this isn't used (sector overlap system)
  // For spinal weapons (railgun), range is dynamic (2×ring number)
  // For turret weapons, use sectorRange to calculate degrees
  let rangeInDegrees = 0
  if (stats.arc === 'turret') {
    // For turret: sectorRange of 3 means ±3 sectors visibility
    // On a 24-sector ring, 3 sectors = 45°
    rangeInDegrees = (stats.sectorRange / 24) * 360
  } else if (stats.arc === 'spinal') {
    // For spinal (railgun): narrow focused beam
    rangeInDegrees = 45
  }

  return {
    name: subsystemConfig.name,
    energyCost: subsystemConfig.minEnergy,
    damage: stats.damage,
    rangeInDegrees,
    ringRange: stats.ringRange,
    arc,
  }
}

/**
 * Legacy WEAPONS record for backward compatibility
 * Dynamically generated from subsystem configs
 */
export const WEAPONS: Record<string, WeaponConfig> = {
  get laser() { return getWeaponConfig('laser')! },
  get railgun() { return getWeaponConfig('railgun')! },
  get missiles() { return getWeaponConfig('missiles')! },
}

/**
 * Calculate if a target is within weapon range.
 *
 * BROADSIDE WEAPONS (SIMPLIFIED FOR UNIFORM 24-SECTOR RINGS):
 * Broadside weapons fire radially (perpendicular to orbit) and can hit ships
 * at the same sector ±1 on adjacent rings (±1 ring).
 *
 * With all rings having 24 sectors, broadside targeting is simple:
 * - Target must be on adjacent ring (ringRange = 1, so ±1 ring)
 * - Target must be at same sector ±1 (provides spread)
 *
 * Example:
 * Ship at R2S5 can target:
 * - R1S4, R1S5, R1S6 (inner ring, sector spread)
 * - R3S4, R3S5, R3S6 (outer ring, sector spread)
 *
 * For NON-BROADSIDE weapons (forward, aft, turret):
 * Uses traditional angular distance and firing arc calculations.
 */
export function calculateWeaponRange(
  attackerRing: number,
  attackerSector: number,
  attackerSectorCount: number,
  attackerFacing: 'prograde' | 'retrograde',
  targetRing: number,
  targetSector: number,
  targetSectorCount: number,
  weapon: WeaponConfig | { rangeInDegrees: number; ringRange: number; arc: string }
): {
  inRange: boolean
  angularDistance: number
  withinArc: boolean
  degreesFromCenter: number
  ringDistance: number
} {
  // Step 1: Check ring distance
  const ringDistance = Math.abs(attackerRing - targetRing)
  if (ringDistance > weapon.ringRange) {
    return {
      inRange: false,
      angularDistance: 0,
      withinArc: false,
      degreesFromCenter: 0,
      ringDistance,
    }
  }

  // Special handling for BROADSIDE weapons: Simple sector matching for uniform 24-sector rings
  // Broadside fires radially and can hit adjacent rings at the same sector ±1
  if (weapon.arc === 'broadside') {
    // Since all rings now have 24 sectors, we can use simple sector arithmetic
    // Broadside can target the same sector ±1 on adjacent rings
    // Example: Ship at R2S5 can target R1S4, R1S5, R1S6 and R3S4, R3S5, R3S6

    // Calculate the shortest sector distance (accounting for wrap-around)
    let sectorDistance = Math.abs(targetSector - attackerSector)
    const halfSectors = attackerSectorCount / 2
    if (sectorDistance > halfSectors) {
      sectorDistance = attackerSectorCount - sectorDistance
    }

    // Broadside can target ±1 sector (so 0 or 1 sector away)
    const withinSectorRange = sectorDistance <= 1

    // Calculate angular distance for display
    const attackerSectorSize = 360 / attackerSectorCount
    const attackerCenterAngle = (attackerSector + 0.5) * attackerSectorSize
    const targetSectorSize = 360 / targetSectorCount
    const targetCenterAngle = (targetSector + 0.5) * targetSectorSize
    let angularDistance = Math.abs(targetCenterAngle - attackerCenterAngle)
    if (angularDistance > 180) angularDistance = 360 - angularDistance

    return {
      inRange: withinSectorRange,
      angularDistance,
      withinArc: withinSectorRange,
      degreesFromCenter: 0, // Broadside fires radially
      ringDistance,
    }
  }

  // For non-broadside weapons: traditional angular targeting
  // Step 2: Calculate angular positions (0-360 degrees, 0° = 12 o'clock)
  // Add 0.5 to get center of sector
  const attackerAngle = ((attackerSector + 0.5) / attackerSectorCount) * 360
  const targetAngle = ((targetSector + 0.5) / targetSectorCount) * 360

  // Step 3: Calculate relative angle (where is target relative to attacker?)
  // Positive = clockwise, Negative = counter-clockwise
  let relativeAngle = targetAngle - attackerAngle
  // Normalize to -180 to +180
  if (relativeAngle > 180) relativeAngle -= 360
  if (relativeAngle < -180) relativeAngle += 360

  // Step 4: Calculate angular distance (absolute value, shortest path)
  const angularDistance = Math.abs(relativeAngle)

  // Step 5: Determine if target is within firing arc
  let withinArc = false
  let arcCenter = 0 // Where does this weapon point?

  switch (weapon.arc) {
    case 'turret':
      // Can fire in any direction
      withinArc = true
      break

    case 'forward':
      // Fires tangent to orbit in direction of travel
      // Prograde = +90° (clockwise from radial), Retrograde = -90° (counter-clockwise)
      arcCenter = attackerFacing === 'prograde' ? 90 : -90
      const degreesFromForward = Math.abs(relativeAngle - arcCenter)
      withinArc = degreesFromForward <= weapon.rangeInDegrees / 2
      break

    case 'aft':
      // Fires tangent to orbit opposite to direction of travel
      arcCenter = attackerFacing === 'prograde' ? -90 : 90
      const degreesFromAft = Math.abs(relativeAngle - arcCenter)
      withinArc = degreesFromAft <= weapon.rangeInDegrees / 2
      break
  }

  // Step 6: Final check - within arc AND within range
  const inRange = withinArc && angularDistance <= weapon.rangeInDegrees

  return {
    inRange,
    angularDistance,
    withinArc,
    degreesFromCenter: arcCenter,
    ringDistance,
  }
}

/**
 * Helper to convert angular degrees to sector count on a specific ring.
 * Useful for showing range indicators on the board.
 *
 * Example: 90 degrees on Ring 1 (6 sectors) = 1.5 sectors
 *          90 degrees on Ring 6 (24 sectors) = 6 sectors
 */
export function degreesToSectors(degrees: number, sectorCount: number): number {
  return (degrees / 360) * sectorCount
}

/**
 * Helper to convert sector distance to angular degrees
 */
export function sectorsToDegrees(sectors: number, sectorCount: number): number {
  return (sectors / sectorCount) * 360
}
