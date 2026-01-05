import type { ShipState } from "../models/game";
import { BASE_CRITICAL_CHANCE } from "../models/game";
import type { SubsystemType } from "../models/subsystems";
import { getSubsystemConfig } from "../models/subsystems";
import { calculateHeatDamage, addHeat } from "./heat";
import { getGameConfig } from "./config";
import { getEffectiveCriticalChance } from "./loadout";
import {
  CriticalHitEffect,
  HitRollResult,
  WeaponHitResult,
} from "../models/weapons";

/**
 * Roll a d10 for hit resolution
 * Returns 1-10 (inclusive)
 *
 * When deterministicRolls is enabled in game config, returns the fixed roll value
 * instead of a random number. This is useful for consistent testing.
 */
export function rollD10(): number {
  const config = getGameConfig();
  if (config.deterministicRolls) {
    return config.fixedRollValue;
  }
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Convert d10 roll to hit result
 * 1 = miss, 2-9 = hit, 10 = critical (base behavior)
 *
 * With variable critical chance:
 * - Base critical chance is 10% (roll 10)
 * - With sensor array (+20%), critical chance is 30% (roll 8, 9, or 10)
 *
 * @param roll d10 roll result (1-10)
 * @param criticalChance Critical hit chance as percentage (0-100). Default is BASE_CRITICAL_CHANCE (10)
 */
export function rollToResult(
  roll: number,
  criticalChance: number = BASE_CRITICAL_CHANCE
): HitRollResult {
  if (roll === 1) return "miss";

  // Calculate critical threshold: higher criticalChance = lower threshold needed
  // At 10% (base), only roll 10 crits
  // At 30% (with sensor), rolls 8-10 crit (3 values = 30%)
  // criticalChance is in percentage points (10 = 10%, 30 = 30%)
  const criticalValues = Math.round(criticalChance / 10);
  const criticalThreshold = 11 - criticalValues; // 10 for 10%, 8 for 30%

  if (roll >= criticalThreshold) return "critical";
  return "hit";
}

/**
 * Apply weapon attack to a ship using d10 hit resolution
 *
 * Hit Resolution (d10):
 * - Roll 1: Miss - no damage
 * - Roll 2-9: Hit - normal damage (shields absorb first)
 * - Roll 10: Critical (or lower threshold with sensor array) - damage + targeted subsystem breaks
 *
 * Shield mechanics:
 * - Shields convert damage to heat (up to their allocated energy)
 * - Shield energy is CONSUMED when absorbing damage
 *
 * @param ship Target ship state
 * @param damage Weapon damage amount
 * @param criticalTarget Subsystem to break on critical hit (required)
 * @param roll Optional d10 roll (1-10). If not provided, rolls automatically.
 * @param attackerShip Optional attacker ship for critical chance calculation. If not provided, uses base critical chance.
 */
export function applyDamageWithShields(
  ship: ShipState,
  damage: number,
  criticalTarget: SubsystemType,
  roll?: number,
  attackerShip?: ShipState
): { ship: ShipState; hitResult: WeaponHitResult } {
  // Roll d10 if not provided (allows deterministic testing)
  const actualRoll = roll ?? rollD10();

  // Calculate critical chance from attacker's ship (sensor array bonus)
  const baseCritChance = attackerShip?.criticalChance ?? BASE_CRITICAL_CHANCE;
  const effectiveCritChance = attackerShip
    ? getEffectiveCriticalChance(baseCritChance, attackerShip.subsystems)
    : baseCritChance;

  const result = rollToResult(actualRoll, effectiveCritChance);

  // Miss - no damage, no effects
  if (result === "miss") {
    return {
      ship,
      hitResult: {
        roll: actualRoll,
        result: "miss",
        damage: 0,
        damageToHull: 0,
        damageToHeat: 0,
      },
    };
  }

  // Hit or Critical - apply damage with shields
  const shieldSubsystem = ship.subsystems.find((s) => s.type === "shields");
  const shieldCapacity =
    shieldSubsystem?.isPowered && !shieldSubsystem.isBroken
      ? shieldSubsystem.allocatedEnergy
      : 0;

  // Shields absorb damage up to their allocated energy
  const damageAbsorbed = Math.min(damage, shieldCapacity);
  const damageToHull = damage - damageAbsorbed;

  // Apply hull damage, deplete shield energy, and return energy to reactor
  const newShieldEnergy = shieldCapacity - damageAbsorbed;
  let updatedShip: ShipState = {
    ...ship,
    hitPoints: Math.max(0, ship.hitPoints - damageToHull),
    // Shields lose energy equal to damage absorbed, energy returns to reactor
    reactor: {
      ...ship.reactor,
      availableEnergy: Math.min(
        ship.reactor.totalCapacity,
        ship.reactor.availableEnergy + damageAbsorbed,
      ),
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === "shields"
        ? {
            ...s,
            allocatedEnergy: newShieldEnergy,
            isPowered: newShieldEnergy > 0,
          }
        : s,
    ),
  };

  // Convert absorbed damage to heat
  if (damageAbsorbed > 0) {
    updatedShip = addHeat(updatedShip, damageAbsorbed);
  }

  // Critical hit - break the targeted subsystem
  // IMPORTANT: Critical only triggers if hull was hit (damage penetrated shields)
  let criticalEffect: CriticalHitEffect | undefined;
  if (result === "critical" && damageToHull > 0) {
    const targetSubsystem = updatedShip.subsystems.find(
      (s) => s.type === criticalTarget,
    );

    // Only break if subsystem exists and isn't already broken
    if (targetSubsystem && !targetSubsystem.isBroken) {
      const energyLost = targetSubsystem.allocatedEnergy;

      // Break the subsystem, unpower it, and return energy to reactor
      updatedShip = {
        ...updatedShip,
        reactor: {
          ...updatedShip.reactor,
          availableEnergy: Math.min(
            updatedShip.reactor.totalCapacity,
            updatedShip.reactor.availableEnergy + energyLost,
          ),
        },
        subsystems: updatedShip.subsystems.map((s) =>
          s.type === criticalTarget
            ? { ...s, allocatedEnergy: 0, isPowered: false, isBroken: true }
            : s,
        ),
      };

      // Add heat equal to the lost energy
      if (energyLost > 0) {
        updatedShip = addHeat(updatedShip, energyLost);
      }

      criticalEffect = {
        targetSubsystem: criticalTarget,
        energyLost,
        heatAdded: energyLost,
      };
    }
  }

  return {
    ship: updatedShip,
    hitResult: {
      roll: actualRoll,
      result,
      damage,
      damageToHull,
      damageToHeat: damageAbsorbed,
      criticalEffect,
    },
  };
}

/**
 * Apply weapon damage directly to hull (bypasses shields)
 * Used for heat damage
 */
export function applyDirectDamage(ship: ShipState, damage: number): ShipState {
  return {
    ...ship,
    hitPoints: Math.max(0, ship.hitPoints - damage),
  };
}

/**
 * Apply heat damage to a ship based on current heat and dissipation
 * Heat damage is excess heat above dissipation capacity
 */
export function applyHeatDamageToShip(ship: ShipState): ShipState {
  const damage = calculateHeatDamage(ship);
  if (damage === 0) {
    return ship;
  }

  return applyDirectDamage(ship, damage);
}

/**
 * Get weapon damage amount from a subsystem
 */
export function getWeaponDamage(weaponType: SubsystemType): number {
  const config = getSubsystemConfig(weaponType);
  return config.weaponStats?.damage || 0;
}

/**
 * Check if a ship is destroyed (hit points <= 0)
 */
export function isShipDestroyed(ship: ShipState): boolean {
  return ship.hitPoints <= 0;
}

/**
 * Apply a critical hit effect to a ship (for deterministic testing)
 * This breaks and unpowers the target subsystem and converts its energy to heat
 */
export function applyCriticalHit(
  ship: ShipState,
  targetSubsystem: SubsystemType,
): { ship: ShipState; effect: CriticalHitEffect | null } {
  const subsystem = ship.subsystems.find((s) => s.type === targetSubsystem);

  // Can only crit subsystems that aren't already broken
  if (!subsystem || subsystem.isBroken) {
    return { ship, effect: null };
  }

  const energyLost = subsystem.allocatedEnergy;

  // Break the subsystem, unpower it, and return energy to reactor
  let updatedShip: ShipState = {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: Math.min(
        ship.reactor.totalCapacity,
        ship.reactor.availableEnergy + energyLost,
      ),
    },
    subsystems: ship.subsystems.map((s) =>
      s.type === targetSubsystem
        ? { ...s, allocatedEnergy: 0, isPowered: false, isBroken: true }
        : s,
    ),
  };

  // Add heat equal to the lost energy
  if (energyLost > 0) {
    updatedShip = addHeat(updatedShip, energyLost);
  }

  return {
    ship: updatedShip,
    effect: {
      targetSubsystem,
      energyLost,
      heatAdded: energyLost,
    },
  };
}
