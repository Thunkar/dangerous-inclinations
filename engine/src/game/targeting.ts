/**
 * Weapon ranges. Targets are positions (public information), so the same code
 * serves the engine, the bots and the UI's range previews.
 *
 * Point blank: a target in the attacker's own ring and sector is in range of
 *   every weapon, whatever its arc.
 * Spinal (railgun): same ring, 1..sectorRange sectors ahead in facing direction.
 * Broadside (laser, rack): within ±ringRange rings and ±sectorRange sectors.
 *   Side-restricted broadsides only fire toward the ring direction their side
 *   faces; same-ring shots need `canTargetSameRing`.
 * Turret (missiles): any ship in the launcher's well, any facing, any
 *   distance — a guided projectile has no firing box, its flight is its
 *   range (see `missileCanReach`, game/missiles.ts, for whether it will
 *   actually catch up).
 * Nothing fires across gravity wells.
 */
import type { Position, ShipState } from "../models/game.ts";
import type { Subsystem, WeaponStats } from "../models/subsystems.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { forwardDistance, sectorDistance } from "./geometry.ts";
import { missileCanReach } from "./missiles.ts";
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
  // A boxed weapon always carries its box; a turret has none (fails closed).
  const ringRange = stats.ringRange ?? 0;
  const sectorRange = stats.sectorRange ?? 0;

  /**
   * Point blank. Two ships sharing a sector are on top of each other, and every
   * firing box excluded that: the railgun wants a target *ahead*, a broadside
   * wants a side to fire toward, and neither means anything at zero range. Only
   * a missile could reach a ship you were sitting on, which is not a rule
   * anyone would write down — and a Board card puts you there on purpose.
   */
  if (ringDist === 0 && sectorDist === 0) return true;

  switch (stats.arc) {
    case "spinal": {
      if (ringDist !== 0) return false;
      const ahead =
        attacker.facing === "prograde"
          ? forwardDistance(attacker.sector, target.sector)
          : forwardDistance(target.sector, attacker.sector);
      return ahead > 0 && ahead <= sectorRange;
    }
    case "broadside": {
      if (sectorDist > sectorRange) return false;
      if (ringDist === 0) return stats.canTargetSameRing === true && sectorDist > 0;
      if (ringDist > ringRange) return false;
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
      // Self-guided: the well is the only limit. Whether the projectile can
      // still catch a drifting target is the projectile's problem, not the
      // launcher's — a missile that never closes is simply wasted.
      return true;
  }
}

/**
 * Whether the shot is worth taking, not merely legal.
 *
 * {@link isInWeaponRange} answers the rules question — the referee lets a
 * missile go at anyone in the well — and a launch at a ship no missile could
 * catch is a legal way to waste one. This answers the other question: would
 * anything actually arrive? Boxed weapons hit the moment they are in range;
 * a guided one has to run its target down, so it is asked
 * {@link missileCanReach}. Bots plan with this, and so does the board's range
 * preview; the engine still validates with the range rule alone.
 *
 * @param afterMoving the shot is taken once the ship has moved this turn, so a
 *   missile rides along and skips its first drift.
 */
export function canEngage(
  weapon: Subsystem,
  attacker: Pick<ShipState, "wellId" | "ring" | "sector" | "facing">,
  target: Position,
  afterMoving = false
): boolean {
  if (!isInWeaponRange(weapon, attacker, target)) return false;
  const stats = getSubsystemConfig(weapon.type).weaponStats;
  if (stats?.arc !== "turret") return true;
  return missileCanReach(attacker, target, afterMoving);
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
