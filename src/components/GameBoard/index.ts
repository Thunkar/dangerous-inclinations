// Re-export types
export type { GameBoardProps, MovementPreview } from './types'

// Re-export context
export { BoardProvider, useBoardContext } from './context'
export type { BoardContextValue } from './context'

// Re-export utilities
export {
  BOARD_CONFIG,
  MINIMAP_CONFIG,
  ZOOM_CONFIG,
  BOARD_SIZE,
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BOARD_SCALE_FACTOR,
  calculateScaleFactor,
  getGravityWellPosition,
  getSectorRotationOffset,
  sectorToCoordinates,
  calculateSectorAngle,
} from './utils'

// Re-export components
export {
  SVGFilters,
  GameBoardControls,
  Minimap,
  GravityWell,
  TransferSectors,
  MissileRenderer,
  ShipRenderer,
  WeaponRangeIndicators,
} from './components'

// Note: Main GameBoard component not yet migrated - still in ../GameBoard.tsx
// All sub-components have been extracted. Next step is to update GameBoard.tsx to use these components.
