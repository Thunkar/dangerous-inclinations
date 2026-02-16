import type { FireWeaponAction } from '../../models/game'
import type { TacticalSituation, Target, BotParameters, SubsystemStatus } from '../types'
import { SUBSYSTEM_CONFIGS } from '../../models/subsystems'

/**
 * Select best target based on parameters
 */
export function selectTarget(
  situation: TacticalSituation,
  parameters: BotParameters
): Target | null {
  const { targets } = situation

  if (targets.length === 0) {
    return null
  }

  switch (parameters.targetPreference) {
    case 'closest':
      return targets.reduce(
        (closest, t) => (t.distance < closest.distance ? t : closest),
        targets[0]
      )

    case 'weakest':
      return targets.reduce(
        (weakest, t) => (t.priority > weakest.priority ? t : weakest),
        targets[0]
      )

    case 'threatening': {
      const threat = situation.primaryThreat
      if (threat) {
        return targets.find(t => t.player.id === threat.player.id) || targets[0]
      }
      return targets[0]
    }

    case 'mission': {
      // Prioritize destroy mission target
      const goal = situation.currentGoal
      if (goal && goal.type === 'destroy_target' && goal.targetPlayerId) {
        const missionTarget = targets.find(t => t.player.id === goal.targetPlayerId)
        if (missionTarget) return missionTarget
      }
      // Fall back to closest
      return targets.reduce(
        (closest, t) => (t.distance < closest.distance ? t : closest),
        targets[0]
      )
    }

    default:
      return targets[0]
  }
}

/**
 * Weapon priority for firing order.
 * Lower number = fires first.
 */
function getWeaponPriority(type: string): number {
  switch (type) {
    case 'railgun': return 0 // Highest damage, fires first
    case 'laser': return 1
    case 'ballistic_rack': return 2
    case 'missiles': return 3 // Lowest priority (conserve ammo)
    default: return 4
  }
}

/**
 * Generate weapon firing actions for the selected target.
 * Iterates ALL weapon subsystems dynamically.
 * Includes missile conservation logic.
 *
 * @param projectedEnergy - Map of subsystem index → projected energy after allocations
 */
export function generateWeaponActions(
  situation: TacticalSituation,
  target: Target | null,
  startSequence: number,
  parameters: BotParameters,
  projectedEnergy?: Map<number, number>
): FireWeaponAction[] {
  if (!target) {
    return []
  }

  const actions: FireWeaponAction[] = []
  const { botPlayer, status } = situation
  const { firingSolutions } = target

  // Collect all eligible weapons with their priority
  const eligibleWeapons: Array<{
    sub: SubsystemStatus
    priority: number
  }> = []

  // Track whether we have any direct (non-missile) weapon in range
  let hasDirectWeaponInRange = false

  for (const sub of status.weapons) {
    if (sub.used || sub.broken) continue

    const config = SUBSYSTEM_CONFIGS[sub.type]
    if (!config.weaponStats) continue

    // Check if weapon has enough energy (projected or current)
    const energy = projectedEnergy?.get(sub.index) ?? sub.energy
    if (energy < config.minEnergy) continue

    // Check firing solution for this specific subsystem
    const solution = firingSolutions.get(sub.index)

    // For missiles, we check ammo not range (they're self-propelled)
    if (sub.type === 'missiles') {
      if (sub.ammo !== undefined && sub.ammo <= 0) continue
      // Missile eligible - range check handled by conservation logic below
    } else {
      // Direct weapons need to be in range
      if (!solution || !solution.inRange) continue
      hasDirectWeaponInRange = true
    }

    eligibleWeapons.push({
      sub,
      priority: getWeaponPriority(sub.type),
    })
  }

  // Sort by priority
  eligibleWeapons.sort((a, b) => a.priority - b.priority)

  // Generate fire actions
  for (const { sub } of eligibleWeapons) {
    // Missile conservation logic
    if (sub.type === 'missiles') {
      const solution = firingSolutions.get(sub.index)
      const missileInRange = solution?.inRange ?? false

      // Check if this is a mission target
      const isMissionTarget = situation.currentGoal?.type === 'destroy_target' &&
        situation.currentGoal.targetPlayerId === target.player.id

      if (parameters.conserveAmmo) {
        // Only fire if: no direct weapon in range, OR it's a mission target with ammo >= 2
        if (hasDirectWeaponInRange) continue
        if (isMissionTarget && (sub.ammo ?? 0) < 2) continue
      } else {
        // Even without conserveAmmo, don't fire missiles if we have direct weapons
        // unless the missile is actually in range or it's a mission target
        if (hasDirectWeaponInRange && !missileInRange && !isMissionTarget) continue
      }
    }

    actions.push({
      type: 'fire_weapon',
      playerId: botPlayer.id,
      sequence: startSequence + actions.length,
      data: {
        weaponType: sub.type as 'laser' | 'railgun' | 'missiles' | 'ballistic_rack',
        targetPlayerIds: [target.player.id],
        criticalTarget: 'shields',
        subsystemIndex: sub.index,
      },
    })
  }

  return actions
}

/**
 * Determine if bot should face toward or away from target.
 * Considers mission target and railgun (spinal weapon needs correct facing).
 */
export function shouldFaceTarget(
  situation: TacticalSituation,
  target: Target | null,
  plannedMovementFacing?: 'prograde' | 'retrograde'
): 'prograde' | 'retrograde' | null {
  if (!target) {
    return plannedMovementFacing ?? null
  }

  const { status } = situation

  // Check if we have a railgun (spinal weapon) that could fire
  const hasRailgun = status.weapons.some(w =>
    w.type === 'railgun' && !w.used && !w.broken
  )

  if (hasRailgun) {
    // Railgun is spinal - needs facing direction. Check firing solution.
    for (const sub of status.weapons) {
      if (sub.type !== 'railgun') continue
      const solution = target.firingSolutions.get(sub.index)
      if (solution?.wrongFacing) {
        // Need to flip facing for railgun
        return status.facing === 'prograde' ? 'retrograde' : 'prograde'
      }
      if (solution?.inRange) {
        // Railgun is in range with current facing - keep it
        return status.facing
      }
    }
  }

  // If movement planner suggests a facing, use it
  if (plannedMovementFacing && plannedMovementFacing !== status.facing) {
    return plannedMovementFacing
  }

  // Default: keep current facing
  return null
}
