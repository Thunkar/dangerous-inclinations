import type {
  PlayerAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
} from '../models/game.ts'
import type { SubsystemType } from '../models/subsystems.ts'
import type { TacticalSituation, ActionPlan, BotParameters, Target } from './types.ts'
import { selectTarget, generateWeaponActions, shouldFaceTarget } from './behaviors/combat.ts'
import {
  planMovementAction,
  generateRotationAction,
  generateEscapeTransfer,
} from './behaviors/positioning.ts'
import { generateEnergyManagement, generateEnergyDeallocation } from './behaviors/survival.ts'
import { getGravityWell } from '../models/gravityWells.ts'
import { BURN_COSTS, calculateBurnMassCost, WELL_TRANSFER_COSTS } from '../models/rings.ts'
import { calculatePostMovementPosition } from '../game/movement.ts'

/**
 * True when the bot has a railgun in range and the recoil would otherwise
 * push it past a ring boundary — i.e. the bot will need to compensate
 * recoil with engines. Used to keep engines powered in the energy budget
 * on coast-and-fire turns.
 */
function willFireRailgunWithRecoilCompensation(
  situation: TacticalSituation,
  target: Target | null
): boolean {
  if (!target) return false
  const ship = situation.botPlayer.ship
  const railgun = situation.status.weapons.find(w => w.type === 'railgun')
  if (!railgun || railgun.broken || railgun.used) return false

  const solution = target.firingSolutions.get(railgun.index)
  if (!solution || !solution.inRange) return false

  const recoilDir = ship.facing === 'prograde' ? 1 : -1
  const recoilRing = ship.ring + recoilDir
  const maxRing = getGravityWell(ship.wellId)?.rings.length ?? 5
  const wouldBeInvalid = recoilRing < 1 || recoilRing > maxRing
  if (!wouldBeInvalid) return false

  // Engines and reaction mass must be available for compensation to work.
  return ship.reactionMass >= BURN_COSTS.soft.mass
}

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

  // If the bot is likely to fire railgun with recoil that would push it out
  // of bounds, engines must stay powered (level 1) to compensate. Without
  // this signal, the energy budget would deallocate engines on coast turns
  // and the railgun fire would fail validation.
  const needsRecoilCompensation = willFireRailgunWithRecoilCompensation(
    situation,
    target
  )
  if (needsRecoilCompensation && requiredEngineEnergy < 1) {
    requiredEngineEnergy = 1
  }
  const willBurnOrCompensate = willBurn || needsRecoilCompensation

  // Step 5: Build energy context. `willBurn` includes the railgun-recoil
  // case so the engines stay in the energy budget on a coast-and-fire turn.
  // `willShadow` keeps the sensor_array powered while pursuing an
  // intercept_transmission mission so the scan-acquire check actually fires.
  const willShadow = situation.currentGoal?.type === 'shadow_target'
  const energyContext = {
    willBurn: willBurnOrCompensate,
    willCoast,
    willRotate,
    willTransfer,
    hasTargetInRange,
    hasTarget,
    underThreat,
    requiredEngineEnergy,
    willShadow,
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

    // Try to fire weapons. Well transfer drains mass and uses engines;
    // project both so recoil compensation respects post-transfer state.
    const projectedEnergy = buildProjectedEnergyMap(situation, energyAllocations, energyDeallocations)
    const projectedMass = projectMassAfterMovement(situation, escapeTransfer)
    const postMovementShip = projectShipPosition(situation, desiredFacing, escapeTransfer)
    const weaponActions = generateWeaponActions(
      situation,
      target,
      tacticalSequence,
      parameters,
      projectedEnergy,
      projectedMass,
      true, // well transfer uses engines
      postMovementShip
    )
    actions.push(...weaponActions)

    return actions
  }

  // Normal flow
  const energyDeallocations = generateEnergyDeallocation(situation, parameters, energyContext)
  const freedEnergy = energyDeallocations.reduce((sum, a) => sum + a.data.amount, 0)
  const energyAllocations = generateEnergyManagement(situation, parameters, energyContext, freedEnergy)

  // Reconcile planned movement with what the energy budget can actually fund.
  // The movement planner picks an intensity assuming engines will be powered;
  // the energy budget can fail to fund it (reactor full, higher-priority
  // subsystems). When that happens, downgrade or replace movement so the
  // emitted actions stay valid.
  const reconciledMovement = reconcileMovementWithEnergy(
    situation,
    movementResult.action,
    energyAllocations,
    energyDeallocations
  )

  actions.push(...energyDeallocations)
  actions.push(...energyAllocations)

  // Rotation — pass projected rotation energy so the rotate action is
  // generated when the budget will power rotation this turn (allocations
  // run before tactical actions in the engine's turn pipeline).
  const rotationProjected = getProjectedEnergy(
    situation,
    situation.botPlayer.ship.subsystems.findIndex(s => s.type === 'rotation'),
    'rotation',
    energyAllocations,
    energyDeallocations
  )
  const rotationAction = generateRotationAction(
    situation,
    desiredFacing,
    tacticalSequence,
    rotationProjected
  )
  if (rotationAction) {
    actions.push(rotationAction)
    tacticalSequence++
  }

  // Movement
  reconciledMovement.sequence = tacticalSequence
  actions.push(reconciledMovement)
  tacticalSequence++

  // Weapons. Pass projected mass + engines-used flag + post-movement position
  // so recoil-compensation decisions reflect post-movement ship state.
  const projectedEnergy = buildProjectedEnergyMap(situation, energyAllocations, energyDeallocations)
  const projectedMass = projectMassAfterMovement(situation, reconciledMovement)
  const enginesUsedByMovement = movementUsesEngines(reconciledMovement)
  const postMovementShip = projectShipPosition(situation, desiredFacing, reconciledMovement)
  const weaponActions = generateWeaponActions(
    situation,
    target,
    tacticalSequence,
    parameters,
    projectedEnergy,
    projectedMass,
    enginesUsedByMovement,
    postMovementShip
  )
  actions.push(...weaponActions)

  return actions
}

