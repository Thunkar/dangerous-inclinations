/**
 * Orbital movement. Every turn a ship drifts by its ring's velocity. A burn
 * then changes ring immediately (prograde = outward, retrograde = inward),
 * optionally phasing the arrival sector for extra mass.
 */
import type { BurnIntensity, Facing, GravityWellId, Position, ShipState } from "../models/game.ts";
import {
  BURN_COSTS,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  getAdjustmentRange,
} from "../models/rings.ts";
import { getJumpAdjustmentRange, getJumpOptions, getMaxRing } from "../models/gravityWells.ts";
import { driftPosition, positionOf, ringVelocity, wrapSector } from "./geometry.ts";
import { hasWorkingCompressor } from "./ship.ts";

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

/**
 * The ring `rings` steps from the ship's own in its facing direction
 * (prograde = outward, retrograde = inward), or null when that would leave
 * the well's rings. A burn moves this way.
 */
export function ringAfter(
  ship: Pick<ShipState, "wellId" | "ring" | "facing">,
  rings: number
): number | null {
  const ring = ship.ring + (ship.facing === "prograde" ? 1 : -1) * rings;
  return ring >= 1 && ring <= getMaxRing(ship.wellId) ? ring : null;
}

/**
 * The ring a railgun's recoil pushes the ship to, or null when that would
 * leave the well's rings: one ring against its facing, since the shot goes
 * forward (facing prograde, inward; retrograde, outward).
 */
export function recoilRing(ship: Pick<ShipState, "wellId" | "ring" | "facing">): number | null {
  return ringAfter({ ...ship, facing: ship.facing === "prograde" ? "retrograde" : "prograde" }, 1);
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
      // Validation refuses a burn off the rings; a preview of one stays put.
      ring: ringAfter(ship, BURN_COSTS[intensity].rings) ?? ship.ring,
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

/** A burn the ship can make this turn, and the phasing its tank can pay for. */
export interface LegalBurn {
  intensity: BurnIntensity;
  /** Facing the burn needs (prograde burns outward, retrograde inward). */
  facing: Facing;
  toRing: number;
  engineEnergy: number;
  /** Fuel for the burn unphased. */
  fuel: number;
  /** Sectors of phasing allowed on arrival, within what the tank can pay at 1 fuel each. */
  adjustment: { min: number; max: number };
  /** Whether the ship must rotate first (one thruster cube, one heat). */
  needsRotation: boolean;
}

/** A jump the ship can make this turn from the departure arc it is in. */
export interface LegalJump {
  destinationWellId: GravityWellId;
  /** The matching sector of the arrival arc: where an unphased jump lands. */
  destination: Position;
  energy: number;
  /** Fuel for the jump unphased (less with a working compressor). */
  fuel: number;
  /** Fuel each sector of phasing costs; a compressor does not pay for it. */
  phasingFuel: number;
  /** Sectors the landing may be shifted by, inside the arrival arc and what the tank can pay. */
  adjustment: { min: number; max: number };
  /** Whether the ship must rotate to prograde first (one thruster cube, one heat). */
  needsRotation: boolean;
}

/**
 * Every move the ship can make this turn besides a coast, which is always
 * legal: each burn with the phasing its tank covers, and each jump from the
 * departure arc it sits in. A move needs working, unused engines, a burn the
 * other way needs working, unused thrusters to turn first, and every sector
 * of phasing is a fuel the tank must hold on top of the move's own.
 */
export function legalMoves(ship: ShipState): { burns: LegalBurn[]; jumps: LegalJump[] } {
  const ready = (id: "engines" | "rotation") => {
    const sub = ship.subsystems.find((s) => s.id === id);
    return sub !== undefined && !sub.isBroken && !sub.usedThisTurn;
  };
  if (!ready("engines")) return { burns: [], jumps: [] };
  /** The part of `range` the fuel left after `base` can pay for, or null when `base` is too much. */
  const payable = (range: { min: number; max: number }, base: number) => {
    const spare = ship.reactionMass - base;
    if (spare < 0) return null;
    const sectors = Math.floor(spare / SECTOR_ADJUSTMENT_COST_PER_SECTOR);
    return { min: Math.max(range.min, -sectors), max: Math.min(range.max, sectors) };
  };

  const burns: LegalBurn[] = [];
  const velocity = ringVelocity(ship.wellId, ship.ring);
  for (const facing of ["prograde", "retrograde"] as const) {
    const needsRotation = facing !== ship.facing;
    if (needsRotation && !ready("rotation")) continue;
    for (const intensity of ["soft", "medium", "hard"] as const) {
      const cost = BURN_COSTS[intensity];
      const toRing = ringAfter({ ...ship, facing }, cost.rings);
      const adjustment = payable(getAdjustmentRange(velocity), cost.mass);
      if (toRing === null || !adjustment) continue;
      burns.push({
        intensity,
        facing,
        toRing,
        engineEnergy: cost.energy,
        fuel: cost.mass,
        adjustment,
        needsRotation,
      });
    }
  }

  const jumps: LegalJump[] = [];
  const fuel = calculateJumpMassCost(0, hasWorkingCompressor(ship));
  // A jump is a burn out of the well: it needs prograde facing.
  const jumpNeedsRotation = ship.facing !== "prograde";
  for (const option of getJumpOptions(positionOf(ship))) {
    if (jumpNeedsRotation && !ready("rotation")) continue;
    const adjustment = payable(getJumpAdjustmentRange(option), fuel);
    if (!adjustment) continue;
    jumps.push({
      destinationWellId: option.destination.wellId,
      destination: option.destination,
      energy: WELL_TRANSFER_COSTS.energy,
      fuel,
      phasingFuel: SECTOR_ADJUSTMENT_COST_PER_SECTOR,
      adjustment,
      needsRotation: jumpNeedsRotation,
    });
  }
  return { burns, jumps };
}

/** Whether `sectors` of phasing is inside a legal move's range. */
export function phasingAllowed(move: { adjustment: { min: number; max: number } }, sectors: number) {
  return sectors >= move.adjustment.min && sectors <= move.adjustment.max;
}
