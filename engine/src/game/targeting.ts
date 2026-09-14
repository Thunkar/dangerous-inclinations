/**
 * Weapon ranges. Targets are positions (public information), so the same code
 * serves the engine, the bots and the UI's range previews.
 *
 * Spinal (railgun): same ring, 1..sectorRange sectors ahead in facing direction.
 * Broadside (laser, rack): within ±ringRange rings and ±sectorRange sectors.
 *   Side-restricted broadsides only fire toward the ring direction their side
 *   faces; same-ring shots need `canTargetSameRing`.
 * Turret (missiles): within ±ringRange rings and ±sectorRange sectors, any facing
 *   (including a ship sharing the launcher's sector).
 * Nothing fires across gravity wells.
 */
import type { Position, ShipState } from "../models/game.ts";
import type { Subsystem, WeaponStats } from "../models/subsystems.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { forwardDistance, sectorDistance } from "./geometry.ts";
import { getSideFiringDirection, getSubsystemSide, isRingDirectionValid } from "./ship.ts";

export interface FiringSolution {
  targetId: string;
  inRange: boolean;
  ringDistance: number;
  sectorDistance: number;
}

export function isInWeaponRange(
  weapon: Subsystem,
  attacker: Pick<ShipState, "wellId" | "ring" | "sector" | "facing">,
  target: Position
): boolean {
  const stats = getSubsystemConfig(weapon.type).weaponStats;
  if (!stats) return false;
  if (target.wellId !== attacker.wellId) return false;
  return checkRange(stats, weapon, attacker, target);
}

function checkRange(
  stats: WeaponStats,
  weapon: Subsystem,
  attacker: Pick<ShipState, "ring" | "sector" | "facing">,
  target: Position
): boolean {
  const ringDist = Math.abs(target.ring - attacker.ring);
  const sectorDist = sectorDistance(attacker.sector, target.sector);

  switch (stats.arc) {
    case "spinal": {
      if (ringDist !== 0) return false;
      const ahead =
        attacker.facing === "prograde"
          ? forwardDistance(attacker.sector, target.sector)
          : forwardDistance(target.sector, attacker.sector);
      return ahead > 0 && ahead <= stats.sectorRange;
    }
    case "broadside": {
      if (sectorDist > stats.sectorRange) return false;
      if (ringDist === 0) return stats.canTargetSameRing === true && sectorDist > 0;
      if (ringDist > stats.ringRange) return false;
      if (stats.sideRestricted) {
        const side = getSubsystemSide(weapon);
        if (side) {
          const direction = getSideFiringDirection(side, attacker.facing);
          if (!isRingDirectionValid(attacker.ring, target.ring, direction)) return false;
        }
      }
      return true;
    }
    case "turret":
      return ringDist <= stats.ringRange && sectorDist <= stats.sectorRange;
  }
}

export function calculateFiringSolutions(
  weapon: Subsystem,
  attacker: Pick<ShipState, "wellId" | "ring" | "sector" | "facing">,
  targets: ReadonlyArray<{ id: string; position: Position }>
): FiringSolution[] {
  return targets.map(({ id, position }) => ({
    targetId: id,
    inRange: isInWeaponRange(weapon, attacker, position),
    ringDistance: Math.abs(position.ring - attacker.ring),
    sectorDistance: sectorDistance(attacker.sector, position.sector),
  }));
}
