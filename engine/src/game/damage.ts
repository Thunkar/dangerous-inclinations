/**
 * Weapon damage resolution (d10).
 *
 * 1 = miss, 2-9 = hit, 10 = critical. A powered sensor array on the attacker
 * makes 8-10 critical (`lowestCriticalFace`).
 *
 * Shields absorb one point of damage per SHIELD_ENERGY_PER_POINT cubes on the
 * tile (or the weapon's own `shieldEnergyPerPoint`); the cubes that absorb are
 * spent, leaving the tile dark until it is re-powered. Absorbing makes no
 * heat: a shield's cost is its cubes at its owner's check, like every tile. A critical breaks the slot the attacker named
 * whether or not the shot reached the hull.
 *
 * A disruptor deals no damage and never criticals: a hit breaks the named slot
 * unless the target has any powered shield, which blocks it whole.
 */
import type { ShipState } from "../models/game.ts";
import { BASE_CRITICAL_FACE } from "../models/game.ts";
import { SHIELD_ENERGY_PER_POINT, isPowered } from "../models/subsystems.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import type { EventDraft } from "../models/events.ts";
import type { HitRollResult, WeaponHitResult } from "../models/weapons.ts";
import {
  breakSubsystem,
  lowestCriticalFace,
  revealSubsystem,
  updateSubsystem,
} from "./ship.ts";

/** What a d10 face does: 1 misses, `criticalFace` and above is a critical, the rest hit. */
export function rollToResult(roll: number, criticalFace: number = BASE_CRITICAL_FACE): HitRollResult {
  if (roll <= 1) return "miss";
  return roll >= criticalFace ? "critical" : "hit";
}

interface AttackOutcome {
  ship: ShipState;
  hitResult: WeaponHitResult;
  events: EventDraft[];
}

/** How a weapon meets shields; read off its `WeaponStats`. */
export interface AttackOptions {
  /** Laser fire: shields are electromagnetic and do not stop it. */
  ignoresShields?: boolean;
  /** Cubes a shield spends per point absorbed; omitted is SHIELD_ENERGY_PER_POINT. */
  shieldEnergyPerPoint?: number;
  /** Disruptor: no damage, a hit breaks the named slot unless a shield is up. */
  disrupts?: boolean;
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
  options: AttackOptions = {}
): AttackOutcome {
  const { ignoresShields = false, disrupts = false } = options;
  const rate = options.shieldEnergyPerPoint ?? SHIELD_ENERGY_PER_POINT;
  // A disruptor has no critical to widen: 2-10 is a hit whatever a sensor says.
  const rolled = rollToResult(roll, lowestCriticalFace(attacker.subsystems));
  const result = disrupts && rolled === "critical" ? "hit" : rolled;

  if (result === "miss") {
    return {
      ship: target,
      events: [],
      hitResult: {
        roll,
        result,
        damage: 0,
        damageToHull: 0,
        absorbed: 0,
      },
    };
  }

  const events: EventDraft[] = [];
  let ship = target;

  if (disrupts) return disrupt(ship, targetPlayerId, criticalTarget, roll, attackerPlayerId);

  // Shields absorb first, tile by tile in slot order, except laser damage,
  // which goes straight to the hull.
  let remainingDamage = damage;
  let absorbed = 0;
  const shields = ignoresShields
    ? []
    : ship.subsystems.filter((s) => s.type === "shields" && isPowered(s) && !s.isBroken);
  for (const shield of shields) {
    if (remainingDamage <= 0) break;
    const take = Math.min(remainingDamage, Math.floor(shield.allocatedEnergy / rate));
    if (take <= 0) continue;
    const spent = take * rate;
    const left = shield.allocatedEnergy - spent;
    // The cubes that absorbed are spent: the tile is down by as much as it
    // soaked until its owner powers it again on their next turn, and a
    // critical that finds it now dumps only what is left. Absorbing makes no
    // heat: the cubes were billed at their owner's check when they went on.
    ship = updateSubsystem(ship, shield.id, {
      allocatedEnergy: left,
    });
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
  // (the tile that soaked the shot spent its cubes, so breaking it dumps
  // little or no heat), but the tile is gone until a dock.
  if (result === "critical") {
    const broken = breakNamed(ship, targetPlayerId, criticalTarget, attackerPlayerId);
    ship = broken.ship;
    events.push(...broken.events);
  }

  return {
    ship,
    events,
    hitResult: {
      roll,
      result,
      damage,
      damageToHull: toHull,
      absorbed,
    },
  };
}

/** Break the slot an attacker named, crediting the attacker on the event. */
function breakNamed(
  ship: ShipState,
  targetPlayerId: string,
  criticalTarget: SubsystemId,
  attackerPlayerId: string | undefined
): { ship: ShipState; events: EventDraft[] } {
  const broken = breakSubsystem(ship, targetPlayerId, criticalTarget);
  return {
    ship: broken.ship,
    events: broken.events.map((e) =>
      e.type === "subsystem_broken" ? { ...e, by: attackerPlayerId } : e
    ),
  };
}

/**
 * A disruptor hit. Any powered, working shield blocks it whole: nothing is
 * spent and no heat taken, and the first such shield in slot order turns
 * face-up, since it did something. Otherwise the named slot breaks as a
 * critical breaks it (its cubes dump as heat; a broken slot stays broken).
 */
function disrupt(
  ship: ShipState,
  targetPlayerId: string,
  criticalTarget: SubsystemId,
  roll: number,
  attackerPlayerId: string | undefined
): AttackOutcome {
  const shield = ship.subsystems.find(
    (s) => s.type === "shields" && isPowered(s) && !s.isBroken
  );
  const hitResult: WeaponHitResult = {
    roll,
    result: "hit",
    damage: 0,
    damageToHull: 0,
    absorbed: 0,
  };
  if (shield) {
    const r = revealSubsystem(ship, targetPlayerId, shield.id, "absorbed");
    return { ship: r.ship, events: r.events, hitResult: { ...hitResult, blocked: true } };
  }
  const broken = breakNamed(ship, targetPlayerId, criticalTarget, attackerPlayerId);
  return { ship: broken.ship, events: broken.events, hitResult };
}
