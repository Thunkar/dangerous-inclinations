/**
 * Bot AI System - Main Entry Point
 *
 * This is an isolated library that ingests game state and outputs valid action sequences.
 * It has no dependencies on React or UI components, only game-logic types.
 *
 * Usage:
 *   const actions = botDecideActions(gameState, botPlayerId, parameters)
 *   // Execute actions using game engine
 */

import type { GameState, PlayerAction } from '@dangerous-inclinations/engine'
import type { BotParameters, BotDecision, BotDecisionLog, TacticalSituation, ScoredActionPlan } from './types'
import { DEFAULT_BOT_PARAMETERS } from './types'
import { analyzeTacticalSituation } from './analyzer'
import { generateActionCandidates } from './planner'
import { selectBestCandidate, evaluateActionPlan } from './evaluator'

/**
 * Main bot decision-making function
 *
 * @param gameState - Current game state
 * @param botPlayerId - ID of the bot player
 * @param parameters - Optional bot behavior parameters (defaults to medium difficulty)
 * @returns Bot decision with actions and detailed decision log
 *
 * @example
 * ```typescript
 * // In GameContext when it's a bot's turn:
 * const botId = gameState.players[gameState.activePlayerIndex].id
 * if (botId !== 'player1') { // Not the human player
 *   const decision = botDecideActions(gameState, botId)
 *   console.log(decision.log) // View bot's thinking
 *   executeTurn(gameState, decision.actions)
 * }
 * ```
 */
export function botDecideActions(
  gameState: GameState,
  botPlayerId: string,
  parameters: BotParameters = DEFAULT_BOT_PARAMETERS
): BotDecision {
  try {
    // Step 1: Analyze the tactical situation
    const situation = analyzeTacticalSituation(gameState, botPlayerId)

    // Step 2: Generate multiple candidate action sequences
    const plans = generateActionCandidates(situation, parameters)

    // Step 3: Evaluate all plans
    const scoredPlans = plans.map(plan => evaluateActionPlan(plan, situation, parameters))

    // Step 4: Select the best plan
    const bestPlan = selectBestCandidate(plans, situation, parameters)

    // Step 5: Build decision log
    const log = buildDecisionLog(situation, scoredPlans, bestPlan, parameters)

    return {
      actions: bestPlan.actions,
      log,
    }
  } catch (error) {
    // Fallback: if bot AI fails, just coast
    console.error(`[Bot ${botPlayerId}] Error in decision-making:`, error)
    return {
      actions: [
        {
          type: 'coast',
          playerId: botPlayerId,
          sequence: 1,
          data: { activateScoop: false },
        },
      ],
      log: {
        timestamp: new Date().toISOString(),
        situation: {
          health: 'Unknown',
          heat: 'Unknown',
          energy: 'Unknown',
          position: 'Unknown',
          threatCount: 0,
          targetCount: 0,
        },
        threats: [],
        targets: [],
        reasoning: ['Error in decision-making - defaulting to coast'],
        candidates: [],
        selectedCandidate: {
          description: 'Emergency fallback',
          totalScore: 0,
          actionSummary: ['Coast'],
        },
      },
    }
  }
}

/**
 * Build a comprehensive decision log for UI display
 */
