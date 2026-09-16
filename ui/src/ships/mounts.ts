/** Shared names and IDs for the editor, miniature, game tiles, and targeting controls. */
export type MountId = 'forward-0' | 'side-0' | 'side-1' | 'side-2' | 'side-3'

export const MOUNTS: {
  id: MountId
  label: string
  short: string
  group: 'forward' | 'side'
  index: number
}[] = [
  { id: 'forward-0', label: 'Forward mount', short: 'F1', group: 'forward', index: 0 },
  { id: 'side-0', label: 'Port · forward', short: 'P1', group: 'side', index: 0 },
  { id: 'side-1', label: 'Port · aft', short: 'P2', group: 'side', index: 1 },
  { id: 'side-2', label: 'Starboard · forward', short: 'S1', group: 'side', index: 2 },
  { id: 'side-3', label: 'Starboard · aft', short: 'S2', group: 'side', index: 3 },
]
