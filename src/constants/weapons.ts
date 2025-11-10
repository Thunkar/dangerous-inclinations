/**
 * Weapon system for orbital combat
 *
 * Ranges are measured in ANGULAR DEGREES to ensure consistency across rings
 * with different sector counts.
 *
 * Ring targeting: Weapons can target adjacent rings (±1) or same ring.
 */

export interface WeaponConfig {
  name: string
  energyCost: number
  damage: number
  rangeInDegrees: number  // Angular range from ship's position
  ringRange: number       // How many rings away can be targeted (0 = same ring only, 1 = ±1 ring, etc)
  arc: 'forward' | 'broadside' | 'aft' | 'turret'  // Firing arc relative to ship facing
}

export const WEAPONS: Record<string, WeaponConfig> = {
  laser: {
    name: 'Broadside Laser',
    energyCost: 3,
    damage: 2,
    rangeInDegrees: 0,   // Not used for broadside (uses sector overlap instead)
    ringRange: 1,        // Can target adjacent rings (N-1, N, N+1)
    arc: 'broadside',    // Fires radially - targets sectors with angular overlap
  },
  railgun: {
    name: 'Railgun',
    energyCost: 5,
    damage: 4,
    rangeInDegrees: 45,  // Narrow, focused beam along tangent
    ringRange: 0,        // Same ring only - precise shot
    arc: 'forward',      // Fires tangent to orbit in direction of travel
  },
  missiles: {
    name: 'Missiles',
    energyCost: 4,
    damage: 3,
    rangeInDegrees: 60,  // Moderate arc
    ringRange: 2,        // Can target 2 rings away
    arc: 'turret',       // Can fire in any direction
  },
}

/**
 * Calculate if a target is within weapon range.
 *
 * BROADSIDE WEAPONS (NEW SECTOR OVERLAP SYSTEM):
 * Broadside weapons fire radially (perpendicular to orbit) and can only hit ships
 * in sectors that have ANGULAR OVERLAP with your current sector.
 *
 * How sector overlap works:
 * - Each sector covers a specific angular range (e.g., R1 S0 covers 0° to 60°)
 * - Target must be in a sector whose angular range overlaps with yours
 * - This creates a "visibility cone" - you can only hit what you can "see"
 *
 * Example:
 * Ship A: R1 S0 (covers 0° to 60°)
 * Ship B: R3 S0 (covers 0° to 15°) - OVERLAP! Can hit ✓
 * Ship C: R3 S1 (covers 15° to 30°) - OVERLAP! Can hit ✓
 * Ship D: R3 S5 (covers 75° to 90°) - NO OVERLAP! Cannot hit ✗
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

  // Special handling for BROADSIDE weapons: sector overlap system
  if (weapon.arc === 'broadside') {
    // Calculate attacker sector's angular range
    const attackerSectorSize = 360 / attackerSectorCount
    const attackerStartAngle = attackerSector * attackerSectorSize
    const attackerEndAngle = (attackerSector + 1) * attackerSectorSize

    // Calculate target sector's angular range
    const targetSectorSize = 360 / targetSectorCount
    const targetStartAngle = targetSector * targetSectorSize
    const targetEndAngle = (targetSector + 1) * targetSectorSize

    // Check if sectors overlap (handle wrap-around at 360°)
    const overlaps =
      (attackerStartAngle < targetEndAngle && attackerEndAngle > targetStartAngle) ||
      // Wrap-around case
      (attackerStartAngle < targetEndAngle + 360 && attackerEndAngle > targetStartAngle + 360) ||
      (attackerStartAngle + 360 < targetEndAngle && attackerEndAngle + 360 > targetStartAngle)

    // Calculate angular distance for display
    const attackerCenterAngle = attackerStartAngle + attackerSectorSize / 2
    const targetCenterAngle = targetStartAngle + targetSectorSize / 2
    let angularDistance = Math.abs(targetCenterAngle - attackerCenterAngle)
    if (angularDistance > 180) angularDistance = 360 - angularDistance

    return {
      inRange: overlaps,
      angularDistance,
      withinArc: overlaps,
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
