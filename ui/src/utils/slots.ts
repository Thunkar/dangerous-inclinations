/**
 * Labels for the fixed systems and the five loadout slots, keyed by the
 * engine's stable subsystem ids ("engines", "forward-0", "side-2", ...).
 */
import type { SubsystemId } from '@dangerous-inclinations/engine'

export function slotLabel(id: SubsystemId): string {
  if (id === 'engines') return 'Engines'
  if (id === 'rotation') return 'Thrusters'
  if (id === 'scoop') return 'Scoop'
  const [group, index] = id.split('-')
  if (group === 'forward') return 'Forward'
  if (group === 'side') return `Side ${Number(index) + 1}`
  return id
}

export function slotShortLabel(id: SubsystemId): string {
  if (id === 'engines') return 'ENG'
  if (id === 'rotation') return 'THR'
  if (id === 'scoop') return 'SCP'
  const [group, index] = id.split('-')
  if (group === 'forward') return 'FWD'
  if (group === 'side') return `S${Number(index) + 1}`
  return id
}

