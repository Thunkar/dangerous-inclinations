import type { GravityWellId, Facing, BurnIntensity } from "../../models/game.ts";
import { MAX_REACTION_MASS } from "../../models/game.ts";

/**
 * Position within an orbital system (well, ring, sector).
 */
export interface OrbitalPosition {
  wellId: GravityWellId;
  ring: number;
  sector: number;
}

/**
 * Position with facing direction (needed for burn calculations).
 */
export interface OrientedPosition extends OrbitalPosition {
  facing: Facing;
}

/**
 * Types of movement actions in a plan.
 */
export type MovementActionType = "coast" | "burn_prograde" | "burn_retrograde" | "well_transfer";

/**
 * A single step in a movement plan.
 */
export interface MovementStep {
  from: OrientedPosition;
  to: OrbitalPosition;
  actionType: MovementActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  requiresRotation: boolean;
  /** Mass spent on this step. Negative means mass recovered by the scoop. */
  massCost: number;
}

/**
 * Complete movement plan from origin to destination.
 */
export interface MovementPlan {
  origin: OrientedPosition;
  destination: OrbitalPosition;
  steps: MovementStep[];
  totalMassCost: number;
  totalTurns: number;
  crossesWells: boolean;
  mode: PlannerMode;
  /** Human-readable label for UI display (e.g., "Fastest", "Economical", "Balanced") */
  label?: string;
}

/**
 * Collection of alternative routes to a destination.
 */
export interface MovementAlternatives {
  destination: OrbitalPosition;
  /** All unique route alternatives, sorted by preference */
  alternatives: MovementPlan[];
}

/**
 * Planner optimization mode
 * - fastest: minimize number of turns
 * - economical: minimize fuel (mass) usage
 */
export type PlannerMode = "fastest" | "economical";

/**
 * Options for the movement planner.
 */
export interface PlannerOptions {
  mode: PlannerMode;
  maxTurns: number;
  /** Reaction mass the ship may spend. */
  availableMass: number;
  allowWellTransfers: boolean;
  /** Coasting recovers mass equal to the ring's velocity. */
  hasFuelScoop: boolean;
  /** Maximum fuel the ship can hold (caps scoop recovery). */
  maxFuelCapacity: number;
  /** A working fuel compressor cheapens a jump's own fuel (never its phasing). */
  hasFuelCompressor: boolean;
}

export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
  mode: "fastest",
  maxTurns: 20,
  availableMass: MAX_REACTION_MASS,
  allowWellTransfers: true,
  hasFuelScoop: false,
  maxFuelCapacity: MAX_REACTION_MASS,
  hasFuelCompressor: false,
};

/**
 * Internal search node for the reverse BFS.
 */
export interface SearchNode {
  position: OrientedPosition;
  turns: number;
  massCost: number;
  /** The action that led TO this node (from its predecessor in time, which is its successor in the search) */
  action: MovementActionType | null;
  burnIntensity: BurnIntensity | null;
  sectorAdjustment: number;
  /** Reference to the node we came FROM in the search (which is the NEXT step in the actual path) */
  nextInPath: SearchNode | null;
}

/**
 * Information about a predecessor position (one that can reach target in one turn).
 */
export interface PredecessorInfo {
  position: OrientedPosition;
  actionType: MovementActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  massCost: number;
  requiresRotation: boolean;
}

/**
 * Key for position lookup in visited maps.
 */
export function positionKey(pos: OrientedPosition): string {
  return `${pos.wellId}:${pos.ring}:${pos.sector}:${pos.facing}`;
}

/**
 * Bit-packed integer encoding of an oriented position. Used by hot-path
 * planner code that visits many positions per call: a `Map<number, …>`
 * keyed on this integer is materially faster than a `Map<string, …>`
 * keyed on {@link positionKey}, because it avoids allocating a string per
 * lookup.
 *
 * Encoding (bits, low → high):
 *
 *   bit  0     facing            (1 bit)   0 = prograde, 1 = retrograde
 *   bits 1-5   sector            (5 bits)  0-23 (range 0-31)
 *   bits 6-8   ring              (3 bits)  1-5 (range 0-7)
 *   bits 9-12  wellIndex         (4 bits)  one slot per gravity well
 */
const wellIndexCache: Record<string, number> = Object.create(null);
let wellIndexCount = 0;
function wellIdToIndex(wellId: string): number {
  const cached = wellIndexCache[wellId];
  if (cached !== undefined) return cached;
  if (wellIndexCount >= 16) {
    throw new Error(`positionKeyInt: wellId budget (16) exceeded by ${wellId}`);
  }
  const idx = wellIndexCount++;
  wellIndexCache[wellId] = idx;
  return idx;
}

export function positionKeyInt(pos: OrientedPosition): number {
  const facing = pos.facing === "retrograde" ? 1 : 0;
  return facing | (pos.sector << 1) | (pos.ring << 6) | (wellIdToIndex(pos.wellId) << 9);
}
