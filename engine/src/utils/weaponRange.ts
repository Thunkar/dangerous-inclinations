import type { Player, ShipState } from "../models/game";
import type { WeaponStats } from "../models/subsystems";
import { SECTORS_PER_RING } from "../models/rings";

export interface FiringSolution {
  targetId: string;
  targetPlayer: Player;
  inRange: boolean;
  distance: number; // Total sectors + rings
  sectorDistance: number;
  ringDistance: number;
  wrongFacing?: boolean; // For spinal weapons
  requiresEngines?: boolean; // For railgun recoil warning
}

/**
 * Calculate all firing solutions for a weapon
 * Uses separate ring range and sector range
 *
 * Weapons can only target ships in the same gravity well
 */
export function calculateFiringSolutions(
  weapon: WeaponStats,
  attackerShip: ShipState,
  allPlayers: Player[],
  currentPlayerId: string,
  pendingFacing?: string,
): FiringSolution[] {
  // Use pending facing if provided (planning phase), otherwise use committed facing
  const effectiveShip: ShipState = {
    ...attackerShip,
    facing: (pendingFacing as any) || attackerShip.facing,
  };

  return allPlayers
    .filter(
      (p) =>
        p.id !== currentPlayerId &&
        p.ship.hitPoints > 0 &&
        p.ship.wellId === attackerShip.wellId, // Only target ships in same gravity well
    )
    .map((targetPlayer) =>
      calculateSingleTarget(weapon, effectiveShip, targetPlayer),
    );
}

/**
 * Calculate firing solution for a single target
 */
function calculateSingleTarget(
  weapon: WeaponStats,
  attackerShip: ShipState,
  targetPlayer: Player,
): FiringSolution {
  const targetShip = targetPlayer.ship;

  // Calculate ring distance
  const ringDist = Math.abs(targetShip.ring - attackerShip.ring);

  // Calculate sector distance (shortest path around the ring)
  // All rings have 24 sectors uniformly
  let sectorDist = Math.abs(targetShip.sector - attackerShip.sector);
  const halfRing = SECTORS_PER_RING / 2;
  if (sectorDist > halfRing) {
    sectorDist = SECTORS_PER_RING - sectorDist;
  }

  // Total distance for display
  const totalDistance = sectorDist + ringDist;

  // Arc-specific checks
  let inRange = false;
  let wrongFacing = false;
  let requiresEngines = false;

  if (weapon.arc === "spinal") {
    // Spinal weapons fire tangentially along orbit on same ring only
    // Range is defined by weapon.sectorRange (fixed 6 sectors for railgun)

    // Must be on same ring
    if (ringDist !== 0) {
      inRange = false;
      wrongFacing = false;
    } else {
      // Use fixed sectorRange from weapon stats
      const spinalRange = weapon.sectorRange;

      // Calculate sector distance in facing direction
      let facingDist: number;
      if (attackerShip.facing === "prograde") {
        // Measure distance forward (increasing sector numbers)
        facingDist =
          (targetShip.sector - attackerShip.sector + SECTORS_PER_RING) %
          SECTORS_PER_RING;
      } else {
        // Measure distance backward (decreasing sector numbers)
        facingDist =
          (attackerShip.sector - targetShip.sector + SECTORS_PER_RING) %
          SECTORS_PER_RING;
      }

      // In range if within facing direction and within range
      inRange = facingDist > 0 && facingDist <= spinalRange;
      wrongFacing = false;
    }

    // Check if railgun recoil compensation is needed
    if (weapon.hasRecoil) {
      requiresEngines = true;
    }
  } else if (weapon.arc === "broadside") {
    // Broadside weapons fire radially from current sector
    // Must be within ring range and sector overlap
    inRange =
      ringDist <= weapon.ringRange &&
      ringDist > 0 &&
      checkSectorOverlap(attackerShip, targetShip, weapon.sectorRange);
  } else if (weapon.arc === "turret") {
    // Turret has no facing restrictions
    inRange =
      ringDist <= weapon.ringRange &&
      ringDist > 0 &&
      checkSectorOverlap(attackerShip, targetShip, weapon.sectorRange);
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
  };
}

/**
 * Check if target is in sector overlap range for broadside/turret weapons
 *
 * With uniform 24-sector rings, broadside weapons use simple sector arithmetic:
 * - Target must be at attacker's sector ±sectorRange
 * - Example: sectorRange=1 means target can be at sectors [attacker-1, attacker, attacker+1]
 *
 * This creates a ±1 sector spread for broadside weapons, providing better
 * tactical flexibility compared to the old angular overlap system.
 */
function checkSectorOverlap(
  attackerShip: ShipState,
  targetShip: ShipState,
  sectorRange: number,
): boolean {
  // All rings have 24 sectors uniformly - use simple sector arithmetic
  // Calculate the shortest sector distance (accounting for wrap-around)
  let sectorDistance = Math.abs(targetShip.sector - attackerShip.sector);
  const halfSectors = SECTORS_PER_RING / 2;
  if (sectorDistance > halfSectors) {
    sectorDistance = SECTORS_PER_RING - sectorDistance;
  }

  // Target is in range if within ±sectorRange sectors
  return sectorDistance <= sectorRange;
}
