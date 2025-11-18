import type { ShipState } from '../types/game'

/**
 * Set heat venting amount for radiator
 * Returns new ship state with heat to vent set
 */
export function setHeatVenting(ship: ShipState, amount: number): ShipState {
  return {
    ...ship,
    heat: {
      ...ship.heat,
      heatToVent: amount,
    },
  }
}

/**
 * Process heat venting
 * Returns new ship state with heat reduced
 */
export function processHeatVenting(ship: ShipState): ShipState {
  const { currentHeat, heatToVent } = ship.heat

  if (heatToVent === 0) {
    return ship
  }

  const actualVent = Math.min(heatToVent, currentHeat)

  return {
    ...ship,
    heat: {
      ...ship.heat,
      currentHeat: currentHeat - actualVent,
      heatToVent: 0, // Reset after venting
    },
  }
}

/**
 * Calculate heat damage
 * Heat damage is calculated from heat at start of turn minus venting
 */
export function calculateHeatDamage(ship: ShipState): number {
  const effectiveHeat = Math.max(0, ship.heat.currentHeat - ship.heat.heatToVent)
  return effectiveHeat
}

/**
 * Validates if heat venting can be set
 * Heat can always be vented, up to the current heat level
 */
export function canVentHeat(ship: ShipState, amount: number): { valid: boolean; reason?: string } {
  if (amount > ship.heat.currentHeat) {
    return {
      valid: false,
      reason: `Cannot vent more heat than current level (${ship.heat.currentHeat})`,
    }
  }

  return { valid: true }
}
