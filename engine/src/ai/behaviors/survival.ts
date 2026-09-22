/**
 * Energy, which is now only a question about heat.
 *
 * Nothing the bot does needs an allocation: a tile that acts is powered by the
 * action that uses it. What the bot still decides is which of the tiles that
 * work on other players' turns to power (shields, a rack, a sensor) and how
 * wide, which is what `assignDefensiveEnergy` prices and `powerActions` emits.
 * The loadout is cleared at the start of every turn, so anything the bot wants
 * up it powers again, every turn.
 *
 * Every cube is a point of heat at the check wherever it came from, so the
 * plan's draws and its powered tiles come out of one budget: `heatRoom` is
 * what is left of the track after the turn's own actions. There is no reactor
 * to run out of, so a bot that ignored the heat would light its whole loadout
 * and cook itself in two turns.
 */
import type { Player, PowerAction } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { energyStepOf, getSubsystemConfig, isPowerableType } from "../../models/subsystems.ts";

/** Cubes a plan wants on each subsystem id: the turn's draws, or what it powers. */
export type EnergyTargets = Map<SubsystemId, number>;

export function totalEnergy(targets: EnergyTargets): number {
  let sum = 0;
  for (const v of targets.values()) sum += v;
  return sum;
}

/** What a plan wants powered, and the heat it has left to buy it with. */
export interface DefensiveWants {
  shields: Subsystem[];
  racks: Subsystem[];
  sensors: Subsystem[];
  /**
   * Cubes this turn's own actions already put on each tile. A rack that fires
   * or a sensor that scans is up anyway: its cubes stay on the tile, so it
   * costs nothing more and needs no power action (it could not take one).
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
  /** Heat the powered tiles may still add at the check without redlining. */
  heatRoom: number;
  shieldMax?: number;
}

/**
 * Decide what to have up until the bot's next turn, cheapest and most
 * answerable first.
 *
 * Point defence is counted in racks, not as a yes or no: each one answers four
 * missiles a turn, so a ship expecting eight wants two up and pays for both.
 *
 * Everything here is bought with the same currency: a powered tile's cubes
 * are heat at this turn's check, so `heatRoom` is the whole limit and the
 * order is the priority. Point defence first, because a rack
 * that is down when the salvo arrives is a rack that did nothing; then the
 * sensor, which is two heat for a wider critical on every gun aboard; then the
 * wall, which takes whatever is left in whole points.
 */
export function assignDefensiveEnergy(targets: EnergyTargets, wants: DefensiveWants): EnergyTargets {
  let room = wants.heatRoom;
  const take = (sub: Subsystem | undefined, amount: number) => {
    if (!sub || sub.isBroken || targets.has(sub.id)) return;
    // The tile holds its cubes once: a rack that is firing this turn is up for
    // free, and a wall going from nothing to four costs all four.
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
 * The `power` actions that put `targets` on the ship's shields, racks and
 * sensors, numbered from `firstSequence` so they run before anything else in
 * the turn: a sensor widens only the shots sequenced after it.
 *
 * The loadout is clear when the turn starts, so what a tile holds now (last
 * turn's cubes) is ignored: every tile the plan wants up is powered, every
 * turn. A tile the turn's own actions use (a rack that fires, a sensor that
 * scans) must not be in `targets`: using it leaves it up, and a tile does one
 * thing a turn, so powering it first would make the shot or the scan illegal.
 */
export function powerActions(me: Player, targets: EnergyTargets, firstSequence = 1): PowerAction[] {
  const actions: PowerAction[] = [];
  for (const sub of me.ship.subsystems) {
    if (!isPowerableType(sub.type) || sub.isBroken) continue;
    const config = getSubsystemConfig(sub.type);
    const step = energyStepOf(sub.type);
    const wanted = Math.min(config.maxEnergy, targets.get(sub.id) ?? 0);
    const amount = Math.floor(wanted / step) * step;
    if (amount < config.minEnergy) continue;
    actions.push({
      type: "power",
      playerId: me.id,
      sequence: firstSequence + actions.length,
      data: { subsystemId: sub.id, amount },
    });
  }
  return actions;
}
