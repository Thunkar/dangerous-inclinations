// Re-export all types
export * from './display'

import type { Player, Facing, BurnIntensity, ActionType } from '@dangerous-inclinations/engine'

export interface MovementPreview {
  actionType: ActionType
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
