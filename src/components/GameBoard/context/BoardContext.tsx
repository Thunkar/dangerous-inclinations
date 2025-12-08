import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'
import { useGame, type AnimationHandlers } from '../../../context/GameContext'
import type { GameState, PlayerAction, FireWeaponAction } from '../../../types/game'
import type { DisplayState, DisplayShip, DisplayMissile } from '../types/display'
import type { FloatingNumber, FloatingNumberType, WeaponEffect } from '../types/effects'
import { FLOATING_NUMBER_DURATION, WEAPON_EFFECT_DURATIONS } from '../types/effects'
import { GRAVITY_WELLS } from '../../../constants/gravityWells'
import {
  BOARD_SIZE,
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BOARD_SCALE_FACTOR,
  getGravityWellPosition as getGravityWellPositionBase,
  getSectorRotationOffset as getSectorRotationOffsetBase,
  interpolateArcPosition,
  interpolateAngle,
  type Position,
} from '../utils'


export interface BoardContextValue {
  boardSize: number
  centerX: number
  centerY: number
  scaleFactor: number
  getGravityWellPosition: (wellId: string) => { x: number; y: number }
  getSectorRotationOffset: (wellId: string) => number
  displayState: DisplayState | null
  isAnimating: boolean
  // Visual effects
  floatingNumbers: FloatingNumber[]
  weaponEffects: WeaponEffect[]
  currentTime: number
  addFloatingNumber: (x: number, y: number, value: number, type: FloatingNumberType) => void
}

const BoardContext = createContext<BoardContextValue | null>(null)

const ACTION_DURATIONS: Record<string, number> = {
  rotate: 300,
  coast: 500,
  burn: 600,
  well_transfer: 800,
  fire_weapon: 400,
}

