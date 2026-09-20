/**
 * Sector arithmetic. Every ring has SECTORS_PER_RING sectors; sector numbers
 * increase in the prograde direction and wrap around.
 */
import type { Position, ShipState, GravityWellId } from "../models/game.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import { getRingConfig } from "../models/gravityWells.ts";

export function wrapSector(sector: number): number {
  return ((sector % SECTORS_PER_RING) + SECTORS_PER_RING) % SECTORS_PER_RING;
}

/** Shortest distance around the ring (0..12). */
export function sectorDistance(a: number, b: number): number {
  const d = Math.abs(wrapSector(a) - wrapSector(b));
  return Math.min(d, SECTORS_PER_RING - d);
}

/** Sectors from `from` to `to` moving prograde (0..23). */
export function forwardDistance(from: number, to: number): number {
  return wrapSector(to - from);
}

/** Direction of the shortest path from `from` to `to`: +1 prograde, -1 retrograde, 0 if equal. */
export function sectorStepToward(from: number, to: number): 1 | -1 | 0 {
  if (wrapSector(from) === wrapSector(to)) return 0;
  return forwardDistance(from, to) <= SECTORS_PER_RING / 2 ? 1 : -1;
}

export function ringVelocity(wellId: GravityWellId, ring: number): number {
  return getRingConfig(wellId, ring)?.velocity ?? 1;
}

/** One turn of orbital drift for anything sitting on a ring. */
export function driftPosition(position: Position): Position {
  return {
    ...position,
    sector: wrapSector(position.sector + ringVelocity(position.wellId, position.ring)),
  };
}

export function positionOf(ship: ShipState | Position): Position {
  return { wellId: ship.wellId, ring: ship.ring, sector: ship.sector };
}

export function samePosition(a: Position, b: Position): boolean {
  return a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector;
}
