import type { Player, PlayerAction, GravityWellId } from '../models/game.ts'
import type { SubsystemType } from '../models/subsystems.ts'
import type { FiringSolution } from '../utils/weaponRange.ts'
import type { MovementPlan } from './movementPlanner/index.ts'

/**
 * Dynamic subsystem status - works with any loadout
 */
export interface SubsystemStatus {
  type: SubsystemType
  index: number // index into ship.subsystems[]
  powered: boolean
  energy: number
  used: boolean
  broken: boolean
  slotType?: 'forward' | 'side'
  slotIndex?: number
  ammo?: number
}

/**
 * Represents a potential threat to the bot
 */
export interface Threat {
  player: Player
  distance: number // Combined ring + sector distance
  ringDistance: number
  sectorDistance: number
  // Weapons that can hit us (dynamic, any weapon type)
  weaponsInRange: Array<{
    weaponType: SubsystemType
    subsystemIndex: number
    inRange: boolean
  }>
  // Predicted position after their movement
  predictedPosition: {
    wellId: GravityWellId
    ring: number
    sector: number
  }
}

/**
 * Represents a potential target for the bot
 */
export interface Target {
  player: Player
  distance: number
  // Firing solutions keyed by bot's subsystem index
  firingSolutions: Map<number, FiringSolution>
  // Target's predicted position after movement
  predictedPosition: {
    wellId: GravityWellId
    ring: number
    sector: number
  }
  // Priority score (lower HP = higher priority)
  priority: number
}

/**
 * Bot goal types derived from missions
 */
export type BotGoalType =
  | 'destroy_target'
  | 'pickup_cargo'
  | 'deliver_cargo'
  | 'shadow_target' // For intercept_transmission: get same ring, within ±3 sectors, power sensor_array
  | 'deliver_scan' // After scan acquired, bring scan_data cargo to any station
  | 'combat_opportunistic'

/**
 * A mission-derived goal that drives bot behavior.
 *
 * `targetWellId` / `targetRing` / `targetSector` describe the meet-up
 * position the bot should aim at. For dynamic targets (stations) this is
 * where the bot lands at the end of {@link plan} — *not* the target's
 * current sector. Tooling that displays goals can render this directly.
 *
 * `plan`, when present, is the authoritative movement to follow. It was
 * computed alongside the goal (e.g. via the planner's forward BFS for
 * stations) and accounts for target motion. Consumers should emit its
 * first step rather than recomputing a path with a static-target planner —
 * doing so would find a shorter route that *looks* faster but never
 * actually intercepts the moving target.
 */
export interface BotGoal {
  type: BotGoalType
  missionId: string
  targetPlayerId?: string // For destroy
  targetWellId?: GravityWellId // For cargo
  targetRing?: number
  targetSector?: number
  estimatedTurns: number // Lower = more urgent
  plan?: MovementPlan
}

/**
 * Bot's current ship status
 */
export interface BotStatus {
  health: number // Current HP
  healthPercent: number // HP / maxHP
  heat: number
  heatPercent: number // heat / heat capacity
  reactionMass: number
  maxReactionMass: number
  availableEnergy: number
  // Dynamic subsystem list (works with any loadout)
  subsystems: SubsystemStatus[]
  // Convenience accessors for fixed subsystems
  engines: SubsystemStatus
  rotation: SubsystemStatus
  // Derived lists
  weapons: SubsystemStatus[] // All subsystems with weaponStats
  hasScoop: boolean
  hasShields: boolean
  // Position
  wellId: GravityWellId
  ring: number
  sector: number
  facing: 'prograde' | 'retrograde'
}

/**
 * Complete tactical situation analysis
 */
export interface TacticalSituation {
  botPlayer: Player
  status: BotStatus
  threats: Threat[]
  targets: Target[]
  // Most dangerous threat (closest with weapons in range)
  primaryThreat: Threat | null
  // Best target (highest priority, best firing solution)
  primaryTarget: Target | null
  // Available transfer points for escape
  availableTransfers: Array<{
    toWellId: GravityWellId
    fromSector: number
    toSector: number
  }>
  // Mission-derived goals
  currentGoal: BotGoal | null
  allGoals: BotGoal[]
}

/**
 * Unscored action sequence candidate (before evaluation)
 */
export interface ActionPlan {
  actions: PlayerAction[]
  description: string // Human-readable description for debugging
}

/**
 * Scored action candidate (after evaluation)
 */
export interface ScoredActionPlan {
  actions: PlayerAction[]
  description: string
  scores: {
    offense: number // Damage potential (0-100)
    defense: number // Safety/survival (0-100)
    positioning: number // Tactical position (0-100)
    resources: number // Energy/heat efficiency (0-100)
    missionProgress: number // Progress toward mission goals (0-100)
  }
  totalScore: number
}

/**
 * Bot decision-making parameters (can be tuned for difficulty)
 */
export interface BotParameters {
  // Combat behavior
  aggressiveness: number // 0-1: how willing to take risks for kills
  targetPreference: 'closest' | 'weakest' | 'threatening' | 'mission' // Target selection strategy

  // Heat management
  heatThreshold: number // 0-1: start venting at this % of capacity
  panicHeatThreshold: number // 0-1: emergency vent/retreat

  // Positioning
  preferredRingRange: { min: number; max: number } // Optimal combat range
  useWellTransfers: boolean // Whether to use well transfers

  // Resource management
  energyReserve: number // Minimum energy to keep available
  conserveAmmo: boolean // Whether to be conservative with missiles
  lowFuelThreshold: number // Reaction-mass level below which the bot powers + activates scoop

  // Mission strategy
  missionStrategy: 'combat' | 'cargo' | 'balanced' | 'auto'
}

/**
 * Default bot parameters (medium difficulty)
 */
export const DEFAULT_BOT_PARAMETERS: BotParameters = {
  aggressiveness: 0.6,
  targetPreference: 'mission',
  heatThreshold: 0.7,
  panicHeatThreshold: 0.9,
  preferredRingRange: { min: 2, max: 3 },
  useWellTransfers: true,
  energyReserve: 2,
  conserveAmmo: false,
  lowFuelThreshold: 8,
  missionStrategy: 'auto',
}

/**
 * Detailed log of bot's decision-making process
 */
export interface BotDecisionLog {
  // Timestamp
  timestamp: string
  // Bot's analysis
  situation: {
    health: string
    heat: string
    energy: string
    position: string
    threatCount: number
    targetCount: number
    currentGoal?: string
  }
  // Thoughts about threats
  threats: string[]
  // Thoughts about targets
  targets: string[]
  // Decision reasoning
  reasoning: string[]
  // Candidate evaluation
  candidates: Array<{
    description: string
    scores: { offense: number; defense: number; positioning: number; resources: number; missionProgress: number }
    totalScore: number
  }>
  // Final decision
  selectedCandidate: {
    description: string
    totalScore: number
    actionSummary: string[]
  }
}

/**
 * Bot decision result with actions and decision log
 */
export interface BotDecision {
  actions: PlayerAction[]
  log: BotDecisionLog
}
