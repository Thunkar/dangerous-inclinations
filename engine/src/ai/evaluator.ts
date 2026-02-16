import type { PlayerAction } from '../models/game'
import type { ActionPlan, ScoredActionPlan, TacticalSituation, BotParameters } from './types'

/**
 * Evaluate offense score - damage potential
 */
function evaluateOffense(actions: PlayerAction[], situation: TacticalSituation): number {
  let score = 0

  const weaponActions = actions.filter(a => a.type === 'fire_weapon')
  score += weaponActions.length * 30

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
  let score = 50

  const wellTransferAction = actions.find(a => a.type === 'well_transfer')
  if (situation.status.healthPercent < 0.3) {
    score += wellTransferAction ? 20 : 0
  }

  // Shields powered when under threat
  if (situation.primaryThreat) {
    const shieldsAllocated = actions.some(
      a => a.type === 'allocate_energy' && a.data.subsystemType === 'shields'
    )
    const shieldsSub = situation.status.subsystems.find(s => s.type === 'shields')
    score += shieldsAllocated || (shieldsSub?.powered ?? false) ? 10 : -10
  }

  const deallocateActions = actions.filter(a => a.type === 'deallocate_energy')
  if (deallocateActions.length > 0) {
    score += 5 // Good: cleaning up unused subsystems
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
  let score = 50

  if (situation.primaryTarget) {
    const ringDistance = Math.abs(situation.status.ring - situation.primaryTarget.player.ship.ring)
    const { preferredRingRange } = parameters

    if (ringDistance >= preferredRingRange.min && ringDistance <= preferredRingRange.max) {
      score += 30
    } else {
      const burnAction = actions.find(a => a.type === 'burn')
      score += burnAction ? 10 : -10
    }
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * Evaluate resource efficiency - energy and heat management
 */
function evaluateResources(actions: PlayerAction[], situation: TacticalSituation): number {
  let score = 50

  const allocateActions = actions.filter(a => a.type === 'allocate_energy')
  const deallocateActions = actions.filter(a => a.type === 'deallocate_energy')

  if (allocateActions.length > 0) {
    score += 20
  }

  if (deallocateActions.length > 0) {
    score += 10
  }

  const burnAction = actions.find(a => a.type === 'burn')
  if (burnAction && situation.status.reactionMass < 3) {
    score -= 15
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * Evaluate mission progress - how well the action plan advances mission goals
 */
function evaluateMissionProgress(
  actions: PlayerAction[],
  situation: TacticalSituation,
  _parameters: BotParameters
): number {
  const { currentGoal } = situation

  // No goal → neutral
  if (!currentGoal) {
    return 30
  }

  let score = 30 // Base

  switch (currentGoal.type) {
    case 'destroy_target': {
      // Firing at mission target
      const fireActions = actions.filter(a => a.type === 'fire_weapon')
      const firingAtTarget = fireActions.some(a =>
        a.data.targetPlayerIds.includes(currentGoal.targetPlayerId!)
      )
      if (firingAtTarget) {
        score += 50
      }

      // Moving toward target (burn action when not in range)
      const burnAction = actions.find(a => a.type === 'burn')
      if (burnAction && !firingAtTarget) {
        score += 20 // Approaching
      }
      break
    }

    case 'pickup_cargo':
    case 'deliver_cargo': {
      // Moving toward station
      const burnAction = actions.find(a => a.type === 'burn')
      if (burnAction) {
        score += 30
      }

      // Coasting with scoop is good for cargo runs
      const coastAction = actions.find(a => a.type === 'coast')
      if (coastAction && coastAction.data.activateScoop) {
        score += 20
      }

      // Well transfer toward target
      const transferAction = actions.find(a => a.type === 'well_transfer')
      if (transferAction && currentGoal.targetWellId) {
        if (transferAction.data.destinationWellId === currentGoal.targetWellId) {
          score += 40 // Moving to correct well
        }
      }
      break
    }

    case 'combat_opportunistic':
      // Any combat action is good
      if (actions.some(a => a.type === 'fire_weapon')) {
        score += 30
      }
      break
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
  const missionProgress = evaluateMissionProgress(plan.actions, situation, parameters)

  // Weighted total score
  // Aggressiveness shifts weight between offense and defense
  const offenseWeight = 0.2 + parameters.aggressiveness * 0.15
  const defenseWeight = 0.2 + (1 - parameters.aggressiveness) * 0.15
  const positioningWeight = 0.1
  const resourcesWeight = 0.1
  const missionWeight = 0.25

  const totalScore =
    offense * offenseWeight +
    defense * defenseWeight +
    positioning * positioningWeight +
    resources * resourcesWeight +
    missionProgress * missionWeight

  return {
    actions: plan.actions,
    description: plan.description,
    scores: { offense, defense, positioning, resources, missionProgress },
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
  const scoredPlans = plans.map(plan => evaluateActionPlan(plan, situation, parameters))
  scoredPlans.sort((a, b) => b.totalScore - a.totalScore)
  return scoredPlans[0]
}
