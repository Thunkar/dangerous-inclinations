/**
 * Weapon damage resolution (d10).
 *
 * 1 = miss, 2-9 = hit, 10 = critical. Each powered sensor array on the attacker
 * lowers the critical threshold by two (8-10 with one array).
 *
 * Shields absorb damage up to their allocated energy; absorbed damage becomes
 * heat and the shield energy returns to the reactor. A critical that still
 * reaches the hull breaks the slot the attacker named.
 */
import type { ShipState } from "../models/game.ts";
import { BASE_CRITICAL_CHANCE, SHIELD_HEAT_PER_POINT } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import type { EventDraft } from "../models/events.ts";
import type { HitRollResult, WeaponHitResult } from "../models/weapons.ts";
import {
  addHeat,
  breakSubsystem,
  findSubsystem,
  getEffectiveCriticalChance,
  revealSubsystem,
  updateSubsystem,
} from "./ship.ts";

export function rollToResult(
  roll: number,
  criticalChance: number = BASE_CRITICAL_CHANCE
): HitRollResult {
  if (roll <= 1) return "miss";
  const criticalValues = Math.round(criticalChance / 10);
  const threshold = 11 - criticalValues; // 10 at 10%, 8 at 30%
  return roll >= threshold ? "critical" : "hit";
}

export interface AttackOutcome {
  ship: ShipState;
  hitResult: WeaponHitResult;
  events: EventDraft[];
}

/**
 * Resolve one attack against `target`.
 * @param targetPlayerId owner of the target ship (for events)
 * @param roll d10 result, already rolled against the game's RNG
 */
export function resolveAttack(
  target: ShipState,
  targetPlayerId: string,
  damage: number,
  criticalTarget: SubsystemId,
  roll: number,
  attacker: ShipState,
  attackerPlayerId?: string,
  /** Laser fire: shields are electromagnetic and do not stop it. */
  ignoresShields = false
): AttackOutcome {
  const critChance = getEffectiveCriticalChance(attacker.subsystems);
  const result = rollToResult(roll, critChance);
  const sensorAssistedCritical = result === "critical" && rollToResult(roll) !== "critical";

  if (result === "miss") {
    return {
      ship: target,
      events: [],
      hitResult: {
        roll,
        result,
        damage: 0,
        damageToHull: 0,
        damageToHeat: 0,
        sensorAssistedCritical: false,
      },
    };
  }

  const events: EventDraft[] = [];
  let ship = target;

  // Shields absorb first, tile by tile in slot order — except laser damage,
  // which goes straight to the hull.
  let remainingDamage = damage;
  let absorbed = 0;
  const shields = ignoresShields
    ? []
    : ship.subsystems.filter((s) => s.type === "shields" && s.isPowered && !s.isBroken);
  for (const shield of shields) {
    if (remainingDamage <= 0) break;
    const take = Math.min(remainingDamage, shield.allocatedEnergy);
    if (take <= 0) continue;
    const left = shield.allocatedEnergy - take;
    // The cubes that absorbed go back to the reactor: the shield refills for free.
    ship = {
      ...ship,
      reactor: {
        ...ship.reactor,
        availableEnergy: Math.min(ship.reactor.totalCapacity, ship.reactor.availableEnergy + take),
      },
    };
    ship = updateSubsystem(ship, shield.id, { allocatedEnergy: left, isPowered: left > 0 });
    ship = addHeat(ship, take * SHIELD_HEAT_PER_POINT);
    const r = revealSubsystem(ship, targetPlayerId, shield.id, "absorbed");
    ship = r.ship;
    events.push(...r.events);
    remainingDamage -= take;
    absorbed += take;
  }
  const toHull = remainingDamage;

  ship = { ...ship, hitPoints: Math.max(0, ship.hitPoints - toHull) };

  let criticalEffect: WeaponHitResult["criticalEffect"];
  if (result === "critical" && toHull > 0) {
    const sub = findSubsystem(ship, criticalTarget);
    if (sub && !sub.isBroken) {
      const broken = breakSubsystem(ship, targetPlayerId, criticalTarget);
      ship = broken.ship;
      events.push(
        ...broken.events.map((e) =>
          e.type === "subsystem_broken" ? { ...e, by: attackerPlayerId } : e
        )
      );
      criticalEffect = {
        subsystemId: criticalTarget,
        subsystemType: sub.type,
        energyLost: broken.energyLost,
      };
    }
  }

  return {
    ship,
    events,
    hitResult: {
      roll,
      result,
      damage,
      damageToHull: toHull,
      damageToHeat: absorbed,
      criticalEffect,
      sensorAssistedCritical,
    },
  };
}
