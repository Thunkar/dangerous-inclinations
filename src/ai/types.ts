import type { Player, PlayerAction, GravityWellId } from '../types/game'
import type { FiringSolution } from '../utils/weaponRange'

/**
 * Represents a potential threat to the bot
 */
export interface Threat {
  player: Player
  distance: number // Combined ring + sector distance
  ringDistance: number
  sectorDistance: number
  // Weapons that can hit us
  weaponsInRange: Array<{
    weaponType: 'laser' | 'railgun' | 'missiles'
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
  // Available firing solutions for each weapon
  firingSolutions: {
    laser?: FiringSolution
    railgun?: FiringSolution
    missiles?: FiringSolution
  }
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
 * Bot's current ship status
 */
export interface BotStatus {
  health: number // Current HP
  healthPercent: number // HP / maxHP
  heat: number
  heatPercent: number // heat / heat capacity
  reactionMass: number
  availableEnergy: number
  // Subsystem status
  subsystems: {
    engines: { powered: boolean; energy: number }
    rotation: { powered: boolean; energy: number; used: boolean }
    laser: { powered: boolean; energy: number; used: boolean }
    railgun: { powered: boolean; energy: number; used: boolean }
    missiles: { powered: boolean; energy: number; used: boolean }
    shields: { powered: boolean; energy: number }
  }
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
  }
  totalScore: number
}

/**
 * Bot decision-making parameters (can be tuned for difficulty)
 */
export interface BotParameters {
  // Combat behavior
  aggressiveness: number // 0-1: how willing to take risks for kills
  targetPreference: 'closest' | 'weakest' | 'threatening' // Target selection strategy

  // Heat management
  heatThreshold: number // 0-1: start venting at this % of capacity
  panicHeatThreshold: number // 0-1: emergency vent/retreat

  // Positioning
  preferredRingRange: { min: number; max: number } // Optimal combat range
  useWellTransfers: boolean // Whether to use well transfers

  // Resource management
  energyReserve: number // Minimum energy to keep available
  conserveAmmo: boolean // Whether to be conservative with reaction mass
}

/**
 * Default bot parameters (medium difficulty)
 */
export const DEFAULT_BOT_PARAMETERS: BotParameters = {
  aggressiveness: 0.6,
  targetPreference: 'weakest',
  heatThreshold: 0.7,
  panicHeatThreshold: 0.9,
  preferredRingRange: { min: 2, max: 3 },
  useWellTransfers: true,
  energyReserve: 2,
  conserveAmmo: false,
}

/**
 * Detailed log of bot's decision-making process
 */
export interface BotDecisionLog {
  // Timestamp
  timestamp: string
  // Bot's analysis
  situation: {
    health: string // e.g., "80% HP (8/10)"
    heat: string // e.g., "50% Heat (5/10)"
    energy: string // e.g., "3 available"
    position: string // e.g., "Blackhole R3S12"
    threatCount: number
    targetCount: number
  }
  // Thoughts about threats
  threats: string[] // e.g., ["Ship Alpha in laser range", "Taking damage from railgun"]
  // Thoughts about targets
  targets: string[] // e.g., ["Ship Gamma weakened (40% HP)", "Laser in range"]
  // Decision reasoning
  reasoning: string[] // e.g., ["Heat critical - venting 3 units", "Targeting weakest enemy"]
  // Candidate evaluation
  candidates: Array<{
    description: string
    scores: { offense: number; defense: number; positioning: number; resources: number }
    totalScore: number
  }>
  // Final decision
  selectedCandidate: {
    description: string
    totalScore: number
    actionSummary: string[] // e.g., ["Allocate 2 energy to laser", "Fire laser at Ship Gamma"]
  }
}

/**
 * Bot decision result with actions and decision log
 */
export interface BotDecision {
  actions: PlayerAction[]
  log: BotDecisionLog
}
