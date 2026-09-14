/**
 * Energy. Allocation persists across turns and deallocation is free, so
 * each turn the bot decides the exact energy every subsystem should hold
 * and emits the deallocations and allocations that get there. Subsystems
 * are addressed by id, so two tiles of the same type are powered
 * independently.
 *
 * Heat is the real constraint: a subsystem adds its allocated energy as
 * heat when used, and heat above the ship's dissipation at the end of the
 * turn is hull damage. Callers budget heat before asking for energy.
 */
import type { AllocateEnergyAction, DeallocateEnergyAction, Player } from "../../models/game.ts";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";

/** Desired allocation per subsystem id. Missing ids are drained. */
export type EnergyTargets = Map<SubsystemId, number>;

export function totalEnergy(targets: EnergyTargets): number {
  let sum = 0;
  for (const v of targets.values()) sum += v;
  return sum;
}

/**
 * Give spare reactor energy to shields (up to their maximum), then to a
 * ballistic rack so it can intercept incoming missiles. Returns the
 * updated targets.
 */
export function assignDefensiveEnergy(
  targets: EnergyTargets,
  shields: Subsystem[],
  racks: Subsystem[],
  wantShields: boolean,
  wantRack: boolean,
  shieldMax: number = getSubsystemConfig("shields").maxEnergy
): EnergyTargets {
  let spare = REACTOR_CAPACITY - totalEnergy(targets);
  if (wantRack && spare >= getSubsystemConfig("ballistic_rack").minEnergy) {
    const rack = racks.find((r) => !r.isBroken && !targets.has(r.id));
    if (rack) {
      const amount = getSubsystemConfig("ballistic_rack").minEnergy;
      targets.set(rack.id, amount);
      spare -= amount;
    }
  }
  if (wantShields) {
    const config = getSubsystemConfig("shields");
    for (const shield of shields) {
      if (shield.isBroken || spare < config.minEnergy) continue;
      const amount = Math.min(shieldMax, spare);
      targets.set(shield.id, amount);
      spare -= amount;
    }
  }
  return targets;
}

/**
 * Deallocations then allocations that move the ship from its current
 * allocations to `targets`. Never leaves a subsystem below its minimum,
 * never exceeds a maximum, never spends more than the reactor has after
 * the deallocations.
 */
export function energyActions(
  me: Player,
  targets: EnergyTargets
): { deallocations: DeallocateEnergyAction[]; allocations: AllocateEnergyAction[] } {
  const deallocations: DeallocateEnergyAction[] = [];
  const allocations: AllocateEnergyAction[] = [];
  let available = me.ship.reactor.availableEnergy;

  for (const sub of me.ship.subsystems) {
    const config = getSubsystemConfig(sub.type);
    const wanted =
      sub.isBroken || config.maxEnergy === 0
        ? 0
        : Math.min(config.maxEnergy, targets.get(sub.id) ?? 0);
    const current = sub.allocatedEnergy;
    if (wanted < current) {
      const amount = current - wanted;
      // Cannot leave a tile partially powered below its minimum.
      const drain = wanted > 0 && wanted < config.minEnergy ? current : amount;
      deallocations.push({
        type: "deallocate_energy",
        playerId: me.id,
        data: { subsystemId: sub.id, amount: drain },
      });
      available += drain;
    }
  }

  for (const sub of me.ship.subsystems) {
    const config = getSubsystemConfig(sub.type);
    if (sub.isBroken || config.maxEnergy === 0) continue;
    const wanted = Math.min(config.maxEnergy, targets.get(sub.id) ?? 0);
    const current = deallocations.some((d) => d.data.subsystemId === sub.id)
      ? sub.allocatedEnergy - deallocations.find((d) => d.data.subsystemId === sub.id)!.data.amount
      : sub.allocatedEnergy;
    if (wanted <= current) continue;
    const amount = wanted - current;
    if (amount > available) continue;
    if (current === 0 && wanted < config.minEnergy) continue;
    allocations.push({
      type: "allocate_energy",
      playerId: me.id,
      data: { subsystemId: sub.id, amount },
    });
    available -= amount;
  }

  return { deallocations, allocations };
}
