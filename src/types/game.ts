import type { Subsystem, ReactorState, HeatState } from './subsystems'

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
  // New subsystem-based energy/heat system
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  // Pending allocations (not committed until turn executes)
  pendingSubsystems?: Subsystem[]
  pendingReactor?: ReactorState
  pendingHeat?: HeatState
  pendingFacing?: Facing // Pending facing change (updates immediately during planning)
}

export interface WeaponFiring {
  weaponType: string // e.g., 'laser', 'railgun', 'missile'
  targetPlayerId: string
}

export interface PlayerAction {
  type: ActionType
  targetFacing?: Facing // Desired ship orientation (independent of burn)
  burnIntensity?: BurnIntensity
  sectorAdjustment?: number // -1, 0, or +1 sector adjustment for transfers (phasing is automatic)
  activateScoop: boolean
  weaponFirings: WeaponFiring[] // Changed from single weaponFiring to array
}

export interface Player {
  id: string
  name: string
  color: string
  ship: ShipState
  pendingAction: PlayerAction | null
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
