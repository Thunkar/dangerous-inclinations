import type { GravityWellId, Facing, BurnIntensity } from '../../models/game'

/**
 * Position within an orbital system (well, ring, sector)
 */
export interface OrbitalPosition {
  wellId: GravityWellId
  ring: number
  sector: number
}

/**
 * Position with facing direction (needed for burn calculations)
 */
export interface OrientedPosition extends OrbitalPosition {
  facing: Facing
}

/**
 * Types of movement actions in a plan
 */
export type MovementActionType =
  | 'coast'
  | 'burn_prograde'
  | 'burn_retrograde'
  | 'well_transfer'

/**
 * A single step in a movement plan
 */
export interface MovementStep {
  from: OrientedPosition
  to: OrbitalPosition
  actionType: MovementActionType
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  requiresRotation: boolean
  massCost: number
}

/**
 * Complete movement plan from origin to destination
 */
export interface MovementPlan {
  origin: OrientedPosition
  destination: OrbitalPosition
  steps: MovementStep[]
  totalMassCost: number
  totalTurns: number
  crossesWells: boolean
  mode: PlannerMode
  /** Human-readable label for UI display (e.g., "Fastest", "Economical", "Balanced") */
  label?: string
}

/**
 * Collection of alternative routes to a destination
 */
export interface MovementAlternatives {
  destination: OrbitalPosition
  /** All unique route alternatives, sorted by preference */
  alternatives: MovementPlan[]
}

/**
 * Planner optimization mode
 * - fastest: Minimize number of turns
 * - economical: Minimize fuel (mass) usage
 */
export type PlannerMode = 'fastest' | 'economical'

/**
 * Options for the movement planner
 */
export interface PlannerOptions {
  mode: PlannerMode
  maxTurns: number
  availableMass: number
  currentFacing: Facing
  allowWellTransfers: boolean
  considerSlingshots: boolean
}

/**
 * Internal search node for Dijkstra's algorithm
 */
export interface SearchNode {
  position: OrientedPosition
  turns: number
  massCost: number
  /** The action that led TO this node (from its predecessor in time, which is its successor in the search) */
  action: MovementActionType | null
  burnIntensity: BurnIntensity | null
  sectorAdjustment: number
  /** Reference to the node we came FROM in the search (which is the NEXT step in the actual path) */
  nextInPath: SearchNode | null
}

/**
 * Information about a predecessor position (one that can reach target in one turn)
 */
export interface PredecessorInfo {
  position: OrientedPosition
  actionType: MovementActionType
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  massCost: number
  requiresRotation: boolean
}

/**
 * Result of slingshot analysis
 */
export interface SlingshotAnalysis {
  /** Whether a slingshot is beneficial */
  recommended: boolean
  /** The planet to slingshot around (if recommended) */
  planet?: GravityWellId
  /** Direct path for comparison */
  directPath: MovementPlan | null
  /** Path via slingshot (if beneficial) */
  slingshotPath: MovementPlan | null
  /** Turns saved by slingshotting (negative means direct is faster) */
  turnsSaved: number
  /** Mass saved by slingshotting (negative means direct uses less) */
  massSaved: number
}

/**
 * Key for position lookup in visited map
 */
export function positionKey(pos: OrientedPosition): string {
  return `${pos.wellId}:${pos.ring}:${pos.sector}:${pos.facing}`
}

/**
 * Key for position without facing (for destination matching)
 */
export function orbitalPositionKey(pos: OrbitalPosition): string {
  return `${pos.wellId}:${pos.ring}:${pos.sector}`
}

/**
 * Check if two orbital positions match (ignoring facing)
 */
export function positionsMatch(a: OrbitalPosition, b: OrbitalPosition): boolean {
  return a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector
}
