import type { ShipState, WeaponHitResult, CriticalHitEffect } from '../types/game'
import type { SubsystemType } from '../types/subsystems'
import { getSubsystemConfig } from '../types/subsystems'
import { calculateHeatDamage, addHeat } from './heat'

/**
 * Apply weapon damage to a ship with shield absorption
 * Shields convert damage to heat (up to their allocated energy)
 * Returns new ship state and hit result details
 */
export function applyDamageWithShields(
  ship: ShipState,
  damage: number,
  criticalTarget?: SubsystemType
): { ship: ShipState; hitResult: WeaponHitResult } {
  const shieldSubsystem = ship.subsystems.find(s => s.type === 'shields')
  const shieldCapacity = shieldSubsystem?.isPowered ? shieldSubsystem.allocatedEnergy : 0

  // Shields absorb damage up to their allocated energy
  const damageAbsorbed = Math.min(damage, shieldCapacity)
  const damageToHull = damage - damageAbsorbed

  // Apply hull damage
  let updatedShip: ShipState = {
    ...ship,
    hitPoints: Math.max(0, ship.hitPoints - damageToHull),
  }

  // Convert absorbed damage to heat
  if (damageAbsorbed > 0) {
    updatedShip = addHeat(updatedShip, damageAbsorbed)
  }

  // Roll for critical hit (10% chance)
  const criticalRoll = Math.random()
  const isCritical = criticalRoll < 0.1
  let criticalEffect: CriticalHitEffect | undefined

  // Apply critical hit if rolled and target is valid
  if (isCritical && criticalTarget) {
    const targetSubsystem = updatedShip.subsystems.find(s => s.type === criticalTarget)
    if (targetSubsystem && targetSubsystem.isPowered && targetSubsystem.allocatedEnergy > 0) {
      const energyLost = targetSubsystem.allocatedEnergy

      // Unpower the subsystem and return energy to reactor
      updatedShip = {
        ...updatedShip,
        reactor: {
          ...updatedShip.reactor,
          availableEnergy: Math.min(
            updatedShip.reactor.totalCapacity,
            updatedShip.reactor.availableEnergy + energyLost
          ),
        },
        subsystems: updatedShip.subsystems.map(s =>
          s.type === criticalTarget
            ? { ...s, allocatedEnergy: 0, isPowered: false }
            : s
        ),
      }

      // Add heat equal to the lost energy
      updatedShip = addHeat(updatedShip, energyLost)

      criticalEffect = {
        targetSubsystem: criticalTarget,
        energyLost,
        heatAdded: energyLost,
      }
    }
  }

  return {
    ship: updatedShip,
    hitResult: {
      hit: true,
      damage,
      damageToHull,
      damageToHeat: damageAbsorbed,
      critical: isCritical && !!criticalEffect,
      criticalEffect,
    },
  }
}

/**
 * Apply weapon damage directly to hull (bypasses shields)
 * Used for heat damage
 */
export function applyDirectDamage(ship: ShipState, damage: number): ShipState {
  return {
    ...ship,
    hitPoints: Math.max(0, ship.hitPoints - damage),
  }
}

/**
 * Legacy function for backwards compatibility
 * Apply weapon damage to a ship (now routes through shield system)
 */
export function applyWeaponDamage(ship: ShipState, _weaponType: SubsystemType, damage: number): ShipState {
  // For legacy calls, apply direct damage without shield absorption
  return applyDirectDamage(ship, damage)
}

/**
 * Apply heat damage to a ship based on current heat and dissipation
 * Heat damage is excess heat above dissipation capacity
 */
export function applyHeatDamageToShip(ship: ShipState): ShipState {
  const damage = calculateHeatDamage(ship)
  if (damage === 0) {
    return ship
  }

  return applyDirectDamage(ship, damage)
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

/**
 * Apply a critical hit effect to a ship (for deterministic testing)
 * This unpowers the target subsystem and converts its energy to heat
 */
export function applyCriticalHit(
  ship: ShipState,
  targetSubsystem: SubsystemType
): { ship: ShipState; effect: CriticalHitEffect | null } {
  const subsystem = ship.subsystems.find(s => s.type === targetSubsystem)

  // Can only crit powered systems with energy
  if (!subsystem || !subsystem.isPowered || subsystem.allocatedEnergy === 0) {
    return { ship, effect: null }
  }

  const energyLost = subsystem.allocatedEnergy

  // Unpower the subsystem and return energy to reactor
  let updatedShip: ShipState = {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: Math.min(
        ship.reactor.totalCapacity,
        ship.reactor.availableEnergy + energyLost
      ),
    },
    subsystems: ship.subsystems.map(s =>
      s.type === targetSubsystem
        ? { ...s, allocatedEnergy: 0, isPowered: false }
        : s
    ),
  }

  // Add heat equal to the lost energy
  updatedShip = addHeat(updatedShip, energyLost)

  return {
    ship: updatedShip,
    effect: {
      targetSubsystem,
      energyLost,
      heatAdded: energyLost,
    },
  }
}
