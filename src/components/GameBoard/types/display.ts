/**
 * Display types - purely visual representations for rendering
 *
 * These types contain screen coordinates and visual properties,
 * completely separate from game logic types.
 */

export interface Position {
  x: number
  y: number
}

export interface DisplayShip {
  id: string
  playerId: string
  position: Position
  rotation: number // Direction angle in radians
  color: string
  isActive: boolean
  size: number
}

export interface DisplayMissile {
  id: string
  ownerId: string
  position: Position
  rotation: number
  color: string
  label: string // e.g., "M1" for turn fired
  turnsRemaining: number
}

/**
 * DisplayState - the visual state that renderers consume
 *
 * This is computed from GameState + animation progress by AnimationContext.
 * Renderers just read positions and render - no calculations needed.
 */
export interface DisplayState {
  ships: DisplayShip[]
  missiles: DisplayMissile[]
}
