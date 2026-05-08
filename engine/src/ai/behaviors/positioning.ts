import type {
  CoastAction,
  BurnAction,
  RotateAction,
  WellTransferAction,
} from '../../models/game.ts'
import type { TacticalSituation, Target, BotParameters } from '../types.ts'
import { planFromShip, getFirstAction } from '../movementPlanner/index.ts'
import type { OrbitalPosition } from '../movementPlanner/index.ts'
import { getMaxReactionMass } from '../../game/loadout.ts'

/**
 * Result of movement planning that informs energy allocation
 */
export interface MovementPlanResult {
  action: CoastAction | BurnAction | WellTransferAction
  needsRotation: boolean
  desiredFacing: 'prograde' | 'retrograde' | null
}

/**
 * Determine target position for the movement planner based on current goal
 */
function getTargetPosition(
  situation: TacticalSituation,
  target: Target | null,
  parameters: BotParameters
): OrbitalPosition | null {
  const { currentGoal } = situation

  if (currentGoal) {
    switch (currentGoal.type) {
      case 'destroy_target': {
        // Navigate toward target player's predicted position
        if (currentGoal.targetPlayerId) {
          const targetPlayer = situation.targets.find(
            t => t.player.id === currentGoal.targetPlayerId
          )
          if (targetPlayer) {
            return {
              wellId: targetPlayer.predictedPosition.wellId,
              ring: targetPlayer.predictedPosition.ring,
              sector: targetPlayer.predictedPosition.sector,
            }
          }
        }
        break
      }
      case 'pickup_cargo':
      case 'deliver_cargo': {
        // Navigate to station position (from goal)
        if (currentGoal.targetWellId != null && currentGoal.targetRing != null && currentGoal.targetSector != null) {
          return {
            wellId: currentGoal.targetWellId,
            ring: currentGoal.targetRing,
            sector: currentGoal.targetSector,
          }
        }
        break
      }
      case 'combat_opportunistic':
        // Fall through to target-based positioning
        break
    }
  }

  // Fall back to target-based range management
  if (target) {
    const { preferredRingRange } = parameters
    const targetRing = target.player.ship.ring
    const currentRing = situation.status.ring
    const ringDist = Math.abs(currentRing - targetRing)

    // If already in preferred range, stay put
    if (ringDist >= preferredRingRange.min && ringDist <= preferredRingRange.max) {
      return null
    }

    // Move toward preferred range
    let desiredRing: number
    if (ringDist > preferredRingRange.max) {
      // Too far, move closer
      desiredRing = currentRing > targetRing
        ? targetRing + preferredRingRange.max
        : targetRing - preferredRingRange.max
    } else {
      // Too close, move farther
      desiredRing = currentRing > targetRing
        ? targetRing + preferredRingRange.min
        : targetRing - preferredRingRange.min
    }

    desiredRing = Math.max(1, Math.min(5, desiredRing))

    return {
      wellId: target.player.ship.wellId,
      ring: desiredRing,
      sector: target.player.ship.sector,
    }
  }

  return null
}

/**
 * Plan movement using the movement planner.
 * Returns the movement action plus info about whether rotation is needed.
 */
export function planMovementAction(
  situation: TacticalSituation,
  target: Target | null,
  parameters: BotParameters,
  sequence: number
): MovementPlanResult {
  const { botPlayer, status } = situation
  const ship = botPlayer.ship

  // Get target position
  const targetPos = getTargetPosition(situation, target, parameters)

  // If no target position, coast (with scoop if available and fuel-efficient)
  if (!targetPos) {
    return {
      action: {
        type: 'coast',
        playerId: botPlayer.id,
        sequence,
        data: {
          activateScoop: shouldActivateScoop(situation),
        },
      },
      needsRotation: false,
      desiredFacing: null,
    }
  }

  // Use movement planner to find path
  const plan = planFromShip(ship, targetPos, 'fastest')

  if (!plan || plan.steps.length === 0) {
    // No path found - coast
    return {
      action: {
        type: 'coast',
        playerId: botPlayer.id,
        sequence,
        data: {
          activateScoop: shouldActivateScoop(situation),
        },
      },
      needsRotation: false,
      desiredFacing: null,
    }
  }

  // Extract first step
  const firstAction = getFirstAction(plan)
  if (!firstAction) {
    return {
      action: {
        type: 'coast',
        playerId: botPlayer.id,
        sequence,
        data: {
          activateScoop: shouldActivateScoop(situation),
        },
      },
      needsRotation: false,
      desiredFacing: null,
    }
  }

  // Check if rotation is needed
  const needsRotation = firstAction.targetFacing != null && firstAction.targetFacing !== status.facing
  const desiredFacing = firstAction.targetFacing ?? null

  // Convert to game action
  if (firstAction.actionType === 'burn') {
    // Check if we have enough reaction mass
    if (status.reactionMass < 1) {
      return {
        action: {
          type: 'coast',
          playerId: botPlayer.id,
          sequence,
          data: {
            activateScoop: shouldActivateScoop(situation),
          },
        },
        needsRotation: false,
        desiredFacing: null,
      }
    }

    return {
      action: {
        type: 'burn',
        playerId: botPlayer.id,
        sequence,
        data: {
          burnIntensity: firstAction.burnIntensity ?? 'soft',
          sectorAdjustment: firstAction.sectorAdjustment,
        },
      },
      needsRotation,
      desiredFacing,
    }
  }

  // Coast (default)
  return {
    action: {
      type: 'coast',
      playerId: botPlayer.id,
      sequence,
      data: {
        activateScoop: shouldActivateScoop(situation),
      },
    },
    needsRotation,
    desiredFacing,
  }
}

/**
 * Check if scoop should be activated when coasting
 */
function shouldActivateScoop(situation: TacticalSituation): boolean {
  const { status } = situation

  // Need a scoop subsystem that's powered
  const scoop = status.subsystems.find(s => s.type === 'scoop')
  if (!scoop || !scoop.powered || scoop.broken) return false

  // Only scoop if we need fuel
  return status.reactionMass < getMaxReactionMass(status.subsystems)
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
  const rotation = situation.status.rotation
  if (rotation.used || !rotation.powered) {
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

  // Well transfers require engines at level 3
  const enginesEnergy = situation.status.engines.energy
  if (enginesEnergy < 3) {
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
