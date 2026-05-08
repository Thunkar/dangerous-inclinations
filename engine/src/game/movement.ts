import type {
  ShipState,
  PlayerAction,
  GravityWellId,
  BurnIntensity,
  ActionType,
  Facing,
} from "../models/game.ts";
import {
  BURN_COSTS,
  mapSectorOnTransfer,
  SECTORS_PER_RING,
  calculateBurnMassCost,
} from "../models/rings.ts";
import { getGravityWell } from "../models/gravityWells.ts";

/**
 * Helper to get max ring number for a gravity well
 * Black hole has 4 rings, planets have 3 rings
 */
function getMaxRingForWell(wellId: GravityWellId): number {
  const well = getGravityWell(wellId);
  if (!well) return 4; // Default to black hole
  return well.rings.length;
}

/**
 * Pure function to calculate orbital movement for a ship
 * Returns new ship state with updated sector
 *
 * Black hole: sectors increment (clockwise visual rotation)
 * Planets: sectors decrement (counterclockwise visual rotation)
 */
export function applyOrbitalMovement(ship: ShipState): ShipState {
  // Get well-specific ring configuration (planets and black hole have different velocities)
  const well = getGravityWell(ship.wellId);
  if (!well) {
    return ship;
  }

  const ringConfig = well.rings.find((r) => r.ring === ship.ring);
  if (!ringConfig) {
    return ship;
  }

  // All orbital movement increments sector numbers
  // The visual rotation direction is handled by the rendering (direction multiplier)
  // Sector numbers always increment regardless of well type
  const newSector = (ship.sector + ringConfig.velocity) % ringConfig.sectors;

  return {
    ...ship,
    sector: newSector,
  };
}

/**
 * Pure function to initiate a burn/transfer
 * Returns new ship state with transfer initiated and reaction mass consumed
 *
 * Note: Burn direction is determined by the ship's CURRENT facing.
 * If rotation is needed, it must be applied before calling this function.
 * All transfers complete immediately in the same turn.
 *
 * @param ship - Current ship state
 * @param action - Burn action to execute
 */
export function initiateBurn(ship: ShipState, action: PlayerAction): ShipState {
  if (action.type !== "burn") {
    return ship;
  }

  const burnCost = BURN_COSTS[action.data.burnIntensity];
  const sectorAdjustment = action.data.sectorAdjustment || 0;

  // Calculate total mass cost including sector adjustment
  const totalMassCost = calculateBurnMassCost(burnCost.mass, sectorAdjustment);

  // Use the ship's current facing (rotation should have been applied already in Phase 4)
  const burnDirection = ship.facing;

  // Calculate destination ring
  const direction = burnDirection === "prograde" ? 1 : -1;
  const destinationRing = ship.ring + direction * burnCost.rings;

  // Clamp to valid ring range (1 to max rings for this well)
  const maxRing = getMaxRingForWell(ship.wellId);
  const clampedDestination = Math.max(1, Math.min(maxRing, destinationRing));

  return {
    ...ship,
    reactionMass: ship.reactionMass - totalMassCost,
    transferState: {
      destinationRing: clampedDestination,
      sectorAdjustment: sectorAdjustment,
    },
  };
}

/**
 * Pure function to complete a burn transfer (ring change within same well)
 * Returns new ship state at destination ring/sector with transfer cleared
 *
 * @param ship - Current ship state
 * @returns Updated ship state
 */
export function completeRingTransfer(ship: ShipState): ShipState {
  if (!ship.transferState) {
    return ship;
  }

  // Well transfers are handled inline in actionProcessors and never set
  // `isWellTransfer` on a state that reaches here. If we see one, drop it
  // safely — but this is a programming error and should never happen.
  if (ship.transferState.isWellTransfer) {
    return {
      ...ship,
      transferState: null,
    };
  }

  // Handle burn transfer (ring change within same gravity well)
  const oldRing = ship.ring;
  const newRing = ship.transferState.destinationRing;
  const baseSector = mapSectorOnTransfer(oldRing, newRing, ship.sector);
  const adjustment = ship.transferState.sectorAdjustment || 0;

  // Apply sector adjustment with wraparound (all rings have 24 sectors)
  const finalSector =
    (baseSector + adjustment + SECTORS_PER_RING) % SECTORS_PER_RING;

  return {
    ...ship,
    ring: newRing,
    sector: finalSector,
    transferState: null,
  };
}

/**
 * Pure function to rotate ship facing
 * Returns new ship state with updated facing
 */
export function applyRotation(
  ship: ShipState,
  targetFacing: "prograde" | "retrograde"
): ShipState {
  return {
    ...ship,
    facing: targetFacing,
  };
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
 * @param rotateBeforeMove - Whether rotation happens before movement (default true for backwards compatibility)
 * @returns Projected ship state after movement (at destination ring if burning)
 */
export function calculatePostMovementPosition(
  initialShip: ShipState,
  pendingFacing?: Facing,
  pendingMovement?: {
    actionType: ActionType;
    burnIntensity?: BurnIntensity;
    sectorAdjustment: number;
  },
  rotateBeforeMove: boolean = true
): ShipState {
  let projectedShip = { ...initialShip };

  // Apply rotation BEFORE movement if specified (affects burn direction)
  if (
    rotateBeforeMove &&
    pendingFacing &&
    pendingFacing !== projectedShip.facing
  ) {
    projectedShip = applyRotation(projectedShip, pendingFacing);
  }

  // Apply orbital movement (ship moves along current ring)
  // This happens for BOTH coast and burn actions
  projectedShip = applyOrbitalMovement(projectedShip);

  // If burning, complete the transfer immediately (same turn)
  if (pendingMovement?.actionType === "burn" && pendingMovement.burnIntensity) {
    // Create a mock burn action to simulate the transfer
    const mockBurnAction = {
      type: "burn" as const,
      playerId: "mock",
      data: {
        burnIntensity: pendingMovement.burnIntensity,
        sectorAdjustment: pendingMovement.sectorAdjustment,
      },
    };

    // Initiate and complete burn immediately (all transfers are immediate)
    projectedShip = initiateBurn(projectedShip, mockBurnAction);
    if (projectedShip.transferState) {
      projectedShip = completeRingTransfer(projectedShip);
    }
  }

  // Apply rotation AFTER movement if specified (for facing after burn)
  if (
    !rotateBeforeMove &&
    pendingFacing &&
    pendingFacing !== projectedShip.facing
  ) {
    projectedShip = applyRotation(projectedShip, pendingFacing);
  }

  return projectedShip;
}
