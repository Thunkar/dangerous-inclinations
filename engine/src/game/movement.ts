/**
 * Orbital movement. Every turn a ship drifts by its ring's velocity. A burn
 * then changes ring immediately (prograde = outward, retrograde = inward),
 * optionally phasing the arrival sector for extra mass.
 */
import type { BurnIntensity, Facing, Position, ShipState } from "../models/game.ts";
import { BURN_COSTS, calculateBurnMassCost } from "../models/rings.ts";
import { getMaxRing } from "../models/gravityWells.ts";
import { driftPosition, wrapSector } from "./geometry.ts";

/**
 * One turn of drift. A moored ship (docked at a station) rides its station
 * instead: it holds its berth here and moves with the station at the end of
 * the round (RULES §Moored).
 */
export function applyOrbitalMovement(ship: ShipState, moored = false): ShipState {
  if (moored) return ship;
  const drifted = driftPosition(ship);
  return { ...ship, sector: drifted.sector };
}

/** Ring a burn lands on. Validation rejects burns that would leave the rings; the clamp is a safety net. */
export function burnDestinationRing(
  ship: Pick<ShipState, "wellId" | "ring" | "facing">,
  intensity: BurnIntensity
): number {
  const direction = ship.facing === "prograde" ? 1 : -1;
  const destination = ship.ring + direction * BURN_COSTS[intensity].rings;
  return Math.max(1, Math.min(getMaxRing(ship.wellId), destination));
}

/**
 * Complete a burn from the ship's current (post-drift) position. Spends mass
 * and moves the ship to the destination ring at the phased sector.
 */
export function applyBurn(
  ship: ShipState,
  intensity: BurnIntensity,
  sectorAdjustment: number
): { ship: ShipState; massSpent: number } {
  const massSpent = calculateBurnMassCost(BURN_COSTS[intensity].mass, sectorAdjustment);
  return {
    ship: {
      ...ship,
      reactionMass: ship.reactionMass - massSpent,
      ring: burnDestinationRing(ship, intensity),
      sector: wrapSector(ship.sector + sectorAdjustment),
    },
    massSpent,
  };
}

export function applyRotation(ship: ShipState, facing: Facing): ShipState {
  return { ...ship, facing };
}

export interface MovementPreview {
  kind: "coast" | "burn" | "jump";
  burnIntensity?: BurnIntensity;
  sectorAdjustment?: number;
  /** For jumps: where the lane lands (phasing already applied). */
  jumpDestination?: Position;
  /** For coasts: the ship is moored at a station, so it does not drift. */
  moored?: boolean;
}

/**
 * Where a ship will be after its movement this turn, for previews.
 * Rotation before movement affects the burn direction.
 */
export function projectPosition(
  ship: ShipState,
  facing: Facing = ship.facing,
  movement: MovementPreview = { kind: "coast" }
): Position & { facing: Facing } {
  let projected: ShipState = { ...ship, facing };
  if (movement.kind === "jump" && movement.jumpDestination) {
    return { ...movement.jumpDestination, facing };
  }
  projected = applyOrbitalMovement(
    projected,
    movement.kind === "coast" && movement.moored === true
  );
  if (movement.kind === "burn" && movement.burnIntensity) {
    projected = applyBurn(projected, movement.burnIntensity, movement.sectorAdjustment ?? 0).ship;
  }
  return { wellId: projected.wellId, ring: projected.ring, sector: projected.sector, facing };
}
