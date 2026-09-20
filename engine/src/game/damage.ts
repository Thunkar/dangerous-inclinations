/**
 * Weapon damage resolution (d10).
 *
 * 1 = miss, 2-9 = hit, 10 = critical. Each powered sensor array on the attacker
 * lowers the critical threshold by two (8-10 with one array).
 *
 * Shields absorb one point of damage per SHIELD_ENERGY_PER_POINT cubes on the
 * tile; absorbed damage becomes heat and the spent cubes return to the reactor,
 * leaving the tile dark until it is re-powered. A critical breaks the slot the
 * attacker named whether or not the shot reached the hull.
 */
import type { ShipState } from "../models/game.ts";
import { BASE_CRITICAL_CHANCE, SHIELD_HEAT_PER_POINT } from "../models/game.ts";
import { SHIELD_ENERGY_PER_POINT } from "../models/subsystems.ts";
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

  // Shields absorb first, tile by tile in slot order, except laser damage,
  // which goes straight to the hull.
  let remainingDamage = damage;
  let absorbed = 0;
  const shields = ignoresShields
    ? []
    : ship.subsystems.filter((s) => s.type === "shields" && s.isPowered && !s.isBroken);
  for (const shield of shields) {
    if (remainingDamage <= 0) break;
    const take = Math.min(remainingDamage, Math.floor(shield.allocatedEnergy / SHIELD_ENERGY_PER_POINT));
    if (take <= 0) continue;
    const spent = take * SHIELD_ENERGY_PER_POINT;
    const left = shield.allocatedEnergy - spent;
    // The cubes that absorbed go back to the reactor: the shield refills for free.
    ship = {
      ...ship,
      reactor: {
        ...ship.reactor,
        availableEnergy: Math.min(ship.reactor.totalCapacity, ship.reactor.availableEnergy + spent),
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

  // A critical breaks the slot it named whether or not the shot reached the
  // hull. It used to need `toHull > 0`, which meant shields that held ate the
  // critical aimed at it: the fattest, most public slot on the loadout was also
  // the one best protected from being named. Absorbing first still blunts it
  // (the tile that soaked the shot spent its cubes back to the reactor, so
  // breaking it dumps little or no heat), but the tile is gone until a dock.
  let criticalEffect: WeaponHitResult["criticalEffect"];
  if (result === "critical") {
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
