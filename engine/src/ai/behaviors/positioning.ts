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
      case 'deliver_cargo':
      case 'deliver_scan':
      case 'shadow_target': {
        // Navigate to the goal's target position. shadow_target uses the
        // tracked player's ring/sector so the bot moves into scan range
        // (same well, same ring, ±3 sectors).
        if (
          currentGoal.targetWellId != null &&
          currentGoal.targetRing != null &&
          currentGoal.targetSector != null
        ) {
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
          activateScoop: shouldActivateScoop(situation, parameters),
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
          activateScoop: shouldActivateScoop(situation, parameters),
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
          activateScoop: shouldActivateScoop(situation, parameters),
        },
      },
      needsRotation: false,
      desiredFacing: null,
    }
  }

  // Check if rotation is needed
  const needsRotation = firstAction.targetFacing != null && firstAction.targetFacing !== status.facing
  const desiredFacing = firstAction.targetFacing ?? null

  // Convert planner action → engine action.
  // The planner emits 'burn', 'coast', or 'well_transfer'. Each requires a
  // distinct engine action; previously well_transfer fell through to coast,
  // which silently kept the bot stranded on the black hole.
  if (firstAction.actionType === 'burn') {
    // Check if we have enough reaction mass
    if (status.reactionMass < 1) {
      return {
        action: {
          type: 'coast',
          playerId: botPlayer.id,
          sequence,
          data: {
            activateScoop: shouldActivateScoop(situation, parameters),
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

  if (firstAction.actionType === 'well_transfer' && firstAction.destinationWellId) {
    // The planner already validated this transfer is legal; emit the action.
    // The destination well lives on the planner's step.to.wellId.
    return {
      action: {
        type: 'well_transfer',
        playerId: botPlayer.id,
        sequence,
        data: {
          destinationWellId: firstAction.destinationWellId,
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
        activateScoop: shouldActivateScoop(situation, parameters),
      },
    },
    needsRotation,
    desiredFacing,
  }
}

/**
 * Check if scoop should be activated when coasting.
 *
 * The scoop must be currently powered — we don't speculate whether the
 * energy budget will fund a new allocation, because allocation can fail
 * (reactor full of higher-priority subsystems). Activating a coast with
 * `activateScoop: true` against an unpowered scoop fails validation.
 *
 * The fuel threshold (parameters.lowFuelThreshold) is shared with the
 * scoop allocation rule in survival.ts:buildEnergyBudget — both must agree
 * or the bot emits inconsistent actions.
 */
function shouldActivateScoop(
  situation: TacticalSituation,
  parameters: BotParameters
): boolean {
  const { status } = situation

  const scoop = status.subsystems.find(s => s.type === 'scoop')
  if (!scoop || !scoop.powered || scoop.broken) return false

  const max = getMaxReactionMass(status.subsystems)
  return status.reactionMass < Math.min(parameters.lowFuelThreshold, max)
}

/**
 * Generate rotation action if needed.
 *
 * `projectedRotationEnergy` is the rotation subsystem's energy AFTER this
 * turn's energy allocations apply (the engine processes allocations before
 * tactical actions). Without it we'd check current `rotation.powered` and
 * skip the rotate even when the budget plans to power rotation this turn —
 * leaving the bot unable to flip orientation.
 */
export function generateRotationAction(
  situation: TacticalSituation,
  desiredFacing: 'prograde' | 'retrograde' | null,
  sequence: number,
  projectedRotationEnergy?: number
): RotateAction | null {
  if (!desiredFacing || desiredFacing === situation.status.facing) {
    return null
  }

  // Check if rotation is available
  const rotation = situation.status.rotation
  if (rotation.used || rotation.broken) {
    return null
  }
  const energyAtFireTime = projectedRotationEnergy ?? rotation.energy
  if (energyAtFireTime <= 0) {
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

  // Well transfers cost 3 reaction mass (refunded if a fuel_compressor is
  // installed). Don't propose the action when the engine would reject it.
  const hasFuelCompressor = situation.status.subsystems.some(
    s => s.type === 'fuel_compressor'
  )
  if (!hasFuelCompressor && situation.botPlayer.ship.reactionMass < 3) {
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
