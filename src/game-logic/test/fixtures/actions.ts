import type { PlayerAction, BurnIntensity, Facing } from '../../../types/game'

/**
 * Creates a coast action (no burn)
 */
export function createCoastAction(facing?: Facing): PlayerAction {
  return {
    type: 'coast',
    targetFacing: facing,
    activateScoop: false,
    weaponFirings: [],
  }
}

/**
 * Creates a burn action
 */
export function createBurnAction(
  intensity: BurnIntensity,
  direction: Facing,
  sectorAdjustment: number = 0
): PlayerAction {
  return {
    type: 'burn',
    targetFacing: direction,
    burnDirection: direction,
    burnIntensity: intensity,
    sectorAdjustment,
    activateScoop: false,
    weaponFirings: [],
  }
}

/**
 * Creates a coast action with fuel scoop activated
 */
export function createScoopAction(): PlayerAction {
  return {
    type: 'coast',
    activateScoop: true,
    weaponFirings: [],
  }
}

/**
 * Creates an action with weapon firing
 */
export function createWeaponAction(
  weaponType: 'laser' | 'railgun' | 'missile',
  targetPlayerId: string
): PlayerAction {
  return {
    type: 'coast',
    activateScoop: false,
    weaponFirings: [
      {
        weaponType,
        targetPlayerId,
      },
    ],
  }
}

/**
 * Creates a rotation action
 */
export function createRotationAction(targetFacing: Facing): PlayerAction {
  return {
    type: 'coast',
    targetFacing,
    activateScoop: false,
    weaponFirings: [],
  }
}
