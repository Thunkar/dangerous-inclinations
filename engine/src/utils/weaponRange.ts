import type { Player, ShipState } from "../models/game.ts";
import type { WeaponStats, Subsystem } from "../models/subsystems.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import {
  getSubsystemSide,
  getSideFiringDirection,
  isRingDirectionValid,
} from "./subsystemHelpers.ts";

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
 * Calculate all firing solutions for a weapon subsystem.
 * Resolves weapon stats from the subsystem's type config.
 *
 * Weapons can only target ships in the same gravity well.
 */
export function calculateFiringSolutions(
  subsystem: Subsystem,
  attackerShip: ShipState,
  allPlayers: Player[],
  currentPlayerId: string,
  pendingFacing?: string,
): FiringSolution[] {
  const config = getSubsystemConfig(subsystem.type);
  const weapon = config.weaponStats;
  if (!weapon) return [];

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
      calculateSingleTarget(weapon, effectiveShip, targetPlayer, subsystem),
    );
}

/**
 * Calculate firing solution for a single target
 */
function calculateSingleTarget(
  weapon: WeaponStats,
  attackerShip: ShipState,
  targetPlayer: Player,
  subsystem: Subsystem,
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
    // Standard broadside: must be on a different ring within ringRange
    const sectorInRange = checkSectorOverlap(attackerShip, targetShip, weapon.sectorRange);
    let basicInRange = ringDist <= weapon.ringRange && ringDist > 0 && sectorInRange;

    // canTargetSameRing: also allow targeting on the same ring (for ballistic rack)
    if (!basicInRange && weapon.canTargetSameRing && ringDist === 0 && sectorDist > 0) {
      basicInRange = sectorInRange;
    }

    // Side restriction: weapon can only fire toward the ring direction matching its mounted side
    // Only enforced for cross-ring fire (ringDist > 0), same-ring fire is not directional
    if (basicInRange && weapon.sideRestricted && ringDist > 0) {
      const side = getSubsystemSide(subsystem);
      if (side) {
        const direction = getSideFiringDirection(side, attackerShip.facing);
        if (!isRingDirectionValid(attackerShip.ring, targetShip.ring, direction)) {
          basicInRange = false;
        }
      }
    }

    inRange = basicInRange;
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
