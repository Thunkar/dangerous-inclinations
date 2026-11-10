/**
 * Energy is heat: every cube on the loadout is a point of heat at the check.
 *
 * A subsystem that acts is powered by the action that uses it. What the bot
 * decides is which of the subsystems that work on other players' turns to
 * power (shields, a rack, a sensor) and how wide, which is what
 * `assignDefensiveEnergy` prices and `powerActions` (game/power.ts) emits. The loadout is
 * cleared at the start of every turn, so anything the bot wants up it powers
 * again, every turn.
 *
 * The plan's draws and its powered subsystems come out of one budget:
 * `heatRoom` is what is left of the track after the turn's own actions.
 * Nothing caps what a ship lights at once, so a bot that ignored the heat
 * would light its whole loadout and cook itself in two turns.
 */
import type { Subsystem } from '../../models/subsystems.ts'
import { getSubsystemConfig } from '../../models/subsystems.ts'
import type { EnergyTargets } from '../../game/power.ts'

/** What a plan wants powered, and the heat it has left to buy it with. */
export interface DefensiveWants {
  shields: Subsystem[]
  racks: Subsystem[]
  sensors: Subsystem[]
  /**
   * Cubes this turn's own actions already put on each subsystem. A rack that fires
   * or a sensor that scans is up anyway: its cubes stay on the subsystem, so it
   * costs nothing more and needs no power action (it could not take one).
   */
  derived: EnergyTargets
  /** Somebody can reach us: a wall is worth its heat. */
  wantShields: boolean
  /**
   * Racks worth holding up: one per four missiles that could arrive, since a
   * rack answers four a turn and the fifth gets through.
   */
  wantRacks: number
  /** We mean to shoot, so the wider critical range is worth its heat. */
  wantSensor: boolean
  /** Heat the powered subsystems may still add at the check without redlining. */
  heatRoom: number
}

/**
 * Decide what to have up until the bot's next turn, cheapest and most
 * answerable first.
 *
 * Point defence is counted in racks, not as a yes or no: each one answers four
 * missiles a turn, so a ship expecting eight wants two up and pays for both.
 *
 * Everything here is bought with the same currency: a powered subsystem's cubes
 * are heat at this turn's check, so `heatRoom` is the whole limit and the
 * order is the priority. Point defence first, because a rack
 * that is down when the salvo arrives is a rack that did nothing; then the
 * sensor, which is two heat for a wider critical on every gun aboard; then the
 * wall, which takes whatever is left in whole points.
 */
export function assignDefensiveEnergy(
  targets: EnergyTargets,
  wants: DefensiveWants
): EnergyTargets {
  let room = wants.heatRoom
  const take = (sub: Subsystem | undefined, amount: number) => {
    if (!sub || sub.isBroken || targets.has(sub.id)) return
    // The subsystem holds its cubes once: a rack that is firing this turn is up for
    // free, and a wall going from nothing to two costs both.
    const extra = Math.max(0, amount - (wants.derived.get(sub.id) ?? 0))
    if (room < extra) return
    targets.set(sub.id, amount)
    room -= extra
  }

  for (let i = 0; i < wants.wantRacks; i++) {
    const before = targets.size
    take(
      wants.racks.find(r => !r.isBroken && !targets.has(r.id)),
      getSubsystemConfig('ballistic_rack').minEnergy
    )
    // Out of racks, or out of heat: either way the rest of the salvo lands.
    if (targets.size === before) break
  }
  if (wants.wantSensor) {
    take(
      wants.sensors.find(s => !s.isBroken && !targets.has(s.id)),
      getSubsystemConfig('sensor_array').minEnergy
    )
  }
  if (wants.wantShields) {
    const config = getSubsystemConfig('shields')
    const shieldMax = config.maxEnergy
    for (const shield of wants.shields) {
      if (shield.isBroken || targets.has(shield.id)) continue
      const already = wants.derived.get(shield.id) ?? 0
      const amount = Math.floor(Math.min(shieldMax, room + already))
      if (amount < config.minEnergy) continue
      targets.set(shield.id, amount)
      room -= Math.max(0, amount - already)
    }
  }
  return targets
}
