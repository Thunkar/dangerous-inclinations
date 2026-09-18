/**
 * Energy. Allocation persists across turns and deallocation is free, so
 * each turn the bot decides the exact energy every subsystem should hold
 * and emits the deallocations and allocations that get there. Subsystems
 * are addressed by id, so two tiles of the same type are powered
 * independently.
 *
 * Heat is the real constraint: a subsystem adds its allocated energy as heat
 * when it is used, powered shields add their cubes every check, and what the
 * ship does not dissipate carries to the next turn. Callers budget heat before
 * asking for energy, and the budget they pass is room to the top of the track,
 * not room to the dissipation.
 */
import type { AllocateEnergyAction, DeallocateEnergyAction, Player } from "../../models/game.ts";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { energyStepOf, getSubsystemConfig } from "../../models/subsystems.ts";

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
 *
 * Spare cubes on a shield are no longer spare: powered shields add their cubes
 * to the owner's heat at every check, so `heatRoom` is what they are really
 * bought with and it is usually the tighter of the two limits. A bot that
 * ignored it would leave four cubes on through a coasting turn and cook itself
 * over the next three.
 */
export function assignDefensiveEnergy(
  targets: EnergyTargets,
  shields: Subsystem[],
  racks: Subsystem[],
  wantShields: boolean,
  wantRack: boolean,
  shieldMax: number = getSubsystemConfig("shields").maxEnergy,
  capacity: number = REACTOR_CAPACITY,
  /** Heat shields may still add at the check without redlining the track. */
  heatRoom: number = Number.POSITIVE_INFINITY
): EnergyTargets {
  let spare = capacity - totalEnergy(targets);
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
    // Shields buy absorption in whole points, so spare cubes go on in whole
    // steps: an odd cube on a tile stops nothing and the engine refuses it.
    const step = energyStepOf("shields");
    let room = heatRoom;
    for (const shield of shields) {
      if (shield.isBroken || spare < config.minEnergy || room < config.minEnergy) continue;
      const amount = Math.floor(Math.min(shieldMax, spare, room) / step) * step;
      if (amount < config.minEnergy) continue;
      targets.set(shield.id, amount);
      spare -= amount;
      room -= amount;
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
