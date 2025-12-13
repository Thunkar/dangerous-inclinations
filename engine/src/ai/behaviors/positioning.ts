import type {
  CoastAction,
  BurnAction,
  RotateAction,
  WellTransferAction,
} from '../../models/game'
import type { TacticalSituation, Target, BotParameters } from '../types'

/**
 * Determine if bot should move closer or farther from target
 */
export function calculateDesiredRange(
  situation: TacticalSituation,
  target: Target | null,
  parameters: BotParameters
): 'closer' | 'farther' | 'maintain' {
  if (!target) {
    return 'maintain'
  }

  const currentRing = situation.status.ring
  const targetRing = target.player.ship.ring
  const ringDistance = Math.abs(currentRing - targetRing)

  const { preferredRingRange } = parameters

  // If target is too far, move closer
  if (ringDistance > preferredRingRange.max) {
    return 'closer'
  }

  // If target is too close, move farther
  if (ringDistance < preferredRingRange.min) {
    return 'farther'
  }

  // In optimal range
  return 'maintain'
}

/**
 * Generate movement action (coast or burn)
 */
export function generateMovementAction(
  situation: TacticalSituation,
  target: Target | null,
  parameters: BotParameters,
  sequence: number
): CoastAction | BurnAction {
  const { botPlayer, status } = situation
  const desiredRange = calculateDesiredRange(situation, target, parameters)

  // If we want to change range and have reaction mass, burn
  if (desiredRange !== 'maintain' && status.reactionMass >= 1) {
    // TODO: Determine burn direction and face correctly before burning
    // const targetRing = target?.player.ship.ring || status.ring
    // const shouldMoveInward = desiredRange === 'closer' ? targetRing < status.ring : targetRing > status.ring
    // const desiredFacing: 'prograde' | 'retrograde' = shouldMoveInward ? 'retrograde' : 'prograde'

    // Simple burn (soft intensity, no sector adjustment)
    return {
      type: 'burn',
      playerId: botPlayer.id,
      sequence,
      data: {
        burnIntensity: 'soft',
        sectorAdjustment: 0,
      },
    }
  }

  // Default: coast
  return {
    type: 'coast',
    playerId: botPlayer.id,
    sequence,
    data: {
      activateScoop: false, // For simplicity, don't activate scoop
    },
  }
}

/**
 * Generate rotation action if needed
 */
export function generateRotationAction(
  situation: TacticalSituation,
  desiredFacing: 'prograde' | 'retrograde' | null,
  sequence: number
): RotateAction | null {
  if (!desiredFacing || desiredFacing === situation.status.facing) {
    return null
  }

  // Check if rotation is available
  if (situation.status.subsystems.rotation.used || !situation.status.subsystems.rotation.powered) {
    return null
  }

  return {
    type: 'rotate',
    playerId: situation.botPlayer.id,
    sequence,
    data: {
      targetFacing: desiredFacing,
    },
  }
}

/**
 * Generate well transfer action for escape
 * Only used when bot is in danger
 */
export function generateEscapeTransfer(
  situation: TacticalSituation,
  parameters: BotParameters,
  sequence: number
): WellTransferAction | null {
  if (!parameters.useWellTransfers) {
    return null
  }

  // Only escape if in serious danger
  if (situation.status.healthPercent > 0.3 || situation.availableTransfers.length === 0) {
    return null
  }

  // Simple heuristic: use first available transfer
  const transfer = situation.availableTransfers[0]

  return {
    type: 'well_transfer',
    playerId: situation.botPlayer.id,
    sequence,
    data: {
      destinationWellId: transfer.toWellId,
    },
  }
}
