import type {
  PlayerAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
} from '../models/game'
import type { SubsystemType } from '../models/subsystems'
import type { TacticalSituation, ActionPlan, BotParameters } from './types'
import { selectTarget, generateWeaponActions, shouldFaceTarget } from './behaviors/combat'
import {
  planMovementAction,
  generateRotationAction,
  generateEscapeTransfer,
} from './behaviors/positioning'
import { generateEnergyManagement, generateEnergyDeallocation } from './behaviors/survival'

/**
 * Calculate projected energy for a subsystem after planned allocations AND deallocations
 */
function getProjectedEnergy(
  situation: TacticalSituation,
  subsystemIndex: number,
  subsystemType: SubsystemType,
  energyAllocations: PlayerAction[],
  energyDeallocations: PlayerAction[]
): number {
  const currentEnergy =
    situation.botPlayer.ship.subsystems[subsystemIndex]?.allocatedEnergy || 0

  const allocatedEnergy = energyAllocations
    .filter(
      (a): a is AllocateEnergyAction =>
        a.type === 'allocate_energy' && a.data.subsystemType === subsystemType
    )
    .reduce((sum, a) => sum + a.data.amount, 0)

  const deallocatedEnergy = energyDeallocations
    .filter(
      (a): a is DeallocateEnergyAction =>
        a.type === 'deallocate_energy' && a.data.subsystemType === subsystemType
    )
    .reduce((sum, a) => sum + a.data.amount, 0)

  return Math.max(0, currentEnergy + allocatedEnergy - deallocatedEnergy)
}

/**
 * Generate a complete action sequence for the bot.
 *
 * Order of operations (revised):
 * 1. Select target
 * 2. Plan movement (determines burn/coast/transfer)
 * 3. Determine weapon situation and facing
 * 4. Build energy budget based on planned actions
 * 5. Generate energy allocation/deallocation
 * 6. Generate rotation, movement, weapon actions
 */
