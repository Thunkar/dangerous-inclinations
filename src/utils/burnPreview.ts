import type { ShipState, PlayerAction } from '../types/game'
import { getRingConfig, BURN_COSTS, mapSectorOnTransfer } from '../constants/rings'

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
  const burnDirection = action.targetFacing || ship.facing
  const ringConfig = getRingConfig(ship.ring)

  if (!ringConfig) {
    return null
  }

  // Transfer burn: calculate destination ring and sector
  const direction = burnDirection === 'prograde' ? 1 : -1
  const destinationRing = Math.max(1, Math.min(5, ship.ring + direction * burnCost.rings))

  // For transfers: the ship will undergo orbital movement FIRST (this turn),
  // then the transfer completes (next turn) from that new position
  const sectorAfterMovement = (ship.sector + ringConfig.velocity) % ringConfig.sectors

  // Map from the sector AFTER orbital movement to the destination ring
  const baseSector = mapSectorOnTransfer(ship.ring, destinationRing, sectorAfterMovement)
  const adjustment = action.data.sectorAdjustment

  const destRingConfig = getRingConfig(destinationRing)
  if (!destRingConfig) {
    return null
  }

  const finalSector = (baseSector + adjustment + destRingConfig.sectors) % destRingConfig.sectors

  return {
    ring: destinationRing,
    sector: finalSector,
    isPhasing: false,
    isTransfer: true,
  }
}
