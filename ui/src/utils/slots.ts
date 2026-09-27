/**
 * Labels for the fixed systems and the five loadout slots, keyed by the
 * engine's stable subsystem ids ("engines", "forward-0", "side-2", ...).
 */
import { MOUNTS } from '../ships/mounts'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import type { SubsystemId, SubsystemType } from '@dangerous-inclinations/engine'

const FIXED: Partial<Record<SubsystemId, string>> = {
  engines: 'Engines',
  rotation: 'Maneuvering thrusters',
  scoop: 'Scoop',
}

export function slotLabel(id: SubsystemId): string {
  return FIXED[id] ?? MOUNTS.find(mount => mount.id === id)?.label ?? id
}

/**
 * A loadout slot named with what sits in it: "Port aft (Laser)". A fixed
 * system is its own name, and a slot whose subsystem you do not know (a
 * rival's face-down one) is the slot alone.
 */
export function slotWithSubsystem(id: SubsystemId, type: SubsystemType | null | undefined): string {
  if (FIXED[id] || !type) return slotLabel(id)
  return `${slotLabel(id)} (${getSubsystemConfig(type).name})`
}

export function slotShortLabel(id: SubsystemId): string {
  if (id === 'engines') return 'ENG'
  if (id === 'rotation') return 'THR'
  if (id === 'scoop') return 'SCP'
  return MOUNTS.find(mount => mount.id === id)?.short ?? id
}