function buildDecisionLog(
  situation: TacticalSituation,
  scoredPlans: ScoredActionPlan[],
  bestPlan: ScoredActionPlan,
  parameters: BotParameters
): BotDecisionLog {
  const { status, threats, targets, primaryThreat, primaryTarget } = situation

  // Format situation
  const situationSummary = {
    health: `${Math.round(status.healthPercent * 100)}% HP (${status.health}/${status.health / status.healthPercent})`,
    heat: `${Math.round(status.heatPercent * 100)}% Heat (${status.heat}/10)`,
    energy: `${status.availableEnergy} available`,
    position: `${status.wellId} R${status.ring}S${status.sector} (${status.facing})`,
    threatCount: threats.length,
    targetCount: targets.length,
  }

  // Format threats
  const threatDescriptions = threats.slice(0, 3).map((threat: any) => {
    const weapons = threat.weaponsInRange
      .filter((w: any) => w.inRange)
      .map((w: any) => w.weaponType)
      .join(', ')
    if (weapons) {
      return `${threat.player.name} has ${weapons} in range (${threat.ringDistance}R ${threat.sectorDistance}S away)`
    }
    return `${threat.player.name} at distance ${threat.ringDistance}R ${threat.sectorDistance}S`
  })

  // Format targets
  const targetDescriptions = targets.slice(0, 3).map((target: any) => {
    const healthPercent = Math.round((target.player.ship.hitPoints / target.player.ship.maxHitPoints) * 100)
    const weapons = Object.entries(target.firingSolutions)
      .filter(([_, solution]: any) => solution?.inRange)
      .map(([weapon]) => weapon)
      .join(', ')
    if (weapons) {
      return `${target.player.name} (${healthPercent}% HP) - ${weapons} in range`
    }
    return `${target.player.name} (${healthPercent}% HP) at distance ${target.distance}`
  })

  // Build reasoning
  const reasoning: string[] = []

  if (status.heatPercent >= parameters.heatThreshold) {
    reasoning.push(`Heat at ${Math.round(status.heatPercent * 100)}% - need to vent`)
  }

  if (primaryThreat) {
    const weapons = primaryThreat.weaponsInRange
      .filter((w: any) => w.inRange)
      .map((w: any) => w.weaponType)
      .join(', ')
    if (weapons) {
      reasoning.push(`Under threat from ${primaryThreat.player.name}'s ${weapons}`)
    }
  }

  if (primaryTarget) {
    reasoning.push(`Targeting ${primaryTarget.player.name} (priority ${Math.round(primaryTarget.priority)})`)
  }

  if (status.healthPercent < 0.3 && parameters.useWellTransfers) {
    reasoning.push(`Critical health (${Math.round(status.healthPercent * 100)}%) - considering escape`)
  }

  // Format candidates
  const candidateSummaries = scoredPlans.map(plan => ({
    description: plan.description,
    scores: plan.scores,
    totalScore: Math.round(plan.totalScore * 10) / 10,
  }))

  // Summarize selected actions
  const actionSummary: string[] = bestPlan.actions.map((action: PlayerAction) => {
    switch (action.type) {
      case 'allocate_energy':
        return `Allocate ${action.data.amount} energy to ${action.data.subsystemType}`
      case 'deallocate_energy':
        return `Deallocate ${action.data.amount} energy from ${action.data.subsystemType}`
      case 'rotate':
        return `Rotate to face ${action.data.targetFacing}`
      case 'coast':
        return `Coast${action.data.activateScoop ? ' with scoop' : ''}`
      case 'burn':
        return `Burn ${action.data.burnIntensity} (${action.data.sectorAdjustment >= 0 ? '+' : ''}${action.data.sectorAdjustment} sectors)`
      case 'fire_weapon':
        return `Fire ${action.data.weaponType} at ${action.data.targetPlayerIds.join(', ')}`
      case 'well_transfer':
        return `Transfer to ${action.data.destinationWellId}`
      case 'deploy_ship':
        return `Deploy to sector ${action.data.sector}`
      default:
        return `Unknown action`
    }
  })

  return {
    timestamp: new Date().toISOString(),
    situation: situationSummary,
    threats: threatDescriptions,
    targets: targetDescriptions,
    reasoning,
    candidates: candidateSummaries,
    selectedCandidate: {
      description: bestPlan.description,
      totalScore: Math.round(bestPlan.totalScore * 10) / 10,
      actionSummary,
    },
  }
}

/**
 * Create bot parameters for different difficulty levels
 */
export function createBotParameters(difficulty: 'easy' | 'medium' | 'hard'): BotParameters {
  switch (difficulty) {
    case 'easy':
      return {
        aggressiveness: 0.4,
        targetPreference: 'closest',
        heatThreshold: 0.5, // Vents early
        panicHeatThreshold: 0.7,
        preferredRingRange: { min: 1, max: 4 }, // Less picky about range
        useWellTransfers: false, // Doesn't escape
        energyReserve: 3,
        conserveAmmo: true,
      }

    case 'medium':
      return DEFAULT_BOT_PARAMETERS

    case 'hard':
      return {
        aggressiveness: 0.8,
        targetPreference: 'weakest',
        heatThreshold: 0.8, // Tolerates more heat
        panicHeatThreshold: 0.95,
        preferredRingRange: { min: 2, max: 3 }, // Precise positioning
        useWellTransfers: true,
        energyReserve: 1,
        conserveAmmo: false,
      }
  }
}

// Re-export types for consumers
export type {
  BotParameters,
  TacticalSituation,
  ActionPlan,
  ScoredActionPlan,
  BotDecision,
  BotDecisionLog,
} from './types'
