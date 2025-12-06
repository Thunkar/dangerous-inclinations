import type { FireWeaponAction } from '../../types/game'
import type { TacticalSituation, Target, BotParameters } from '../types'
import { WEAPONS } from '../../constants/weapons'
import { getMissileAmmo } from '../../game-logic/missiles'

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
      // Already sorted by distance in analyzer
      return targets.reduce((closest, t) =>
        t.distance < closest.distance ? t : closest
      , targets[0])

    case 'weakest':
      // Highest priority = lowest HP
      return targets.reduce((weakest, t) =>
        t.priority > weakest.priority ? t : weakest
      , targets[0])

    case 'threatening':
      // Target that's threatening us
      const threat = situation.primaryThreat
      if (threat) {
        return targets.find(t => t.player.id === threat.player.id) || targets[0]
      }
      return targets[0]

    default:
      return targets[0]
  }
}

/**
 * Projected energy for weapons after planned allocations
 */
export interface ProjectedWeaponEnergy {
  railgun: number
  laser: number
  missiles: number
}

/**
 * Generate weapon firing actions for the selected target
 * Returns actions ordered by sequence number
 *
 * @param projectedEnergy - Optional projected energy values after planned allocations.
 *                          If not provided, uses current subsystem energy.
 */
export function generateWeaponActions(
  situation: TacticalSituation,
  target: Target | null,
  startSequence: number,
  projectedEnergy?: ProjectedWeaponEnergy
): FireWeaponAction[] {
  if (!target) {
    return []
  }

  const actions: FireWeaponAction[] = []
  const { botPlayer } = situation
  const { firingSolutions } = target

  // Priority order: railgun (highest damage, spinal) > laser (versatile) > missiles (turret)

  // Helper to check if weapon can fire (has enough energy)
  // Uses projected energy if provided, otherwise checks current allocation
  const canFireWeapon = (weaponType: 'railgun' | 'laser' | 'missiles'): boolean => {
    const subsystem = botPlayer.ship.subsystems.find(s => s.type === weaponType)
    if (!subsystem || subsystem.usedThisTurn) return false

    const weaponConfig = WEAPONS[weaponType]

    // Use projected energy if provided, otherwise use current
    const availableEnergy = projectedEnergy
      ? projectedEnergy[weaponType]
      : subsystem.allocatedEnergy

    return availableEnergy >= weaponConfig.energyCost
  }

  // Railgun - high damage spinal weapon
  if (firingSolutions.railgun?.inRange && canFireWeapon('railgun')) {
    actions.push({
      type: 'fire_weapon',
      playerId: botPlayer.id,
      sequence: startSequence + actions.length,
      data: {
        weaponType: 'railgun',
        targetPlayerIds: [target.player.id],
      },
    })
  }

  // Laser - good all-around weapon
  if (firingSolutions.laser?.inRange && canFireWeapon('laser')) {
    actions.push({
      type: 'fire_weapon',
      playerId: botPlayer.id,
      sequence: startSequence + actions.length,
      data: {
        weaponType: 'laser',
        targetPlayerIds: [target.player.id],
      },
    })
  }

  // Missiles - self-propelled, can target any player (check ammo instead of range)
  if (canFireWeapon('missiles') && getMissileAmmo(botPlayer.ship.subsystems) > 0) {
    actions.push({
      type: 'fire_weapon',
      playerId: botPlayer.id,
      sequence: startSequence + actions.length,
      data: {
        weaponType: 'missiles',
        targetPlayerIds: [target.player.id],
      },
    })
  }

  return actions
}

/**
 * Determine if bot should face toward or away from target
 */
export function shouldFaceTarget(
  situation: TacticalSituation,
  target: Target | null
): 'prograde' | 'retrograde' | null {
  if (!target) {
    return null
  }

  const { status } = situation
  const { firingSolutions } = target

  // If railgun is in range, we should be facing toward target (spinal weapon)
  if (firingSolutions.railgun?.inRange) {
    // Determine if target is ahead or behind based on sector positions
    // This is a simplification - real calculation would need well-specific logic
    return status.facing // Keep current facing if railgun in range
  }

  // If under heavy fire, consider facing away to reduce laser damage
  const underFire = situation.primaryThreat?.weaponsInRange.some(w => w.inRange)
  if (underFire && status.healthPercent < 0.5) {
    // Face away from threat
    return status.facing === 'prograde' ? 'retrograde' : 'prograde'
  }

  // Default: keep current facing
  return null
}