export function generateActionSequence(
  situation: TacticalSituation,
  parameters: BotParameters
): PlayerAction[] {
  const actions: PlayerAction[] = []
  let tacticalSequence = 1

  // Step 1: Select target
  const target = selectTarget(situation, parameters)

  // Step 2: Plan movement (informed by goal and target)
  const movementResult = planMovementAction(situation, target, parameters, tacticalSequence)

  // Step 3: Determine weapon situation
  const hasTargetInRange = target != null && Array.from(target.firingSolutions.values()).some(s => s.inRange)
  const hasTarget = target != null

  const underThreat = situation.primaryThreat != null &&
    situation.primaryThreat.weaponsInRange.some(w => w.inRange)

  // Step 4: Determine facing (considers both weapons and movement)
  const movementFacing = movementResult.desiredFacing
  const weaponFacing = shouldFaceTarget(situation, target, movementFacing ?? undefined)
  const desiredFacing = weaponFacing ?? movementFacing

  const willBurn = movementResult.action.type === 'burn'
  const willCoast = movementResult.action.type === 'coast'
  const willTransfer = movementResult.action.type === 'well_transfer'
  const willRotate = desiredFacing != null && desiredFacing !== situation.status.facing

  // Determine required engine energy based on burn intensity
  let requiredEngineEnergy = 1 // Default: soft burn
  if (willBurn && movementResult.action.type === 'burn') {
    const intensity = movementResult.action.data.burnIntensity
    if (intensity === 'medium') requiredEngineEnergy = 2
    else if (intensity === 'hard') requiredEngineEnergy = 3
  } else if (willTransfer) {
    requiredEngineEnergy = 3 // Well transfers require engines at 3
  }

  // Step 5: Build energy context
  const energyContext = {
    willBurn,
    willCoast,
    willRotate,
    willTransfer,
    hasTargetInRange,
    hasTarget,
    underThreat,
    requiredEngineEnergy,
  }

  // Check for escape transfer first
  const escapeTransfer = generateEscapeTransfer(situation, parameters, tacticalSequence)
  if (escapeTransfer) {
    const escapeEnergyCtx = {
      ...energyContext,
      willTransfer: true,
      willBurn: false,
      willCoast: false,
      requiredEngineEnergy: 3, // Well transfers require engines at 3
    }

    const energyDeallocations = generateEnergyDeallocation(situation, parameters, escapeEnergyCtx)
    const freedEnergy = energyDeallocations.reduce((sum, a) => sum + a.data.amount, 0)
    const energyAllocations = generateEnergyManagement(situation, parameters, escapeEnergyCtx, freedEnergy)

    actions.push(...energyDeallocations)
    actions.push(...energyAllocations)
    actions.push(escapeTransfer)
    tacticalSequence++

    // Try to fire weapons
    const projectedEnergy = buildProjectedEnergyMap(situation, energyAllocations, energyDeallocations)
    const weaponActions = generateWeaponActions(situation, target, tacticalSequence, parameters, projectedEnergy)
    actions.push(...weaponActions)

    return actions
  }

  // Normal flow
  const energyDeallocations = generateEnergyDeallocation(situation, parameters, energyContext)
  const freedEnergy = energyDeallocations.reduce((sum, a) => sum + a.data.amount, 0)
  const energyAllocations = generateEnergyManagement(situation, parameters, energyContext, freedEnergy)

  actions.push(...energyDeallocations)
  actions.push(...energyAllocations)

  // Rotation
  const rotationAction = generateRotationAction(situation, desiredFacing, tacticalSequence)
  if (rotationAction) {
    actions.push(rotationAction)
    tacticalSequence++
  }

  // Movement
  movementResult.action.sequence = tacticalSequence
  actions.push(movementResult.action)
  tacticalSequence++

  // Weapons
  const projectedEnergy = buildProjectedEnergyMap(situation, energyAllocations, energyDeallocations)
  const weaponActions = generateWeaponActions(situation, target, tacticalSequence, parameters, projectedEnergy)
  actions.push(...weaponActions)

  return actions
}

/**
 * Build a map of subsystem index → projected energy after allocations
 */
function buildProjectedEnergyMap(
  situation: TacticalSituation,
  energyAllocations: PlayerAction[],
  energyDeallocations: PlayerAction[]
): Map<number, number> {
  const map = new Map<number, number>()

  for (const sub of situation.status.weapons) {
    const projected = getProjectedEnergy(
      situation,
      sub.index,
      sub.type,
      energyAllocations,
      energyDeallocations
    )
    map.set(sub.index, projected)
  }

  return map
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

  // Aggressive strategy
  if (situation.primaryTarget) {
    const aggressiveParams = {
      ...parameters,
      aggressiveness: Math.min(1, parameters.aggressiveness + 0.2),
      conserveAmmo: false,
    }
    const aggressiveActions = generateActionSequence(situation, aggressiveParams)
    candidates.push({
      actions: aggressiveActions,
      description: 'Aggressive',
    })
  }

  // Defensive strategy
  if (situation.primaryThreat || situation.status.healthPercent < 0.5) {
    const defensiveParams = {
      ...parameters,
      aggressiveness: Math.max(0, parameters.aggressiveness - 0.3),
      conserveAmmo: true,
    }
    const defensiveActions = generateActionSequence(situation, defensiveParams)
    candidates.push({
      actions: defensiveActions,
      description: 'Defensive',
    })
  }

  // Mission pursuit candidate
  if (situation.currentGoal) {
    const missionParams: BotParameters = {
      ...parameters,
      targetPreference: 'mission',
      missionStrategy: 'auto',
    }
    const missionActions = generateActionSequence(situation, missionParams)
    candidates.push({
      actions: missionActions,
      description: `Mission: ${situation.currentGoal.type}`,
    })
  }

  return candidates
}
