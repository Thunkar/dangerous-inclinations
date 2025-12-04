import type { PlayerAction } from '../types/game'
import type { ActionPlan, ScoredActionPlan, TacticalSituation, BotParameters } from './types'

/**
 * Evaluate offense score - damage potential
 */
function evaluateOffense(
  actions: PlayerAction[],
  situation: TacticalSituation
): number {
  let score = 0

  // Count weapon actions
  const weaponActions = actions.filter(a => a.type === 'fire_weapon')
  score += weaponActions.length * 30 // 30 points per weapon fired

  // Bonus if we have a target in range
  if (situation.primaryTarget) {
    score += 20
  }

  return Math.min(100, score)
}

/**
 * Evaluate defense score - safety and survival
 */
function evaluateDefense(
  actions: PlayerAction[],
  situation: TacticalSituation,
  _parameters: BotParameters
): number {
  let score = 50 // Base score

  // Heat management - now automatic via dissipationCapacity
  // Heat is passively vented each turn, no action needed

  // Escape when low health
  const wellTransferAction = actions.find(a => a.type === 'well_transfer')
  if (situation.status.healthPercent < 0.3) {
    score += wellTransferAction ? 20 : 0
  }

  // Shields powered when under threat
  if (situation.primaryThreat) {
    const shieldsAllocated = actions.some(
      a => a.type === 'allocate_energy' && a.data.subsystemType === 'shields'
    )
    score += shieldsAllocated || situation.status.subsystems.shields.powered ? 10 : -10
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * Evaluate positioning score - tactical position quality
 */
function evaluatePositioning(
  actions: PlayerAction[],
  situation: TacticalSituation,
  parameters: BotParameters
): number {
  let score = 50 // Base score

  // Check if we're in preferred range
  if (situation.primaryTarget) {
    const ringDistance = Math.abs(
      situation.status.ring - situation.primaryTarget.player.ship.ring
    )
    const { preferredRingRange } = parameters

    if (ringDistance >= preferredRingRange.min && ringDistance <= preferredRingRange.max) {
      score += 30 // In optimal range
    } else {
      const burnAction = actions.find(a => a.type === 'burn')
      score += burnAction ? 10 : -10 // Bonus for trying to adjust range
    }
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * Evaluate resource efficiency - energy and heat management
 */
function evaluateResources(
  actions: PlayerAction[],
  situation: TacticalSituation
): number {
  let score = 50 // Base score

  // Efficient energy allocation
  const allocateActions = actions.filter(a => a.type === 'allocate_energy')
  const deallocateActions = actions.filter(a => a.type === 'deallocate_energy')

  // Bonus for managing energy (not just leaving it unused)
  if (allocateActions.length > 0) {
    score += 20
  }

  // Small bonus for deallocating unused systems
  if (deallocateActions.length > 0) {
    score += 10
  }

  // Penalty for wasting reaction mass when not needed
  const burnAction = actions.find(a => a.type === 'burn')
  if (burnAction && situation.status.reactionMass < 3) {
    score -= 15 // Don't waste mass when low
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * Evaluate an action plan and return it with scores
 */
export function evaluateActionPlan(
  plan: ActionPlan,
  situation: TacticalSituation,
  parameters: BotParameters
): ScoredActionPlan {
  const offense = evaluateOffense(plan.actions, situation)
  const defense = evaluateDefense(plan.actions, situation, parameters)
  const positioning = evaluatePositioning(plan.actions, situation, parameters)
  const resources = evaluateResources(plan.actions, situation)

  // Weighted total score
  // Aggressiveness determines offense vs defense weighting
  const offenseWeight = 0.3 + parameters.aggressiveness * 0.3 // 0.3 to 0.6
  const defenseWeight = 0.3 + (1 - parameters.aggressiveness) * 0.3 // 0.3 to 0.6
  const positioningWeight = 0.2
  const resourcesWeight = 0.2

  const totalScore =
    offense * offenseWeight +
    defense * defenseWeight +
    positioning * positioningWeight +
    resources * resourcesWeight

  return {
    actions: plan.actions,
    description: plan.description,
    scores: { offense, defense, positioning, resources },
    totalScore,
  }
}

/**
 * Select best action plan from a list
 */
export function selectBestCandidate(
  plans: ActionPlan[],
  situation: TacticalSituation,
  parameters: BotParameters
): ScoredActionPlan {
  // Evaluate all plans
  const scoredPlans = plans.map(plan =>
    evaluateActionPlan(plan, situation, parameters)
  )

  // Sort by total score (highest first)
  scoredPlans.sort((a, b) => b.totalScore - a.totalScore)

  return scoredPlans[0]
}
