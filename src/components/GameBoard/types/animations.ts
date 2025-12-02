/**
 * Animation system for visualizing turn actions
 *
 * Animations play sequentially to show each action's effect on the game state.
 * This makes gameplay easier to understand by providing visual feedback.
 */

export type AnimationType =
  | 'move' // Ship movement (coast or burn trajectory)
  | 'rotate' // Ship rotation
  | 'laser' // Laser beam firing
  | 'railgun' // Railgun shot
  | 'missile_launch' // Missile launch
  | 'missile_move' // Missile movement
  | 'missile_impact' // Missile impact
  | 'damage' // Ship taking damage
  | 'explosion' // Ship destruction

export interface AnimationState {
  id: string // Unique ID for this animation instance
  type: AnimationType
  playerId: string // Player who initiated the action
  targetPlayerId?: string // Target player (for weapons)

  // Animation timing
  startTime: number // When animation started (ms since epoch)
  duration: number // Total animation duration in ms
  progress: number // 0 to 1

  // Animation-specific data
  data: AnimationData
}

export type AnimationData =
  | MoveAnimationData
  | RotateAnimationData
  | LaserAnimationData
  | RailgunAnimationData
  | MissileAnimationData
  | DamageAnimationData
  | ExplosionAnimationData

export interface MoveAnimationData {
  type: 'move'
  fromWellId: string
  fromRing: number
  fromSector: number
  toWellId: string
  toRing: number
  toSector: number
  isTransfer: boolean // Whether this is a well transfer or ring transfer
}

export interface RotateAnimationData {
  type: 'rotate'
  wellId: string
  ring: number
  sector: number
  fromFacing: 'prograde' | 'retrograde'
  toFacing: 'prograde' | 'retrograde'
}

export interface LaserAnimationData {
  type: 'laser'
  fromWellId: string
  fromRing: number
  fromSector: number
  toWellId: string
  toRing: number
  toSector: number
}

export interface RailgunAnimationData {
  type: 'railgun'
  fromWellId: string
  fromRing: number
  fromSector: number
  toWellId: string
  toRing: number
  toSector: number
  facing: 'prograde' | 'retrograde'
}

export interface MissileAnimationData {
  type: 'missile_launch' | 'missile_move' | 'missile_impact'
  missileId?: string
  fromWellId: string
  fromRing: number
  fromSector: number
  toWellId?: string
  toRing?: number
  toSector?: number
}

export interface DamageAnimationData {
  type: 'damage'
  wellId: string
  ring: number
  sector: number
  damageAmount: number
}

export interface ExplosionAnimationData {
  type: 'explosion'
  wellId: string
  ring: number
  sector: number
}

/**
 * Animation queue - holds animations to be played in sequence
 */
export interface AnimationQueue {
  animations: AnimationState[]
  currentIndex: number
  isPaused: boolean
}

/**
 * Animation timing configuration
 */
export const ANIMATION_DURATIONS = {
  MOVE_COAST: 800, // Coast movement (1 sector)
  MOVE_BURN: 1200, // Burn movement (multiple sectors)
  ROTATE: 600, // Ship rotation
  LASER: 400, // Laser beam
  RAILGUN: 600, // Railgun shot
  MISSILE_LAUNCH: 500, // Missile launch
  MISSILE_MOVE: 800, // Missile movement per turn
  MISSILE_IMPACT: 400, // Missile impact
  DAMAGE: 300, // Damage flash
  EXPLOSION: 1000, // Ship destruction
  PAUSE_BETWEEN: 200, // Pause between animations
} as const
