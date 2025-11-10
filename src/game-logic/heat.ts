import type { ShipState } from '../types/game'
import type { Subsystem } from '../types/subsystems'

/**
 * Calculate heat generation from overclocked subsystems
 * Returns total heat generated this turn
 */
export function calculateHeatGeneration(subsystems: Subsystem[]): number {
  let totalHeat = 0

  subsystems.forEach(subsystem => {
    if (!subsystem.isPowered) return

    // Railgun generates 1 heat when fired (overclocked at 4+ energy)
    if (subsystem.type === 'railgun' && subsystem.allocatedEnergy >= 4) {
      totalHeat += 1
    }

    // Other subsystems could generate heat here in the future
  })

  return totalHeat
}

/**
 * Apply heat generation to ship
 * Returns new ship state with increased heat
 */
export function applyHeatGeneration(ship: ShipState): ShipState {
  const heatGenerated = calculateHeatGeneration(ship.subsystems)

  if (heatGenerated === 0) {
    return ship
  }

  return {
    ...ship,
    heat: {
      ...ship.heat,
      currentHeat: ship.heat.currentHeat + heatGenerated,
    },
  }
}

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
export function canVentHeat(
  ship: ShipState,
  amount: number
): { valid: boolean; reason?: string } {
  if (amount > ship.heat.currentHeat) {
    return {
      valid: false,
      reason: `Cannot vent more heat than current level (${ship.heat.currentHeat})`,
    }
  }

  return { valid: true }
}
