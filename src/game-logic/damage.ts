import type { ShipState } from '../types/game'
import type { SubsystemType } from '../types/subsystems'
import { getSubsystemConfig } from '../types/subsystems'
import { calculateHeatDamage } from './heat'

/**
 * Apply weapon damage to a ship
 * Returns new ship state with reduced hit points
 */
export function applyWeaponDamage(ship: ShipState, _weaponType: SubsystemType, damage: number): ShipState {
  const newHitPoints = Math.max(0, ship.hitPoints - damage)
  return {
    ...ship,
    hitPoints: newHitPoints,
  }
}

/**
 * Apply heat damage to a ship based on current heat and venting
 * Heat damage is calculated from heat at start of turn minus any venting
 */
export function applyHeatDamageToShip(ship: ShipState): ShipState {
  const damage = calculateHeatDamage(ship)
  if (damage === 0) {
    return ship
  }

  const newHitPoints = Math.max(0, ship.hitPoints - damage)
  return {
    ...ship,
    hitPoints: newHitPoints,
  }
}

/**
 * Get weapon damage amount from a subsystem
 */
export function getWeaponDamage(weaponType: SubsystemType): number {
  const config = getSubsystemConfig(weaponType)
  return config.weaponStats?.damage || 0
}

/**
 * Check if a ship is destroyed (hit points <= 0)
 */
export function isShipDestroyed(ship: ShipState): boolean {
  return ship.hitPoints <= 0
}