/**
 * Predict the ship's ring + facing AFTER the planned rotation and movement
 * have applied. Used by recoil safety checks. Reuses the engine's
 * {@link calculatePostMovementPosition} so AI prediction stays in sync with
 * what the engine will actually compute.
 */
function projectShipPosition(
  situation: TacticalSituation,
  desiredFacing: 'prograde' | 'retrograde' | null,
  movement: PlayerAction
): { ring: number; facing: 'prograde' | 'retrograde' } {
  const ship = situation.botPlayer.ship
  if (movement.type === 'burn') {
    const projected = calculatePostMovementPosition(
      ship,
      desiredFacing ?? undefined,
      {
        actionType: 'burn',
        burnIntensity: movement.data.burnIntensity,
        sectorAdjustment: movement.data.sectorAdjustment,
      }
    )
    return { ring: projected.ring, facing: projected.facing }
  }
  // Coast / well_transfer / other: ring stays the same on the originating
  // turn (well_transfer hops only after the entire turn resolves; recoil
  // safety is evaluated against the post-departure outermost ring which is
  // still this well's outermost).
  return { ring: ship.ring, facing: desiredFacing ?? ship.facing }
}

/**
 * True when the planned movement marks the engines subsystem as used this
 * turn — i.e., a burn or a well transfer. Recoil compensation can't run on
 * already-used engines, so this gates that decision.
 */
function movementUsesEngines(movement: PlayerAction): boolean {
  return movement.type === 'burn' || movement.type === 'well_transfer'
}

/**
 * Reaction mass remaining after a planned movement action consumes fuel.
 * Movement is the only thing in a turn that drains mass before weapons fire.
 */
