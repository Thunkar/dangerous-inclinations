import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useGame } from '../../../context/GameContext'
import {
  BOARD_SIZE,
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BOARD_SCALE_FACTOR,
  getGravityWellPosition as getGravityWellPositionBase,
  getSectorRotationOffset as getSectorRotationOffsetBase,
  getSectorAngleDirection as getSectorAngleDirectionBase,
  getVisualSector as getVisualSectorBase,
} from '../utils'

/**
 * Board context provides pre-bound helper functions for board calculations.
 * This eliminates the need to pass gravityWells and board constants to every function call.
 */
export interface BoardContextValue {
  // Constants (for direct access if needed)
  boardSize: number
  centerX: number
  centerY: number
  scaleFactor: number

  // Helper functions with gravity wells and board constants pre-bound
  getGravityWellPosition: (wellId: string) => { x: number; y: number }
  getSectorRotationOffset: (wellId: string) => number
  getSectorAngleDirection: (wellId: string) => number
  getVisualSector: (wellId: string, logicalSector: number, sectorCount: number) => number
}

const BoardContext = createContext<BoardContextValue | null>(null)

interface BoardProviderProps {
  children: ReactNode
}

/**
 * BoardProvider wraps board utility functions with pre-bound arguments.
 * Should be placed inside GameProvider to access gameState.
 */
export function BoardProvider({ children }: BoardProviderProps) {
  const { gameState } = useGame()

  const value = useMemo<BoardContextValue>(
    () => ({
      // Constants
      boardSize: BOARD_SIZE,
      centerX: BOARD_CENTER_X,
      centerY: BOARD_CENTER_Y,
      scaleFactor: BOARD_SCALE_FACTOR,

      // Pre-bound functions
      getGravityWellPosition: (wellId: string) =>
        getGravityWellPositionBase(
          wellId,
          gameState.gravityWells,
          BOARD_CENTER_X,
          BOARD_CENTER_Y,
          BOARD_SCALE_FACTOR
        ),

      getSectorRotationOffset: (wellId: string) =>
        getSectorRotationOffsetBase(wellId, gameState.gravityWells),

      getSectorAngleDirection: (wellId: string) =>
        getSectorAngleDirectionBase(wellId, gameState.gravityWells),

      getVisualSector: (wellId: string, logicalSector: number, sectorCount: number) =>
        getVisualSectorBase(wellId, logicalSector, sectorCount),
    }),
    [gameState.gravityWells]
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

/**
 * Hook to access board context.
 * Must be used within BoardProvider.
 */
export function useBoardContext(): BoardContextValue {
  const context = useContext(BoardContext)
  if (!context) {
    throw new Error('useBoardContext must be used within BoardProvider')
  }
  return context
}
