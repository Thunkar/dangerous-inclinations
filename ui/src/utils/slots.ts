/**
 * Labels for the fixed systems and the five loadout slots, keyed by the
 * engine's stable subsystem ids ("engines", "forward-0", "side-2", ...). A
 * slot's name depends on the hull of the ship it belongs to, so every caller
 * passes the owner's hull, which is a rival's when the slot is a rival's.
 */
import { MOUNTS, mountLabel } from '../ships/mounts'
import { DEFAULT_SHIP_APPEARANCE, getSubsystemConfig } from '@dangerous-inclinations/engine'
import type {
  Hull,
  ShipAppearance,
  SubsystemId,
  SubsystemType,
} from '@dangerous-inclinations/engine'

const FIXED: Partial<Record<SubsystemId, string>> = {
  engines: 'Engines',
  rotation: 'Maneuvering thrusters',
  scoop: 'Scoop',
}

/**
 * The hull a player flies, which names their slots. A view always carries it;
 * a ship nobody painted, or no ship picked yet, is the reference corvette.
 */
export function hullOf(player: { appearance?: ShipAppearance } | undefined): Hull {
  return player?.appearance?.hull ?? DEFAULT_SHIP_APPEARANCE.hull
}

export function slotLabel(id: SubsystemId, hull: Hull): string {
  const fixed = FIXED[id]
  if (fixed) return fixed
  const mount = MOUNTS.find(m => m.id === id)
  return mount ? mountLabel(mount.id, hull) : id
}

/**
 * A loadout slot named with what sits in it: "Port aft (Laser)". A fixed
 * system is its own name, and a slot whose subsystem you do not know (a
 * rival's face-down one) is the slot alone.
 */
export function slotWithSubsystem(
  id: SubsystemId,
  type: SubsystemType | null | undefined,
  hull: Hull
): string {
  if (FIXED[id] || !type) return slotLabel(id, hull)
  return `${slotLabel(id, hull)} (${getSubsystemConfig(type).name})`
}

export function slotShortLabel(id: SubsystemId): string {
  if (id === 'engines') return 'ENG'
  if (id === 'rotation') return 'THR'
  if (id === 'scoop') return 'SCP'
  return MOUNTS.find(mount => mount.id === id)?.short ?? id
}
