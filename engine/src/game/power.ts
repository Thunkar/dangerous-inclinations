/**
 * Turning a plan's wanted cubes into `power` actions: shared by the bots
 * (ai/planner.ts) and the agent intent builder (agent/intent.ts), which both
 * draft a turn and must power the same way the engine expects.
 */
import type { Player, PowerAction } from '../models/game.ts'
import type { SubsystemId } from '../models/subsystems.ts'
import { getSubsystemConfig, isPowerableType } from '../models/subsystems.ts'

/** Cubes a plan wants on each subsystem id: the turn's draws, or what it powers. */
export type EnergyTargets = Map<SubsystemId, number>

/**
 * The `power` actions that put `targets` on the ship's shields, racks and
 * sensors, numbered from 1 so they run before anything else in the turn: a
 * sensor widens only the shots sequenced after it.
 *
 * The loadout is clear when the turn starts, so what a subsystem holds now (last
 * turn's cubes) is ignored: every subsystem the plan wants up is powered, every
 * turn. A subsystem the turn's own actions use (a rack that fires, a sensor that
 * scans) must not be in `targets`: using it leaves it up, and a subsystem does one
 * thing a turn, so powering it first would make the shot or the scan illegal.
 */
export function powerActions(me: Player, targets: EnergyTargets): PowerAction[] {
  const actions: PowerAction[] = []
  for (const sub of me.ship.subsystems) {
    if (!isPowerableType(sub.type) || sub.isBroken) continue
    const config = getSubsystemConfig(sub.type)
    const amount = Math.floor(Math.min(config.maxEnergy, targets.get(sub.id) ?? 0))
    if (amount < config.minEnergy) continue
    actions.push({
      type: 'power',
      playerId: me.id,
      sequence: 1 + actions.length,
      data: { subsystemId: sub.id, amount },
    })
  }
  return actions
}
