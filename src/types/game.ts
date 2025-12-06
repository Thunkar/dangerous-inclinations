import type { BotDecisionLog } from '../ai'
import type { Subsystem, SubsystemType, ReactorState, HeatState } from './subsystems'

export type Facing = 'prograde' | 'retrograde'

export type BurnIntensity = 'soft' | 'medium' | 'hard'

export type ActionType = 'well_transfer' | 'coast' | 'burn'

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
  fromRing: number // 4 for blackhole, 3 for planets
  toRing: number // 4 for blackhole, 3 for planets
  fromSector: number // Launch sector (fixed per planet)
  toSector: number // Arrival sector (fixed per planet)
  requiredEngineLevel: number // Engine level required for transfer (e.g., 3 for elliptic transfers)
}

export interface TransferState {
  destinationRing: number
  destinationWellId?: GravityWellId // If transferring between gravity wells
  destinationSector?: number // For well transfers, the exact destination sector
  sectorAdjustment: number // -1, 0, or +1 sector adjustment from natural mapping
  isWellTransfer?: boolean // true if transferring between gravity wells
}

/**
 * Missile entity in flight
 */
export interface Missile {
  id: string // Unique identifier (e.g., "missile-player1-1")
  ownerId: string // Player who fired it
  targetId: string // Target player ID
  wellId: GravityWellId // Current gravity well
  ring: number // Current ring position
  sector: number // Current sector position
  turnFired: number // Game turn when missile was launched
  turnsAlive: number // How many turns missile has been alive (0-2, explodes at 3)
  skipOrbitalThisTurn?: boolean // Skip orbital movement this turn (set when fired after ship movement)
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
  subsystems: Subsystem[] // Note: missiles subsystem has ammo field for inventory
  reactor: ReactorState
  heat: HeatState
  dissipationCapacity: number // Base heat dissipation per turn (see DEFAULT_DISSIPATION_CAPACITY, can be increased by radiators)
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


/**
 * Combat Actions
 */

export interface FireWeaponAction extends BaseAction {
  type: 'fire_weapon'
  data: {
    weaponType: 'laser' | 'railgun' | 'missiles'
    targetPlayerIds: string[] // Array for multi-target weapons like lasers
    criticalTarget?: SubsystemType // Declared subsystem to crit if critical hit occurs (must be powered on target)
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

export interface TurnHistoryEntry {
  turn: number
  playerId: string
  playerName: string
  actions: PlayerAction[]
  botDecision?: BotDecisionLog // Only present for bot turns
}

export type GameStatus = 'active' | 'victory' | 'defeat'

/**
 * Dynamic game state - changes every turn
 * Static data (gravityWells, transferPoints) is accessed via constants directly
 */
export interface GameState {
  turn: number
  activePlayerIndex: number
  players: Player[]
  turnLog: TurnLogEntry[]
  missiles: Missile[] // All missiles currently in flight
  status: GameStatus // Game win/loss status
  winnerId?: string // ID of the winning player (if status is victory or defeat)
}

export interface RingConfig {
  ring: number
  velocity: number
  radius: number
  sectors: number
}

/**
 * Critical hit effect - unpowers a subsystem and converts its energy to heat
 */
export interface CriticalHitEffect {
  targetSubsystem: SubsystemType
  energyLost: number
  heatAdded: number
}

/**
 * Result of a weapon hit, including critical hit information
 */
export interface WeaponHitResult {
  hit: boolean
  damage: number
  damageToHull: number // After shield absorption
  damageToHeat: number // Absorbed by shields, converted to heat
  critical: boolean
  criticalEffect?: CriticalHitEffect
}
