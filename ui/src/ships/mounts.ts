/** Shared names and IDs for the editor, miniature, game tiles, and targeting controls. */
import type { Hull } from '@dangerous-inclinations/engine'

export type MountId = 'forward-0' | 'side-0' | 'side-1' | 'side-2' | 'side-3'

export const MOUNTS: {
  id: MountId
  short: string
  group: 'forward' | 'side'
  index: number
}[] = [
  { id: 'forward-0', short: 'F1', group: 'forward', index: 0 },
  { id: 'side-0', short: 'P1', group: 'side', index: 0 },
  { id: 'side-1', short: 'P2', group: 'side', index: 1 },
  { id: 'side-2', short: 'S1', group: 'side', index: 2 },
  { id: 'side-3', short: 'S2', group: 'side', index: 3 },
]

/**
 * A flank's two mounts sit one ahead of the other on the corvette and the
 * mantis, and one above the other on the shrike, so the names follow the hull.
 */
const LAID_OUT_FORE_AND_AFT: Record<MountId, string> = {
  'forward-0': 'Forward',
  'side-0': 'Port fore',
  'side-1': 'Port aft',
  'side-2': 'Starboard fore',
  'side-3': 'Starboard aft',
}

const MOUNT_LABELS: Record<Hull, Record<MountId, string>> = {
  corvette: LAID_OUT_FORE_AND_AFT,
  mantis: LAID_OUT_FORE_AND_AFT,
  shrike: {
    'forward-0': 'Forward',
    'side-0': 'Port upper',
    'side-1': 'Port lower',
    'side-2': 'Starboard upper',
    'side-3': 'Starboard lower',
  },
}

export function mountLabel(id: MountId, hull: Hull): string {
  return MOUNT_LABELS[hull][id]
}
