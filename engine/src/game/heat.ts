import type { ShipState } from '../types/game'
import type { Subsystem } from '../types/subsystems'
import { getHeatOnUse } from '../types/subsystems'

/**
 * Calculate heat damage at start of turn
 * Damage = excess heat above dissipation capacity
 *
 * Heat lifecycle:
 * 1. Start of turn: evaluate heat, dissipate what we can, take damage from excess
 * 2. Heat resets to 0
 * 3. During turn: subsystem usage generates heat
 * 4. Between turns: shields and critical hits can generate heat
 * 5. Repeat at next turn start
 */
export function calculateHeatDamage(ship: ShipState): number {
  return Math.max(0, ship.heat.currentHeat - ship.dissipationCapacity)
}

/**
 * Reset heat to 0 at start of turn (after damage is calculated)
 * Heat is fully cleared each turn - damage was already taken from excess
 */
export function resetHeat(ship: ShipState): ShipState {
  return {
    ...ship,
    heat: {
      currentHeat: 0,
    },
  }
}

/**
 * Add heat to a ship (from subsystem use or shield absorption)
 */
export function addHeat(ship: ShipState, amount: number): ShipState {
  return {
    ...ship,
    heat: {
      currentHeat: ship.heat.currentHeat + amount,
    },
  }
}

/**
 * Generate heat from a subsystem being used
 * Returns new ship state with heat added equal to subsystem's allocated energy
 */
export function generateHeatFromSubsystemUse(ship: ShipState, subsystem: Subsystem): ShipState {
  const heatGenerated = getHeatOnUse(subsystem)
  if (heatGenerated === 0) return ship

  return addHeat(ship, heatGenerated)
}

/**
 * Calculate projected heat from a list of subsystem types that will be used
 * Used for real-time preview in the UI
 */
export function calculateProjectedHeat(
  subsystems: Subsystem[],
  subsystemsToUse: Array<'engines' | 'rotation' | 'scoop' | 'laser' | 'railgun' | 'missiles'>
): number {
  let totalHeat = 0

  for (const subsystemType of subsystemsToUse) {
    const subsystem = subsystems.find(s => s.type === subsystemType)
    if (subsystem) {
      totalHeat += getHeatOnUse(subsystem)
    }
  }

  return totalHeat
}
