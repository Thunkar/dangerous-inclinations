/**
 * Where a weapon reaches from where it is fired: the engine's answer, sector
 * by sector. The range a player is shown while building a turn and the box a
 * disruptor's pulse floods are both this one question, asked once, so the
 * boards cannot shade a sector the engine would not engage.
 *
 * `canEngage`, not the bare range rule: a missile may legally be launched at
 * anyone in the well, so the rule alone would shade every sector of it and
 * say nothing. What the player needs to see is where a missile would
 * actually run a coasting ship down before it expires.
 */
import type { Facing, Position, Subsystem } from '@dangerous-inclinations/engine'
import {
  SECTORS_PER_RING,
  canEngage,
  getGravityWell,
  getSubsystemConfig,
} from '@dangerous-inclinations/engine'

export function weaponReach(weapon: Subsystem, from: Position, facing: Facing): Position[] {
  if (!getSubsystemConfig(weapon.type).weaponStats) return []
  const attacker = { wellId: from.wellId, ring: from.ring, sector: from.sector, facing }
  const cells: Position[] = []
  for (const ring of getGravityWell(from.wellId)?.rings ?? []) {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      const cell: Position = { wellId: from.wellId, ring: ring.ring, sector }
      if (canEngage(weapon, attacker, cell)) cells.push(cell)
    }
  }
  return cells
}
