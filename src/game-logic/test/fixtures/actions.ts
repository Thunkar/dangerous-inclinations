import type {
  CoastAction,
  BurnAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  VentHeatAction,
  FireWeaponAction,
  BurnIntensity,
  Facing,
} from '../../../types/game'
import type { SubsystemType } from '../../../types/subsystems'

/**
 * Creates a coast action (no burn)
 */
export function createCoastAction(
  playerId: string = 'test-player',
  _targetFacing?: Facing,
  activateScoop: boolean = false,
  sequence: number = 1
): CoastAction {
  return {
    playerId,
    type: 'coast',
    sequence,
    data: {
      activateScoop,
    },
  }
}

/**
 * Creates a burn action
 */
export function createBurnAction(
  intensity: BurnIntensity,
  _targetFacing: Facing,
  sectorAdjustment: number = 0,
  playerId: string = 'test-player',
  sequence: number = 1
): BurnAction {
  return {
    playerId,
    type: 'burn',
    sequence,
    data: {
      burnIntensity: intensity,
      sectorAdjustment,
    },
  }
}

/**
 * Creates a coast action with fuel scoop activated
 */
export function createScoopAction(playerId: string = 'test-player'): CoastAction {
  return {
    playerId,
    type: 'coast',
    data: {
      activateScoop: true,
    },
  }
}

/**
 * Creates a rotation coast action (rotation only, no scoop)
 */
export function createRotationAction(_targetFacing: Facing, playerId: string = 'test-player'): CoastAction {
  return {
    playerId,
    type: 'coast',
    data: {
      activateScoop: false,
    },
  }
}

/**
 * Creates an allocate energy action
 */
export function createAllocateEnergyAction(
  subsystemType: SubsystemType,
  amount: number,
  playerId: string = 'test-player'
): AllocateEnergyAction {
  return {
    playerId,
    type: 'allocate_energy',
    data: {
      subsystemType,
      amount,
    },
  }
}

/**
 * Creates a deallocate energy action
 */
export function createDeallocateEnergyAction(
  subsystemType: SubsystemType,
  amount: number,
  playerId: string = 'test-player'
): DeallocateEnergyAction {
  return {
    playerId,
    type: 'deallocate_energy',
    data: {
      subsystemType,
      amount,
    },
  }
}

/**
 * Creates a vent heat action
 */
export function createVentHeatAction(amount: number, playerId: string = 'test-player'): VentHeatAction {
  return {
    playerId,
    type: 'vent_heat',
    data: {
      amount,
    },
  }
}

/**
 * Creates a fire weapon action
 */
export function createFireWeaponAction(
  weaponType: 'laser' | 'railgun' | 'missiles',
  targetPlayerIds: string[],
  playerId: string = 'test-player',
  sequence: number = 1
): FireWeaponAction {
  return {
    playerId,
    type: 'fire_weapon',
    sequence,
    data: {
      weaponType,
      targetPlayerIds,
    },
  }
}
