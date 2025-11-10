import type { Subsystem, SubsystemType, ReactorState, HeatState } from './subsystems'

export type Facing = 'prograde' | 'retrograde'

export type BurnIntensity = 'light' | 'medium' | 'heavy'

export type ActionType = 'coast' | 'burn'

export interface TransferState {
  destinationRing: number
  sectorAdjustment: number // -1, 0, or +1 sector adjustment from natural mapping
  arriveNextTurn: boolean
}

export interface ShipState {
  ring: number
  sector: number
  facing: Facing
  reactionMass: number
  hitPoints: number
  maxHitPoints: number
  transferState: TransferState | null
  // Subsystem-based energy/heat system
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
}

/**
 * Base action properties shared by all action types
 */
interface BaseAction {
  playerId: string
}

/**
 * Movement Actions (mutually exclusive per turn)
 */

export interface CoastAction extends BaseAction {
  type: 'coast'
  data: {
    activateScoop: boolean
  }
}

export interface BurnAction extends BaseAction {
  type: 'burn'
  data: {
    burnIntensity: BurnIntensity
    sectorAdjustment: number
  }
}

export interface RotateAction extends BaseAction {
  type: 'rotate'
  data: {
    targetFacing: Facing
  }
}

/**
 * Resource Management Actions
 */

export interface AllocateEnergyAction extends BaseAction {
  type: 'allocate_energy'
  data: {
    subsystemType: SubsystemType
    amount: number
  }
}

export interface DeallocateEnergyAction extends BaseAction {
  type: 'deallocate_energy'
  data: {
    subsystemType: SubsystemType
    amount: number // Amount of energy to return to reactor (limited by maxReturnRate)
  }
}

export interface VentHeatAction extends BaseAction {
  type: 'vent_heat'
  data: {
    amount: number
  }
}

/**
 * Combat Actions
 */

export interface FireWeaponAction extends BaseAction {
  type: 'fire_weapon'
  data: {
    weaponType: 'laser' | 'railgun' | 'missiles'
    targetPlayerIds: string[] // Array for multi-target weapons like lasers
  }
}

/**
 * Movement action type
 */
export type MovementAction = CoastAction | BurnAction

/**
 * Discriminated union of all player actions
 */
export type PlayerAction =
  | CoastAction
  | BurnAction
  | RotateAction
  | AllocateEnergyAction
  | DeallocateEnergyAction
  | VentHeatAction
  | FireWeaponAction

export interface Player {
  id: string
  name: string
  color: string
  ship: ShipState
}

export interface TurnLogEntry {
  turn: number
  playerId: string
  playerName: string
  action: string
  result: string
}

export interface GameState {
  turn: number
  activePlayerIndex: number
  players: Player[]
  turnLog: TurnLogEntry[]
}

export interface RingConfig {
  ring: number
  velocity: number
  radius: number
  sectors: number
}
