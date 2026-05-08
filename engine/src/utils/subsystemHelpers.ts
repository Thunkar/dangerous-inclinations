import type { Subsystem } from "../models/subsystems.ts";
import type { ShipState, ShipLoadout, Facing } from "../models/game.ts";
import { DEFAULT_LOADOUT } from "../models/game.ts";
import {
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
} from "../game/loadout.ts";

// Constants for ship initialization
export const DEFAULT_HIT_POINTS = 10;
const DEFAULT_REACTOR_CAPACITY = 10;

/**
 * Create an initial ship state with all default values.
 * Position fields (wellId, ring, sector, facing) must be provided.
 * Loadout determines which subsystems are installed and affects ship stats.
 * All other fields use sensible defaults that can be overridden.
 */
export function createInitialShipState(
  position: {
    wellId: string;
    ring: number;
    sector: number;
    facing: "prograde" | "retrograde";
  },
  loadout: ShipLoadout = DEFAULT_LOADOUT,
  overrides: Partial<ShipState> = {}
): ShipState {
  // Calculate ship stats from loadout (dissipation, reaction mass, crit chance)
  const stats = calculateShipStatsFromLoadout(loadout);

  return {
    wellId: position.wellId,
    ring: position.ring,
    sector: position.sector,
    facing: position.facing,
    reactionMass: stats.reactionMass,
    hitPoints: DEFAULT_HIT_POINTS,
    maxHitPoints: DEFAULT_HIT_POINTS,
    transferState: null,
    subsystems: createSubsystemsFromLoadout(loadout),
    reactor: {
      totalCapacity: DEFAULT_REACTOR_CAPACITY,
      availableEnergy: DEFAULT_REACTOR_CAPACITY,
    },
    heat: { currentHeat: 0 },
    dissipationCapacity: stats.dissipationCapacity,
    loadout,
    criticalChance: stats.criticalChance,
    ...overrides,
  };
}

// ============================================================================
// Port/Starboard Side Helpers
// ============================================================================

export type ShipSide = "port" | "starboard";
export type RingDirection = "outward" | "inward";

/**
 * Determine which side of the ship a subsystem is mounted on.
 * Port = side slots 0-1, Starboard = side slots 2-3.
 * Returns null for non-side subsystems (fixed, forward).
 */
export function getSubsystemSide(subsystem: Subsystem): ShipSide | null {
  if (subsystem.slotType !== "side" || subsystem.slotIndex === undefined) return null;
  return subsystem.slotIndex <= 1 ? "port" : "starboard";
}

/**
 * Determine which ring direction a side can fire at, given the ship's facing.
 * When prograde: port faces outward (higher rings), starboard faces inward (lower rings).
 * When retrograde: sides flip.
 */
export function getSideFiringDirection(side: ShipSide, facing: Facing): RingDirection {
  if (facing === "prograde") {
    return side === "port" ? "outward" : "inward";
  } else {
    return side === "port" ? "inward" : "outward";
  }
}

/**
 * Check if a target ring is valid for a side-restricted weapon.
 * Outward = target ring > attacker ring, Inward = target ring < attacker ring.
 */
export function isRingDirectionValid(
  attackerRing: number,
  targetRing: number,
  direction: RingDirection,
): boolean {
  if (direction === "outward") return targetRing > attackerRing;
  return targetRing < attackerRing;
}
