import type { ShipState, Facing, BurnIntensity, ActionType } from '../types/game'
import type { TacticalAction } from '../context/GameContext'
import {
  applyOrbitalMovement,
  applyRotation,
  initiateBurn,
  completeRingTransfer,
} from '../game-logic/movement'

/**
 * Calculate the ship position after movement actions in the tactical sequence
 * This simulates rotation and movement to determine where the ship will be when weapons fire
 *
 * @param initialShip - Current ship state
 * @param tacticalSequence - Ordered tactical actions
 * @param pendingFacing - Pending facing change (from rotation action)
 * @param weaponActionId - ID of the weapon action to calculate position for
 * @returns Projected ship state when the weapon fires
 */
export function calculateShipPositionForWeapon(
  initialShip: ShipState,
  tacticalSequence: TacticalAction[],
  pendingFacing?: Facing,
  weaponActionId?: string
): ShipState {
  // If no weapon action specified, calculate position after all movement
  // Otherwise, calculate position just before the weapon fires

  let projectedShip = { ...initialShip }

  // Find weapon action index if specified
  const weaponActionIndex = weaponActionId
    ? tacticalSequence.findIndex(a => a.id === weaponActionId)
    : tacticalSequence.length

  // Process actions up to (but not including) the weapon action
  for (let i = 0; i < weaponActionIndex; i++) {
    const action = tacticalSequence[i]

    if (action.type === 'rotate') {
      // Apply rotation using pending facing
      if (pendingFacing) {
        projectedShip = applyRotation(projectedShip, pendingFacing)
      }
    } else if (action.type === 'move') {
      // Movement happens in two phases:
      // 1. Orbital movement (instant)
      // 2. Transfer (if burning)

      // First apply orbital movement
      projectedShip = applyOrbitalMovement(projectedShip)

      // For planning purposes, we need to simulate if there's a pending burn
      // Check if the ship has a pending transfer state (from a burn action)
      // Since we're in planning phase, we need to simulate the burn based on
      // what would happen during actual turn resolution
    }
  }

  return projectedShip
}

/**
 * Calculate ship position after movement with pending burn data
 * This is used during the planning phase to show where the ship will be after movement
 *
 * IMPORTANT: With immediate transfers, burns complete on the same turn.
 * During the current turn, weapons firing after movement will fire from:
 * - The destination ring and sector (after transfer completion)
 *
 * @param initialShip - Current ship state
 * @param pendingFacing - Facing after rotation action
 * @param pendingMovement - Movement action data (burn or coast)
 * @returns Projected ship state after movement (at destination ring if burning)
 */
export function calculatePostMovementPosition(
  initialShip: ShipState,
  pendingFacing?: Facing,
  pendingMovement?: {
    actionType: ActionType
    burnIntensity?: BurnIntensity
    sectorAdjustment: number
  }
): ShipState {
  let projectedShip = { ...initialShip }

  // Apply rotation if there's a pending facing change
  if (pendingFacing && pendingFacing !== projectedShip.facing) {
    projectedShip = applyRotation(projectedShip, pendingFacing)
  }

  // Apply orbital movement (ship moves along current ring)
  // This happens for BOTH coast and burn actions
  projectedShip = applyOrbitalMovement(projectedShip)

  // If burning, complete the transfer immediately (same turn)
  if (pendingMovement?.actionType === 'burn' && pendingMovement.burnIntensity) {
    // Create a mock burn action to simulate the transfer
    const mockBurnAction = {
      type: 'burn' as const,
      playerId: 'mock',
      data: {
        burnIntensity: pendingMovement.burnIntensity,
        sectorAdjustment: pendingMovement.sectorAdjustment,
      },
    }

    // Initiate and complete burn immediately (all transfers are immediate)
    projectedShip = initiateBurn(projectedShip, mockBurnAction)
    if (projectedShip.transferState) {
      projectedShip = completeRingTransfer(projectedShip)
    }
  }

  return projectedShip
}
