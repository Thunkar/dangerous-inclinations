/**
 * Build animations from game actions and turn results
 *
 * Converts PlayerActions into AnimationStates that can be rendered by the animation system.
 */

import type { GameState, PlayerAction, TurnLogEntry } from '../../../types/game'
import type {
  AnimationState,
  MoveAnimationData,
  RotateAnimationData,
  LaserAnimationData,
  RailgunAnimationData,
  MissileAnimationData,
  DamageAnimationData,
} from '../types/animations'
import { ANIMATION_DURATIONS } from '../types/animations'

let animationIdCounter = 0

function generateAnimationId(): string {
  return `anim-${Date.now()}-${animationIdCounter++}`
}

/**
 * Build animations from turn execution result
 */
export function buildAnimationsFromTurn(
  actions: PlayerAction[],
  _logEntries: TurnLogEntry[],
  beforeState: GameState,
  afterState: GameState
): AnimationState[] {
  console.log('[animationBuilder] Building animations for actions:', actions)
  const animations: AnimationState[] = []

  // Sort actions by sequence (tactical actions have sequence numbers)
  const sortedActions = [...actions].sort((a, b) => {
    const seqA = a.sequence ?? -1
    const seqB = b.sequence ?? -1
    return seqA - seqB
  })

  const playerId = actions[0]?.playerId
  if (!playerId) {
    console.log('[animationBuilder] No playerId found, returning empty animations')
    return []
  }

  const playerIndexBefore = beforeState.players.findIndex(p => p.id === playerId)
  const playerIndexAfter = afterState.players.findIndex(p => p.id === playerId)

  if (playerIndexBefore === -1) return []

  const playerBefore = beforeState.players[playerIndexBefore]
  const playerAfter = playerIndexAfter !== -1 ? afterState.players[playerIndexAfter] : null

  // Track current position through the turn (for sequential position updates)
  let currentWellId = playerBefore.ship.wellId
  let currentRing = playerBefore.ship.ring
  let currentSector = playerBefore.ship.sector
  let currentFacing = playerBefore.ship.facing

  // Process each action in sequence
  for (const action of sortedActions) {
    if (action.type === 'rotate') {
      // Rotation animation
      animations.push({
        id: generateAnimationId(),
        type: 'rotate',
        playerId: action.playerId,
        startTime: Date.now(),
        duration: ANIMATION_DURATIONS.ROTATE,
        progress: 0,
        data: {
          type: 'rotate',
          wellId: currentWellId,
          ring: currentRing,
          sector: currentSector,
          fromFacing: currentFacing,
          toFacing: action.data.targetFacing,
        } satisfies RotateAnimationData,
      })

      currentFacing = action.data.targetFacing
    } else if (action.type === 'coast') {
      // Coast movement animation
      if (playerAfter) {
        const fromSector = currentSector
        const toSector = playerAfter.ship.sector
        const toRing = playerAfter.ship.ring
        const toWellId = playerAfter.ship.wellId

        animations.push({
          id: generateAnimationId(),
          type: 'move',
          playerId: action.playerId,
          startTime: Date.now(),
          duration: ANIMATION_DURATIONS.MOVE_COAST,
          progress: 0,
          data: {
            type: 'move',
            fromWellId: currentWellId,
            fromRing: currentRing,
            fromSector,
            toWellId,
            toRing,
            toSector,
            isTransfer: toWellId !== currentWellId || toRing !== currentRing,
          } satisfies MoveAnimationData,
        })

        currentWellId = toWellId
        currentRing = toRing
        currentSector = toSector
      }
    } else if (action.type === 'burn') {
      // Burn movement animation (longer duration)
      if (playerAfter) {
        const fromSector = currentSector
        const toSector = playerAfter.ship.sector
        const toRing = playerAfter.ship.ring
        const toWellId = playerAfter.ship.wellId

        animations.push({
          id: generateAnimationId(),
          type: 'move',
          playerId: action.playerId,
          startTime: Date.now(),
          duration: ANIMATION_DURATIONS.MOVE_BURN,
          progress: 0,
          data: {
            type: 'move',
            fromWellId: currentWellId,
            fromRing: currentRing,
            fromSector,
            toWellId,
            toRing,
            toSector,
            isTransfer: toWellId !== currentWellId || toRing !== currentRing,
          } satisfies MoveAnimationData,
        })

        currentWellId = toWellId
        currentRing = toRing
        currentSector = toSector
      }
    } else if (action.type === 'fire_weapon') {
      const weaponType = action.data.weaponType
      const targetPlayerIds = action.data.targetPlayerIds

      for (const targetId of targetPlayerIds) {
        const targetIndexBefore = beforeState.players.findIndex(p => p.id === targetId)
        const targetIndexAfter = afterState.players.findIndex(p => p.id === targetId)

        if (targetIndexBefore === -1) continue

        const targetBefore = beforeState.players[targetIndexBefore]
        const targetAfter = targetIndexAfter !== -1 ? afterState.players[targetIndexAfter] : null

        // Weapon firing animation
        if (weaponType === 'laser') {
          animations.push({
            id: generateAnimationId(),
            type: 'laser',
            playerId: action.playerId,
            targetPlayerId: targetId,
            startTime: Date.now(),
            duration: ANIMATION_DURATIONS.LASER,
            progress: 0,
            data: {
              type: 'laser',
              fromWellId: currentWellId,
              fromRing: currentRing,
              fromSector: currentSector,
              toWellId: targetBefore.ship.wellId,
              toRing: targetBefore.ship.ring,
              toSector: targetBefore.ship.sector,
            } satisfies LaserAnimationData,
          })
        } else if (weaponType === 'railgun') {
          animations.push({
            id: generateAnimationId(),
            type: 'railgun',
            playerId: action.playerId,
            targetPlayerId: targetId,
            startTime: Date.now(),
            duration: ANIMATION_DURATIONS.RAILGUN,
            progress: 0,
            data: {
              type: 'railgun',
              fromWellId: currentWellId,
              fromRing: currentRing,
              fromSector: currentSector,
              toWellId: targetBefore.ship.wellId,
              toRing: targetBefore.ship.ring,
              toSector: targetBefore.ship.sector,
              facing: currentFacing,
            } satisfies RailgunAnimationData,
          })
        } else if (weaponType === 'missiles') {
          animations.push({
            id: generateAnimationId(),
            type: 'missile_launch',
            playerId: action.playerId,
            targetPlayerId: targetId,
            startTime: Date.now(),
            duration: ANIMATION_DURATIONS.MISSILE_LAUNCH,
            progress: 0,
            data: {
              type: 'missile_launch',
              fromWellId: currentWellId,
              fromRing: currentRing,
              fromSector: currentSector,
              toWellId: targetBefore.ship.wellId,
              toRing: targetBefore.ship.ring,
              toSector: targetBefore.ship.sector,
            } satisfies MissileAnimationData,
          })
        }

        // Damage animation (if target took damage)
        if (targetAfter && targetAfter.ship.hitPoints < targetBefore.ship.hitPoints) {
          const damageAmount = targetBefore.ship.hitPoints - targetAfter.ship.hitPoints

          animations.push({
            id: generateAnimationId(),
            type: 'damage',
            playerId: targetId,
            startTime: Date.now(),
            duration: ANIMATION_DURATIONS.DAMAGE,
            progress: 0,
            data: {
              type: 'damage',
              wellId: targetBefore.ship.wellId,
              ring: targetBefore.ship.ring,
              sector: targetBefore.ship.sector,
              damageAmount,
            } satisfies DamageAnimationData,
          })
        }

        // Explosion animation (if target was destroyed)
        if (targetIndexAfter === -1) {
          animations.push({
            id: generateAnimationId(),
            type: 'explosion',
            playerId: targetId,
            startTime: Date.now(),
            duration: ANIMATION_DURATIONS.EXPLOSION,
            progress: 0,
            data: {
              type: 'explosion',
              wellId: targetBefore.ship.wellId,
              ring: targetBefore.ship.ring,
              sector: targetBefore.ship.sector,
            },
          })
        }
      }
    } else if (action.type === 'well_transfer') {
      // Well transfer animation
      if (playerAfter) {
        const fromSector = currentSector
        const toSector = playerAfter.ship.sector
        const toRing = playerAfter.ship.ring
        const toWellId = playerAfter.ship.wellId

        animations.push({
          id: generateAnimationId(),
          type: 'move',
          playerId: action.playerId,
          startTime: Date.now(),
          duration: ANIMATION_DURATIONS.MOVE_BURN, // Well transfer is like a burn
          progress: 0,
          data: {
            type: 'move',
            fromWellId: currentWellId,
            fromRing: currentRing,
            fromSector,
            toWellId,
            toRing,
            toSector,
            isTransfer: true,
          } satisfies MoveAnimationData,
        })

        currentWellId = toWellId
        currentRing = toRing
        currentSector = toSector
      }
    }
  }

  return animations
}
