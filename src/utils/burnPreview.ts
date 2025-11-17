import type { ShipState, PlayerAction } from '../types/game'
import { BURN_COSTS, mapSectorOnTransfer, SECTORS_PER_RING } from '../constants/rings'
import { getGravityWell } from '../constants/gravityWells'

export interface BurnDestination {
  ring: number
  sector: number
  isPhasing: boolean
  isTransfer: boolean
}

/**
 * Calculate where a ship will end up after executing a burn action
 * Used for previewing destination on the game board
 */
export function calculateBurnDestination(
  ship: ShipState,
  action: PlayerAction | null
): BurnDestination | null {
  if (!action || action.type !== 'burn') {
    return null
  }

  const burnCost = BURN_COSTS[action.data.burnIntensity]
  const burnDirection = ship.facing // Use ship's current facing

  // Get well-specific ring configuration for orbital movement
  const well = getGravityWell(ship.wellId)
  if (!well) {
    return null
  }

  const ringConfig = well.rings.find(r => r.ring === ship.ring)
  if (!ringConfig) {
    return null
  }

  // Transfer burn: calculate destination ring and sector
  const direction = burnDirection === 'prograde' ? 1 : -1
  const maxRing = well.rings.length
  const destinationRing = Math.max(1, Math.min(maxRing, ship.ring + direction * burnCost.rings))

  // For transfers: the ship will undergo orbital movement FIRST (this turn),
  // then the transfer completes (next turn) from that new position
  const sectorAfterMovement = (ship.sector + ringConfig.velocity) % SECTORS_PER_RING

  // Map from the sector AFTER orbital movement to the destination ring
  const baseSector = mapSectorOnTransfer(ship.ring, destinationRing, sectorAfterMovement)
  const adjustment = action.data.sectorAdjustment

  // Apply sector adjustment with wraparound (all rings have 24 sectors)
  const finalSector = (baseSector + adjustment + SECTORS_PER_RING) % SECTORS_PER_RING

  return {
    ring: destinationRing,
    sector: finalSector,
    isPhasing: false,
    isTransfer: true,
  }
}
