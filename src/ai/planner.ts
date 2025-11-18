import type { PlayerAction } from '../types/game'
import type { TacticalSituation, ActionPlan, BotParameters } from './types'
import { selectTarget, generateWeaponActions, shouldFaceTarget } from './behaviors/combat'
import {
  generateMovementAction,
  generateRotationAction,
  generateEscapeTransfer,
} from './behaviors/positioning'
import {
  generateHeatVentAction,
  generateEnergyManagement,
  generateEnergyDeallocation,
} from './behaviors/survival'

/**
 * Generate a complete action sequence for the bot
 * Returns actions in proper execution order:
 * 1. Energy allocation
 * 2. Energy deallocation
 * 3. Heat venting
 * 4. Rotation (if needed)
 * 5. Well transfer OR movement (coast/burn)
 * 6. Weapon firing
 */
export function generateActionSequence(
  situation: TacticalSituation,
  parameters: BotParameters
): PlayerAction[] {
  const actions: PlayerAction[] = []
  let tacticalSequence = 1 // Sequence counter for tactical actions

  // === PHASE 1: Resource Management (no sequence numbers) ===

  // Energy allocation - power up essential systems
  const energyAllocations = generateEnergyManagement(situation, parameters)
  actions.push(...energyAllocations)

  // Energy deallocation - free up unused energy
  const energyDeallocations = generateEnergyDeallocation(situation)
  actions.push(...energyDeallocations)

  // Heat venting - avoid heat damage
  const heatVent = generateHeatVentAction(situation, parameters)
  if (heatVent) {
    actions.push(heatVent)
  }

  // === PHASE 2: Tactical Actions (with sequence numbers) ===

  // Select target
  const target = selectTarget(situation, parameters)

  // Check if we should escape via well transfer
  const escapeTransfer = generateEscapeTransfer(situation, parameters, tacticalSequence)
  if (escapeTransfer) {
    // Emergency escape - skip other tactical actions
    actions.push(escapeTransfer)
    tacticalSequence++

    // Still try to fire weapons if possible
    const weaponActions = generateWeaponActions(situation, target, tacticalSequence)
    actions.push(...weaponActions)

    return actions
  }

  // Determine desired facing
  const desiredFacing = shouldFaceTarget(situation, target)

  // Rotation (if needed, before movement/weapons)
  const rotationAction = generateRotationAction(situation, desiredFacing, tacticalSequence)
  if (rotationAction) {
    actions.push(rotationAction)
    tacticalSequence++
  }

  // Movement (coast or burn)
  const movementAction = generateMovementAction(situation, target, parameters, tacticalSequence)
  actions.push(movementAction)
  tacticalSequence++

  // Weapon firing (after movement)
  const weaponActions = generateWeaponActions(situation, target, tacticalSequence)
  actions.push(...weaponActions)

  return actions
}

/**
 * Generate multiple action sequence candidates with different strategies
 */
export function generateActionCandidates(
  situation: TacticalSituation,
  parameters: BotParameters
): ActionPlan[] {
  const candidates: ActionPlan[] = []

  // Standard balanced strategy
  const standardActions = generateActionSequence(situation, parameters)
  candidates.push({
    actions: standardActions,
    description: 'Balanced',
  })

  // Aggressive strategy - prioritize offense over defense
  if (situation.primaryTarget) {
    const aggressiveParams = { ...parameters, aggressiveness: Math.min(1, parameters.aggressiveness + 0.2) }
    const aggressiveActions = generateActionSequence(situation, aggressiveParams)
    candidates.push({
      actions: aggressiveActions,
      description: 'Aggressive',
    })
  }

  // Defensive strategy - prioritize survival
  if (situation.primaryThreat || situation.status.healthPercent < 0.5) {
    const defensiveParams = { ...parameters, aggressiveness: Math.max(0, parameters.aggressiveness - 0.3) }
    const defensiveActions = generateActionSequence(situation, defensiveParams)
    candidates.push({
      actions: defensiveActions,
      description: 'Defensive',
    })
  }

  return candidates
}