function projectMassAfterMovement(
  situation: TacticalSituation,
  movement: PlayerAction
): number {
  const current = situation.botPlayer.ship.reactionMass
  if (movement.type === 'burn') {
    const burnCost = BURN_COSTS[movement.data.burnIntensity]
    const totalCost = calculateBurnMassCost(
      burnCost.mass,
      movement.data.sectorAdjustment ?? 0
    )
    return Math.max(0, current - totalCost)
  }
  if (movement.type === 'well_transfer') {
    return Math.max(0, current - WELL_TRANSFER_COSTS.mass)
  }
  return current
}

/**
 * Burn intensities require specific engine energy levels: soft=1, medium=2,
 * hard=3. Returns the highest intensity affordable at `engineEnergy`, or
 * null if even soft can't be powered.
 */
function affordableBurnIntensity(
  engineEnergy: number
): 'soft' | 'medium' | 'hard' | null {
  if (engineEnergy >= 3) return 'hard'
  if (engineEnergy >= 2) return 'medium'
  if (engineEnergy >= 1) return 'soft'
  return null
}

/**
 * Reconcile a planned movement action against the energy budget. The
 * movement planner picks an action assuming engines will be powered to
 * the level it needs; the energy budget can fail to fund that. When it
 * does, downgrade or replace the movement so what we emit is valid:
 *   - burn: pick highest affordable burn intensity, else coast
 *   - well_transfer: keep only if engines projected at 3, else coast
 */
function reconcileMovementWithEnergy(
  situation: TacticalSituation,
  movement: PlayerAction,
  energyAllocations: PlayerAction[],
  energyDeallocations: PlayerAction[]
): PlayerAction {
  if (movement.type !== 'burn' && movement.type !== 'well_transfer') {
    return movement
  }

  const enginesIndex = situation.botPlayer.ship.subsystems.findIndex(
    s => s.type === 'engines'
  )
  const projectedEngineEnergy = getProjectedEnergy(
    situation,
    enginesIndex,
    'engines',
    energyAllocations,
    energyDeallocations
  )

  if (movement.type === 'well_transfer') {
    // Well transfers require engines at level 3 AND the bot must have at
    // least 3 reaction mass (unless a fuel_compressor refunds it).
    const hasFuelCompressor = situation.status.subsystems.some(
      s => s.type === 'fuel_compressor'
    )
    const enoughMass =
      hasFuelCompressor || situation.botPlayer.ship.reactionMass >= 3
    if (projectedEngineEnergy >= 3 && enoughMass) return movement
    return {
      type: 'coast',
      playerId: movement.playerId,
      sequence: movement.sequence,
      data: { activateScoop: false },
    }
  }

  const required =
    movement.data.burnIntensity === 'hard'
      ? 3
      : movement.data.burnIntensity === 'medium'
      ? 2
      : 1
  if (projectedEngineEnergy >= required) return movement

  const affordable = affordableBurnIntensity(projectedEngineEnergy)
  if (affordable === null) {
    // Can't burn at all — fall back to coast. Drop the sector adjustment;
    // coasting doesn't take one and the bot will replan next turn.
    return {
      type: 'coast',
      playerId: movement.playerId,
      sequence: movement.sequence,
      data: { activateScoop: false },
    }
  }

  // Sector adjustment is only valid up to ring velocity; keeping it for
  // a downgraded burn is conservative since velocity bounds don't depend
  // on intensity. The movement planner picked an adjustment that fits the
  // current ring, so re-using it here is safe.
  return {
    ...movement,
    data: {
      ...movement.data,
      burnIntensity: affordable,
    },
  }
}

/**
 * Build a map of subsystem index → projected energy after allocations.
 * Covers all subsystems (not just weapons) so consumers can check engines,
 * shields, etc. for downstream decisions like railgun recoil compensation.
 */
function buildProjectedEnergyMap(
  situation: TacticalSituation,
  energyAllocations: PlayerAction[],
  energyDeallocations: PlayerAction[]
): Map<number, number> {
  const map = new Map<number, number>()

  for (const sub of situation.status.subsystems) {
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
