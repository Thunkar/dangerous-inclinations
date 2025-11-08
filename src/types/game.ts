import type { Subsystem, ReactorState, HeatState } from './subsystems'

export type Facing = 'prograde' | 'retrograde'

export type BurnIntensity = 'standard' | 'hard' | 'extreme'

export type ActionType = 'coast' | 'burn'

export interface TransferState {
  destinationRing: number
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
}

// Legacy interface - kept for backward compatibility during migration
export interface PowerAllocation {
  rotation: number
  engines: number
  scoop: number
  weapons: number
  defense: number
}

export interface WeaponFiring {
  weaponType: string // e.g., 'laser', 'railgun', 'missile'
  targetPlayerId: string
}

export interface PlayerAction {
  type: ActionType
  burnDirection?: Facing
  burnIntensity?: BurnIntensity
  activateScoop: boolean
  weaponFiring?: WeaponFiring
}

export interface Player {
  id: string
  name: string
  color: string
  ship: ShipState
  powerAllocation: PowerAllocation  // Legacy - will be removed
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
