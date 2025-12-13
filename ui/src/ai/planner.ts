import type { PlayerAction, AllocateEnergyAction, DeallocateEnergyAction } from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import type { TacticalSituation, ActionPlan, BotParameters } from './types'
import { selectTarget, generateWeaponActions, shouldFaceTarget } from './behaviors/combat'
import {
  generateMovementAction,
  generateRotationAction,
  generateEscapeTransfer,
} from './behaviors/positioning'
import {
  generateEnergyManagement,
  generateEnergyDeallocation,
} from './behaviors/survival'

/**
 * Calculate projected energy for a subsystem after planned allocations AND deallocations
 */
function getProjectedEnergy(
  situation: TacticalSituation,
  subsystemType: SubsystemType,
  energyAllocations: PlayerAction[],
  energyDeallocations: PlayerAction[]
): number {
  const currentEnergy = situation.botPlayer.ship.subsystems.find(s => s.type === subsystemType)?.allocatedEnergy || 0

  const allocatedEnergy = energyAllocations
    .filter((a): a is AllocateEnergyAction => a.type === 'allocate_energy' && a.data.subsystemType === subsystemType)
    .reduce((sum, a) => sum + a.data.amount, 0)

  const deallocatedEnergy = energyDeallocations
    .filter((a): a is DeallocateEnergyAction => a.type === 'deallocate_energy' && a.data.subsystemType === subsystemType)
    .reduce((sum, a) => sum + a.data.amount, 0)

  return Math.max(0, currentEnergy + allocatedEnergy - deallocatedEnergy)
}

/**
 * Generate a complete action sequence for the bot
 * Returns actions in proper execution order:
 * 1. Energy allocation
 * 2. Energy deallocation
 * 3. Rotation (if needed)
 * 4. Well transfer OR movement (coast/burn)
 * 5. Weapon firing
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

  // Energy deallocation - free up unused energy and manage heat
  const energyDeallocations = generateEnergyDeallocation(situation, parameters)
  actions.push(...energyDeallocations)

  // Heat venting is now automatic via dissipationCapacity - no action needed

  // === PHASE 2: Tactical Actions (with sequence numbers) ===

  // Select target
  const target = selectTarget(situation, parameters)

  // Calculate projected energy for weapons after allocations AND deallocations
  const projectedWeaponEnergy = {
    railgun: getProjectedEnergy(situation, 'railgun', energyAllocations, energyDeallocations),
    laser: getProjectedEnergy(situation, 'laser', energyAllocations, energyDeallocations),
    missiles: getProjectedEnergy(situation, 'missiles', energyAllocations, energyDeallocations),
  }

  // Check if we should escape via well transfer
  const escapeTransfer = generateEscapeTransfer(situation, parameters, tacticalSequence)
  if (escapeTransfer) {
    // Emergency escape - skip other tactical actions
    actions.push(escapeTransfer)
    tacticalSequence++

    // Still try to fire weapons if possible (with projected energy)
    const weaponActions = generateWeaponActions(situation, target, tacticalSequence, projectedWeaponEnergy)
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

  // Weapon firing (after movement, with projected energy)
  const weaponActions = generateWeaponActions(situation, target, tacticalSequence, projectedWeaponEnergy)
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
