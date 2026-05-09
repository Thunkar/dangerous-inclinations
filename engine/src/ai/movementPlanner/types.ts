import type { GravityWellId, Facing, BurnIntensity } from "../../models/game.ts";

/**
 * Position within an orbital system (well, ring, sector)
 */
export interface OrbitalPosition {
  wellId: GravityWellId;
  ring: number;
  sector: number;
}

/**
 * Position with facing direction (needed for burn calculations)
 */
export interface OrientedPosition extends OrbitalPosition {
  facing: Facing;
}

/**
 * Types of movement actions in a plan
 */
export type MovementActionType =
  | "coast"
  | "burn_prograde"
  | "burn_retrograde"
  | "well_transfer";

/**
 * A single step in a movement plan
 */
export interface MovementStep {
  from: OrientedPosition;
  to: OrbitalPosition;
  actionType: MovementActionType;
  burnIntensity?: BurnIntensity;
  sectorAdjustment: number;
  requiresRotation: boolean;
  massCost: number;
}

/**
 * Complete movement plan from origin to destination
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
 * Collection of alternative routes to a destination
 */
export interface MovementAlternatives {
  destination: OrbitalPosition;
  /** All unique route alternatives, sorted by preference */
  alternatives: MovementPlan[];
}

/**
 * Planner optimization mode
 * - fastest: Minimize number of turns
 * - economical: Minimize fuel (mass) usage
 */
export type PlannerMode = "fastest" | "economical";

/**
 * Options for the movement planner
 */
export interface PlannerOptions {
  mode: PlannerMode;
  maxTurns: number;
  availableMass: number;
  currentFacing: Facing;
  allowWellTransfers: boolean;
  fuelReserve: number;
  hasFuelScoop: boolean;
  /** Maximum fuel the ship can hold (10 base + 6 per fuel tank). Caps scoop recovery. */
  maxFuelCapacity: number;
}

/**
 * Internal search node for Dijkstra's algorithm
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
 * Information about a predecessor position (one that can reach target in one turn)
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
 * Result of slingshot analysis
 */
export interface SlingshotAnalysis {
  /** Whether a slingshot is beneficial */
  recommended: boolean;
  /** The planet to slingshot around (if recommended) */
  planet?: GravityWellId;
  /** Direct path for comparison */
  directPath: MovementPlan | null;
  /** Path via slingshot (if beneficial) */
  slingshotPath: MovementPlan | null;
  /** Turns saved by slingshotting (negative means direct is faster) */
  turnsSaved: number;
  /** Mass saved by slingshotting (negative means direct uses less) */
  massSaved: number;
}

/**
 * Key for position lookup in visited map
 */
export function positionKey(pos: OrientedPosition): string {
  return `${pos.wellId}:${pos.ring}:${pos.sector}:${pos.facing}`;
}

/**
 * Bit-packed integer encoding of an oriented position. Used by hot-path
 * planner code that visits many positions per call: a `Map<number, …>`
 * keyed on this integer is materially faster than a `Map<string, …>`
 * keyed on {@link positionKey}, because we avoid string concatenation
 * and the engine's string-hash overhead.
 *
 * Encoding (bits, low → high):
 *
 *   bit  0     facing            (1 bit)   0 = prograde, 1 = retrograde
 *   bits 1-5   sector            (5 bits)  0-23 (range 0-31)
 *   bits 6-8   ring              (3 bits)  1-5 (range 0-7)
 *   bits 9-12  wellIndex         (4 bits)  one slot per gravity well
 *
 * Well index is interned via `wellIdToIndex` below; the 4-bit budget
 * supports up to 16 distinct wells, which is well above the game's 4
 * (black hole + 3 planets) and leaves headroom.
 */
// Plain object is faster than Map.get on the hot BFS path: V8 optimizes
// monomorphic property access on a hidden-class-stable object, whereas
// Map.get is a method call. The hash collision risk is nil since wellId
// strings are short, well-known constants.
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
  return (
    facing |
    (pos.sector << 1) |
    (pos.ring << 6) |
    (wellIdToIndex(pos.wellId) << 9)
  );
}

/**
 * Key for position without facing (for destination matching)
 */
export function orbitalPositionKey(pos: OrbitalPosition): string {
  return `${pos.wellId}:${pos.ring}:${pos.sector}`;
}

/**
 * Check if two orbital positions match (ignoring facing)
 */
export function positionsMatch(
  a: OrbitalPosition,
  b: OrbitalPosition,
): boolean {
  return a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector;
}
