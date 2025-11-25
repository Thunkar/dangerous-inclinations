import type { Player, Facing, BurnIntensity } from '../../types/game'

export interface MovementPreview {
  actionType: 'coast' | 'burn'
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  activateScoop: boolean
}

export interface GameBoardProps {
  players: Player[]
  activePlayerIndex: number
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
}
