/**
 * Labels for the fixed systems and the five loadout slots, keyed by the
 * engine's stable subsystem ids ("engines", "forward-0", "side-2", ...).
 */
import { MOUNTS } from '../ships/mounts'
import type { SubsystemId } from '@dangerous-inclinations/engine'

export function slotLabel(id: SubsystemId): string {
  if (id === 'engines') return 'Engines'
  if (id === 'rotation') return 'Thrusters'
  if (id === 'scoop') return 'Scoop'
  return MOUNTS.find(mount => mount.id === id)?.label ?? id
}

export function slotShortLabel(id: SubsystemId): string {
  if (id === 'engines') return 'ENG'
  if (id === 'rotation') return 'THR'
  if (id === 'scoop') return 'SCP'
  return MOUNTS.find(mount => mount.id === id)?.short ?? id
}