function calculateShipScreenPosition(
  ship: { wellId: string; ring: number; sector: number }
): Position {
  const well = GRAVITY_WELLS.find(w => w.id === ship.wellId)
  if (!well) return { x: 0, y: 0 }

  const ringConfig = well.rings.find(r => r.ring === ship.ring)
  if (!ringConfig) return { x: 0, y: 0 }

  const wellPos = getGravityWellPositionBase(ship.wellId, GRAVITY_WELLS, BOARD_CENTER_X, BOARD_CENTER_Y, BOARD_SCALE_FACTOR)
  const rotationOffset = getSectorRotationOffsetBase(ship.wellId, GRAVITY_WELLS)
  const radius = ringConfig.radius * BOARD_SCALE_FACTOR
  const angle = ((ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

  return {
    x: wellPos.x + radius * Math.cos(angle),
    y: wellPos.y + radius * Math.sin(angle),
  }
}

function calculateShipRotation(
  ship: { wellId: string; ring: number; sector: number; facing: string }
): number {
  const well = GRAVITY_WELLS.find(w => w.id === ship.wellId)
  if (!well) return 0

  const ringConfig = well.rings.find(r => r.ring === ship.ring)
  if (!ringConfig) return 0

  const rotationOffset = getSectorRotationOffsetBase(ship.wellId, GRAVITY_WELLS)
  const angle = ((ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

  return ship.facing === 'prograde' ? angle + Math.PI / 2 : angle - Math.PI / 2
}

/**
 * Calculate spread offset for missiles in the same sector.
 * Spreads missiles along the radial direction (toward/away from gravity well center)
 * to avoid visual overlap while keeping them on a radius through sector center.
 *
 * Always applies some offset (even for single missiles) to distinguish missiles from ships.
 */
function calculateMissileSpreadOffset(
  index: number,
  total: number,
  angle: number
): Position {
  // Spread distance between missiles (pixels) - increased for better visibility
  const SPREAD_DISTANCE = 15

  // Base offset to push missiles outward from sector center (distinguishes from ships)
  const BASE_OUTWARD_OFFSET = 8

  // The angle parameter is the position angle on the circle (radial direction from center).
  // Spread along this radial direction: positive offset = outward, negative = inward.
  // Center the spread around the sector center, but offset outward from the base position.
  const offsetIndex = index - (total - 1) / 2

  // Always apply base outward offset + spread offset
  const totalOffset = BASE_OUTWARD_OFFSET + offsetIndex * SPREAD_DISTANCE

  return {
    x: Math.cos(angle) * totalOffset,
    y: Math.sin(angle) * totalOffset,
  }
}

function gameStateToDisplayState(gameState: GameState): DisplayState {
  const ships: DisplayShip[] = gameState.players.map((player, index) => ({
    id: player.id,
    playerId: player.id,
    position: calculateShipScreenPosition(player.ship),
    rotation: calculateShipRotation(player.ship),
    color: player.color,
    isActive: index === gameState.activePlayerIndex,
    size: index === gameState.activePlayerIndex ? 14 : 12,
  }))

  // Group missiles by location to calculate spread offsets
  const missilesByLocation = new Map<string, typeof gameState.missiles>()
  for (const missile of gameState.missiles) {
    const key = `${missile.wellId}:${missile.ring}:${missile.sector}`
    const group = missilesByLocation.get(key) || []
    group.push(missile)
    missilesByLocation.set(key, group)
  }

  const missiles: DisplayMissile[] = gameState.missiles.map(missile => {
    const basePosition = calculateShipScreenPosition(missile)
    const owner = gameState.players.find(p => p.id === missile.ownerId)
    const well = GRAVITY_WELLS.find(w => w.id === missile.wellId)
    const ringConfig = well?.rings.find(r => r.ring === missile.ring)
    const rotationOffset = getSectorRotationOffsetBase(missile.wellId, GRAVITY_WELLS)
    const angle = ringConfig
      ? ((missile.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
      : 0

    // Calculate spread offset for missiles in same sector
    const locationKey = `${missile.wellId}:${missile.ring}:${missile.sector}`
    const missilesInSector = missilesByLocation.get(locationKey) || []
    const indexInSector = missilesInSector.indexOf(missile)
    const spreadOffset = calculateMissileSpreadOffset(indexInSector, missilesInSector.length, angle)

    const position = {
      x: basePosition.x + spreadOffset.x,
      y: basePosition.y + spreadOffset.y,
    }

    return {
      id: missile.id,
      ownerId: missile.ownerId,
      position,
      rotation: angle + Math.PI,
      color: owner?.color || '#ffffff',
      label: `M${missile.turnFired}`,
      turnsRemaining: 3 - missile.turnsAlive,
    }
  })

  return { ships, missiles }
}

function createIntermediateGameState(beforeState: GameState, afterState: GameState, action: PlayerAction): GameState {
  const isMovementAction = action.type === 'coast' || action.type === 'burn' || action.type === 'well_transfer'

  const players = beforeState.players.map(beforePlayer => {
    const afterPlayer = afterState.players.find(p => p.id === beforePlayer.id)
    if (!afterPlayer) return beforePlayer

    if (isMovementAction && beforePlayer.id === action.playerId) {
      return {
        ...beforePlayer,
        ship: {
          ...beforePlayer.ship,
          sector: afterPlayer.ship.sector,
          ring: afterPlayer.ship.ring,
          wellId: afterPlayer.ship.wellId,
          facing: afterPlayer.ship.facing,
        },
      }
    }
    return beforePlayer
  })

  let missiles = beforeState.missiles
  if (action.type === 'fire_weapon') {
    const newMissiles = afterState.missiles.filter(am => !beforeState.missiles.find(bm => bm.id === am.id))
    missiles = [...missiles, ...newMissiles]
  }

  return { ...beforeState, players, missiles }
}

function computeAnimatedDisplayState(
  beforeState: GameState,
  afterState: GameState,
  action: PlayerAction,
  progress: number
): DisplayState {
  const isMovementAction = action.type === 'coast' || action.type === 'burn' || action.type === 'well_transfer'
  const isFireAction = action.type === 'fire_weapon'

  const ships: DisplayShip[] = beforeState.players.map((beforePlayer, index) => {
    const afterPlayer = afterState.players.find(p => p.id === beforePlayer.id)
    let position = calculateShipScreenPosition(beforePlayer.ship)
    let rotation = calculateShipRotation(beforePlayer.ship)

    if (isMovementAction && action.playerId === beforePlayer.id && afterPlayer) {
      const afterPos = calculateShipScreenPosition(afterPlayer.ship)
      const afterRotation = calculateShipRotation(afterPlayer.ship)
      const wellPos = getGravityWellPositionBase(beforePlayer.ship.wellId, GRAVITY_WELLS, BOARD_CENTER_X, BOARD_CENTER_Y, BOARD_SCALE_FACTOR)

      position = interpolateArcPosition(position, afterPos, wellPos, progress)
      rotation = interpolateAngle(rotation, afterRotation, progress)
    }

    return {
      id: beforePlayer.id,
      playerId: beforePlayer.id,
      position,
      rotation,
      color: beforePlayer.color,
      isActive: index === beforeState.activePlayerIndex,
      size: index === beforeState.activePlayerIndex ? 14 : 12,
    }
  })

  const missiles: DisplayMissile[] = []

  // Group existing missiles by location to calculate spread offsets
  const missilesByLocation = new Map<string, typeof beforeState.missiles>()
  for (const missile of beforeState.missiles) {
    const key = `${missile.wellId}:${missile.ring}:${missile.sector}`
    const group = missilesByLocation.get(key) || []
    group.push(missile)
    missilesByLocation.set(key, group)
  }

  // Existing missiles - render at beforeState positions (no animation during player actions)
  // Missile movement happens after all player actions, shown when animation completes
  for (const missile of beforeState.missiles) {
    const owner = beforeState.players.find(p => p.id === missile.ownerId)
    const basePosition = calculateShipScreenPosition(missile)

    const well = GRAVITY_WELLS.find(w => w.id === missile.wellId)
    const ringConfig = well?.rings.find(r => r.ring === missile.ring)
    const rotationOffset = getSectorRotationOffsetBase(missile.wellId, GRAVITY_WELLS)
    const angle = ringConfig
      ? ((missile.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
      : 0

    // Calculate spread offset for missiles in same sector
    const locationKey = `${missile.wellId}:${missile.ring}:${missile.sector}`
    const missilesInSector = missilesByLocation.get(locationKey) || []
    const indexInSector = missilesInSector.indexOf(missile)
    const spreadOffset = calculateMissileSpreadOffset(indexInSector, missilesInSector.length, angle)

    const position = {
      x: basePosition.x + spreadOffset.x,
      y: basePosition.y + spreadOffset.y,
    }

    missiles.push({
      id: missile.id,
      ownerId: missile.ownerId,
      position,
      rotation: angle + Math.PI,
      color: owner?.color || '#ffffff',
      label: `M${missile.turnFired}`,
      turnsRemaining: 3 - missile.turnsAlive,
    })
  }

  // New missiles during fire_weapon
  if (isFireAction) {
    const newMissiles = afterState.missiles.filter(am => !beforeState.missiles.find(bm => bm.id === am.id))

    // Group new missiles by target location to calculate spread offsets
    // Also include existing missiles at same locations
    const newMissilesByLocation = new Map<string, typeof afterState.missiles>()
    for (const missile of [...beforeState.missiles, ...newMissiles]) {
      const key = `${missile.wellId}:${missile.ring}:${missile.sector}`
      const group = newMissilesByLocation.get(key) || []
      group.push(missile)
      newMissilesByLocation.set(key, group)
    }

    for (const missile of newMissiles) {
      const owner = beforeState.players.find(p => p.id === missile.ownerId)
      if (!owner) continue

      const startPos = calculateShipScreenPosition(owner.ship)
      const baseEndPos = calculateShipScreenPosition(missile)
      const wellPos = getGravityWellPositionBase(owner.ship.wellId, GRAVITY_WELLS, BOARD_CENTER_X, BOARD_CENTER_Y, BOARD_SCALE_FACTOR)

      const well = GRAVITY_WELLS.find(w => w.id === missile.wellId)
      const ringConfig = well?.rings.find(r => r.ring === missile.ring)
      const rotationOffset = getSectorRotationOffsetBase(missile.wellId, GRAVITY_WELLS)
      const angle = ringConfig
        ? ((missile.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
        : 0

      // Calculate spread offset for missiles in same sector (at end position)
      const locationKey = `${missile.wellId}:${missile.ring}:${missile.sector}`
      const missilesInSector = newMissilesByLocation.get(locationKey) || []
      const indexInSector = missilesInSector.indexOf(missile)
      const spreadOffset = calculateMissileSpreadOffset(indexInSector, missilesInSector.length, angle)

      const endPos = {
        x: baseEndPos.x + spreadOffset.x,
        y: baseEndPos.y + spreadOffset.y,
      }

      const position = interpolateArcPosition(startPos, endPos, wellPos, progress)

      missiles.push({
        id: missile.id,
        ownerId: missile.ownerId,
        position,
        rotation: angle + Math.PI,
        color: owner.color,
        label: `M${missile.turnFired}`,
        turnsRemaining: 3 - missile.turnsAlive,
      })
    }
  }

  return { ships, missiles }
}

interface BoardProviderProps {
  children: ReactNode
}

// Animation state stored in a single ref object for cleaner access
interface AnimationState {
  frameId: number | null
  originalBeforeState: GameState | null // Original state at start of animation (for heat comparison)
  beforeState: GameState | null // Current intermediate state (mutates during animation)
  afterState: GameState | null
  actions: PlayerAction[]
  actionIndex: number
  startTime: number
  onComplete: (() => void) | null
}

export function BoardProvider({ children }: BoardProviderProps) {
  const { registerAnimationHandlers } = useGame()

  const [displayState, setDisplayState] = useState<DisplayState | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Floating numbers state for visual effects
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([])
  const [weaponEffects, setWeaponEffects] = useState<WeaponEffect[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const floatingNumberIdRef = useRef(0)
  const weaponEffectIdRef = useRef(0)

  // Single ref for all animation state
  const anim = useRef<AnimationState>({
    frameId: null,
    originalBeforeState: null,
    beforeState: null,
    afterState: null,
    actions: [],
    actionIndex: -1,
    startTime: 0,
    onComplete: null,
  })

  // Add a new floating number
  const addFloatingNumber = useCallback((x: number, y: number, value: number, type: FloatingNumberType) => {
    const id = `floating-${floatingNumberIdRef.current++}`
    const newNumber: FloatingNumber = {
      id,
      x,
      y,
      value,
      type,
      startTime: performance.now(),
      duration: FLOATING_NUMBER_DURATION,
    }
    setFloatingNumbers(prev => [...prev, newNumber])
  }, [])

  const helpers = useMemo(() => ({
    getGravityWellPosition: (wellId: string) =>
      getGravityWellPositionBase(wellId, GRAVITY_WELLS, BOARD_CENTER_X, BOARD_CENTER_Y, BOARD_SCALE_FACTOR),
    getSectorRotationOffset: (wellId: string) =>
      getSectorRotationOffsetBase(wellId, GRAVITY_WELLS),
  }), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (anim.current.frameId !== null) {
        cancelAnimationFrame(anim.current.frameId)
      }
    }
  }, [])

  // Visual effects animation loop - runs when there are floating numbers or weapon effects
  useEffect(() => {
    // Don't run if no effects
    if (floatingNumbers.length === 0 && weaponEffects.length === 0) {
      return
    }

    let frameId: number | null = null

    const tickEffects = () => {
      const now = performance.now()
      setCurrentTime(now)

      // Remove expired floating numbers
      setFloatingNumbers(prev => {
        const active = prev.filter(num => now - num.startTime < num.duration)
        return active.length !== prev.length ? active : prev
      })

      // Remove expired weapon effects
      setWeaponEffects(prev => {
        const active = prev.filter(effect => now - effect.startTime < effect.duration)
        return active.length !== prev.length ? active : prev
      })

      // Continue loop only if there might still be effects
      frameId = requestAnimationFrame(tickEffects)
    }

    // Start the loop
    frameId = requestAnimationFrame(tickEffects)

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [floatingNumbers.length > 0 || weaponEffects.length > 0]) // Only re-run when transitioning between 0 and non-0

  // Helper to add weapon effect
  const addWeaponEffect = useCallback((
    type: 'laser' | 'railgun',
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => {
    const id = `weapon-${weaponEffectIdRef.current++}`
    const newEffect: WeaponEffect = {
      id,
      type,
      startX,
      startY,
      endX,
      endY,
      startTime: performance.now(),
      duration: WEAPON_EFFECT_DURATIONS[type],
    }
    setWeaponEffects(prev => [...prev, newEffect])
  }, [])

  // Track which action index we last spawned weapon effects for
  const lastWeaponEffectActionRef = useRef(-1)
  // Track which action index we last spawned floating numbers for (on completion)
  const lastFloatingNumberActionRef = useRef(-1)

  // Animation tick function
  const tick = () => {
    const { beforeState, afterState, actions, actionIndex, startTime } = anim.current

    if (!beforeState || !afterState || actionIndex < 0 || actionIndex >= actions.length) {
      return
    }

    const action = actions[actionIndex]
    const duration = ACTION_DURATIONS[action.type] || 500
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Spawn weapon effects at the START of a fire_weapon action (only once per action)
    if (action.type === 'fire_weapon' && lastWeaponEffectActionRef.current !== actionIndex) {
      lastWeaponEffectActionRef.current = actionIndex
      const fireAction = action as FireWeaponAction
      const weaponType = fireAction.data.weaponType

      // Only laser and railgun get visual effects (missiles have their own animation)
      if (weaponType === 'laser' || weaponType === 'railgun') {
        const attacker = beforeState.players.find(p => p.id === action.playerId)
        if (attacker) {
          const attackerPos = calculateShipScreenPosition(attacker.ship)

          for (const targetId of fireAction.data.targetPlayerIds) {
            const target = beforeState.players.find(p => p.id === targetId)
            if (target) {
              const targetPos = calculateShipScreenPosition(target.ship)
              addWeaponEffect(weaponType, attackerPos.x, attackerPos.y, targetPos.x, targetPos.y)
            }
          }
        }
      }
    }

    const animatedDisplay = computeAnimatedDisplayState(beforeState, afterState, action, progress)
    setDisplayState(animatedDisplay)

    if (progress >= 1) {
      // Action complete - spawn floating numbers for fire_weapon actions
      if (action.type === 'fire_weapon' && lastFloatingNumberActionRef.current !== actionIndex) {
        lastFloatingNumberActionRef.current = actionIndex
        const fireAction = action as FireWeaponAction

        // Check damage/shield changes for each target
        for (const targetId of fireAction.data.targetPlayerIds) {
          const targetBefore = beforeState.players.find(p => p.id === targetId)
          const targetAfter = afterState.players.find(p => p.id === targetId)
          if (!targetBefore || !targetAfter) continue

          const position = calculateShipScreenPosition(targetAfter.ship)

          // Hull damage (red) - when HP decreases
          const hullDamage = targetBefore.ship.hitPoints - targetAfter.ship.hitPoints
          if (hullDamage > 0) {
            addFloatingNumber(position.x, position.y, hullDamage, 'damage')
          }

          // Shield absorption (blue) - detected by shield energy depletion
          const shieldsBefore = targetBefore.ship.subsystems.find(s => s.type === 'shields')
          const shieldsAfter = targetAfter.ship.subsystems.find(s => s.type === 'shields')
          const shieldEnergyBefore = shieldsBefore?.allocatedEnergy || 0
          const shieldEnergyAfter = shieldsAfter?.allocatedEnergy || 0
          const shieldAbsorbed = shieldEnergyBefore - shieldEnergyAfter

          if (shieldAbsorbed > 0) {
            addFloatingNumber(position.x, position.y, shieldAbsorbed, 'shield')
          }
        }
      }

      // Update intermediate state
      anim.current.beforeState = createIntermediateGameState(beforeState, afterState, action)
      anim.current.actionIndex++

      if (anim.current.actionIndex >= actions.length) {
        // All done - spawn heat floating numbers for active player
        const originalBeforeState = anim.current.originalBeforeState
        if (originalBeforeState) {
          const activePlayerId = originalBeforeState.players[originalBeforeState.activePlayerIndex]?.id

          for (const playerAfter of afterState.players) {
            if (playerAfter.id !== activePlayerId) continue

            const playerBefore = originalBeforeState.players.find(p => p.id === playerAfter.id)
            if (!playerBefore) continue

            const position = calculateShipScreenPosition(playerAfter.ship)
            const heatBefore = playerBefore.ship.heat?.currentHeat || 0
            const heatAfter = playerAfter.ship.heat?.currentHeat || 0
            const heatGenerated = heatAfter - heatBefore

            if (heatGenerated > 0) {
              addFloatingNumber(position.x, position.y, heatGenerated, 'heat')
            }
          }
        }

        setDisplayState(gameStateToDisplayState(afterState))
        setIsAnimating(false)
        anim.current.originalBeforeState = null
        anim.current.beforeState = null
        anim.current.afterState = null
        anim.current.actions = []
        anim.current.actionIndex = -1
        lastWeaponEffectActionRef.current = -1 // Reset for next animation sequence
        lastFloatingNumberActionRef.current = -1

        if (anim.current.onComplete) {
          anim.current.onComplete()
          anim.current.onComplete = null
        }
      } else {
        // Next action
        anim.current.startTime = performance.now()
        anim.current.frameId = requestAnimationFrame(tick)
      }
    } else {
      anim.current.frameId = requestAnimationFrame(tick)
    }
  }

  // Track isAnimating in a ref so handlers don't need to re-register
  const isAnimatingRef = useRef(false)
  isAnimatingRef.current = isAnimating

  // Register handlers once on mount only
  useEffect(() => {
    const handlers: AnimationHandlers = {
      syncDisplayState: (state: GameState) => {
        // Don't sync if we're animating - it would reset the animation
        if (isAnimatingRef.current) return
        setDisplayState(gameStateToDisplayState(state))
      },

      startAnimation: (beforeState: GameState, afterState: GameState, actions: PlayerAction[], onComplete: () => void) => {
        // Cancel any running animation
        if (anim.current.frameId !== null) {
          cancelAnimationFrame(anim.current.frameId)
        }

        // Filter tactical actions
        const tacticalActions = actions
          .filter(a => a.sequence !== undefined)
          .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))

        if (tacticalActions.length === 0) {
          setDisplayState(gameStateToDisplayState(afterState))
          onComplete()
          return
        }

        // Setup animation state
        anim.current.originalBeforeState = beforeState // Store original for heat comparison
        anim.current.beforeState = beforeState
        anim.current.afterState = afterState
        anim.current.actions = tacticalActions
        anim.current.actionIndex = 0
        anim.current.onComplete = onComplete
        anim.current.startTime = performance.now()

        setDisplayState(gameStateToDisplayState(beforeState))
        setIsAnimating(true)

        anim.current.frameId = requestAnimationFrame(tick)
      },

      isAnimating: () => isAnimatingRef.current,
    }

    registerAnimationHandlers(handlers)
  }, [registerAnimationHandlers, addFloatingNumber])

  return (
    <BoardContext.Provider
      value={{
        boardSize: BOARD_SIZE,
        centerX: BOARD_CENTER_X,
        centerY: BOARD_CENTER_Y,
        scaleFactor: BOARD_SCALE_FACTOR,
        getGravityWellPosition: helpers.getGravityWellPosition,
        getSectorRotationOffset: helpers.getSectorRotationOffset,
        displayState,
        isAnimating,
        // Visual effects
        floatingNumbers,
        weaponEffects,
        currentTime,
        addFloatingNumber,
      }}
    >
      {children}
    </BoardContext.Provider>
  )
}

export function useBoardContext(): BoardContextValue {
  const context = useContext(BoardContext)
  if (!context) {
    throw new Error('useBoardContext must be used within BoardProvider')
  }
  return context
}
