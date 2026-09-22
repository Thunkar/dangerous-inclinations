/**
 * Energy, which is now only a question about heat.
 *
 * Nothing the bot does needs an allocation: a tile that acts is powered by the
 * action that uses it. What the bot still decides is which standing tiles to
 * hold up between turns (shields, a rack, a sensor) and how wide, which is
 * what `assignDefensiveEnergy` prices and `standingActions` emits.
 *
 * Every cube is a point of heat at the check wherever it came from, so the
 * plan's draws and its standing tiles come out of one budget: `heatRoom` is
 * what is left of the track after the turn's own actions. There is no reactor
 * to run out of, so a bot that ignored the heat would light its whole loadout
 * and cook itself in two turns.
 */
import type { Player, SetStandingPowerAction } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { energyStepOf, getSubsystemConfig, isStandingType } from "../../models/subsystems.ts";

/** Cubes a plan wants on each subsystem id: the turn's draws plus what stands. */
export type EnergyTargets = Map<SubsystemId, number>;

export function totalEnergy(targets: EnergyTargets): number {
  let sum = 0;
  for (const v of targets.values()) sum += v;
  return sum;
}

/** What a plan wants standing, and the heat it has left to buy it with. */
export interface DefensiveWants {
  shields: Subsystem[];
  racks: Subsystem[];
  sensors: Subsystem[];
  /**
   * Cubes this turn's own actions already put on each tile. A tile that is
   * drawing anyway is cheaper to leave up: it holds its cubes once, so only
   * the difference costs anything.
   */
  derived: EnergyTargets;
  /** Somebody can reach us: a wall is worth its heat. */
  wantShields: boolean;
  /**
   * Racks worth holding up: one per four missiles that could arrive, since a
   * rack answers four a turn and the fifth gets through.
   */
  wantRacks: number;
  /** We mean to shoot, so the wider critical range is worth its heat. */
  wantSensor: boolean;
  /** Heat the standing tiles may still add at the check without redlining. */
  heatRoom: number;
  shieldMax?: number;
}

/**
 * Decide what to leave switched on, cheapest and most answerable first.
 *
 * Point defence is counted in racks, not as a yes or no: each one answers four
 * missiles a turn, so a ship expecting eight wants two up and pays for both.
 *
 * Everything here is bought with the same currency: a standing tile's cubes
 * are heat at every check until it comes down, so `heatRoom` is the whole
 * limit and the order is the priority. Point defence first, because a rack
 * that is down when the salvo arrives is a rack that did nothing; then the
 * sensor, which is two heat for a wider critical on every gun aboard; then the
 * wall, which takes whatever is left in whole points.
 */
export function assignDefensiveEnergy(targets: EnergyTargets, wants: DefensiveWants): EnergyTargets {
  let room = wants.heatRoom;
  const take = (sub: Subsystem | undefined, amount: number) => {
    if (!sub || sub.isBroken || targets.has(sub.id)) return;
    // The tile holds its cubes once: a rack that is firing this turn is free
    // to leave up, and a wall going from nothing to four costs all four.
    const extra = Math.max(0, amount - (wants.derived.get(sub.id) ?? 0));
    if (room < extra) return;
    targets.set(sub.id, amount);
    room -= extra;
  };

  for (let i = 0; i < wants.wantRacks; i++) {
    const before = targets.size;
    take(
      wants.racks.find((r) => !r.isBroken && !targets.has(r.id)),
      getSubsystemConfig("ballistic_rack").minEnergy
    );
    // Out of racks, or out of heat: either way the rest of the salvo lands.
    if (targets.size === before) break;
  }
  if (wants.wantSensor) {
    take(
      wants.sensors.find((s) => !s.isBroken && !targets.has(s.id)),
      getSubsystemConfig("sensor_array").minEnergy
    );
  }
  if (wants.wantShields) {
    const config = getSubsystemConfig("shields");
    const shieldMax = wants.shieldMax ?? config.maxEnergy;
    // Shields buy absorption in whole points, so heat goes on in whole steps:
    // an odd cube on a tile stops nothing and the engine refuses it.
    const step = energyStepOf("shields");
    for (const shield of wants.shields) {
      if (shield.isBroken || targets.has(shield.id)) continue;
      const already = wants.derived.get(shield.id) ?? 0;
      const amount = Math.floor(Math.min(shieldMax, room + already) / step) * step;
      if (amount < config.minEnergy) continue;
      targets.set(shield.id, amount);
      room -= Math.max(0, amount - already);
    }
  }
  return targets;
}

/**
 * The switches that move the ship's standing tiles to `targets`. Tiles an
 * action will power are ignored: they are not switched on, they are used.
 *
 * A tile already holding what the plan wants gets no action, so a bot that
 * leaves its wall where it was says nothing on the wire and nothing in the
 * log.
 */
export function standingActions(me: Player, targets: EnergyTargets): SetStandingPowerAction[] {
  const actions: SetStandingPowerAction[] = [];
  for (const sub of me.ship.subsystems) {
    if (!isStandingType(sub.type)) continue;
    const config = getSubsystemConfig(sub.type);
    const wanted = sub.isBroken ? 0 : Math.min(config.maxEnergy, targets.get(sub.id) ?? 0);
    const amount = wanted >= config.minEnergy ? wanted : 0;
    if (amount === sub.allocatedEnergy) continue;
    actions.push({
      type: "set_standing_power",
      playerId: me.id,
      data: { subsystemId: sub.id, amount },
    });
  }
  return actions;
}
