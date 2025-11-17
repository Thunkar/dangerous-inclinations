import type { Subsystem, SubsystemType, ReactorState, HeatState } from './subsystems'

export type Facing = 'prograde' | 'retrograde'

export type BurnIntensity = 'light' | 'medium' | 'heavy'

export type ActionType = 'coast' | 'burn'

// Identifier for which gravity well a ship is in
export type GravityWellId = string // e.g., 'blackhole', 'planet-alpha', 'planet-beta'

export type GravityWellType = 'blackhole' | 'planet'

export interface OrbitalPosition {
  angle: number // Angular position in degrees (0-360)
  velocity: number // Angular velocity in degrees per turn
  distance: number // Distance from black hole center (for rendering)
}

export interface GravityWell {
  id: GravityWellId
  name: string
  type: GravityWellType
  rings: RingConfig[] // Ring configuration for this gravity well
  orbitalPosition?: OrbitalPosition // Only for planets orbiting the black hole
  color: string
  radius: number // Visual size of the planet/black hole itself
}

export interface TransferPoint {
  fromWellId: GravityWellId
  toWellId: GravityWellId
  fromRing: number // Always 5 (outermost ring)
  toRing: number // Always 5 (outermost ring)
  fromSector: number // Changes as planets orbit
  toSector: number // Entry sector on destination well
}

export interface TransferState {
  destinationRing: number
  destinationWellId?: GravityWellId // If transferring between gravity wells
  destinationSector?: number // For well transfers, the exact destination sector
  sectorAdjustment: number // -1, 0, or +1 sector adjustment from natural mapping
  arriveNextTurn: boolean
  isWellTransfer?: boolean // true if transferring between gravity wells
}

export interface ShipState {
  wellId: GravityWellId // Which gravity well the ship is currently in
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
  sequence?: number // For tactical actions (rotate/move/fire), determines execution order
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

export interface WellTransferAction extends BaseAction {
  type: 'well_transfer'
  data: {
    destinationWellId: GravityWellId
    // destinationSector is determined automatically by transfer points
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
  | WellTransferAction

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
  gravityWells: GravityWell[] // All gravity wells in the system
  transferPoints: TransferPoint[] // Calculated each turn based on planetary positions
}

export interface RingConfig {
  ring: number
  velocity: number
  radius: number
  sectors: number
}
