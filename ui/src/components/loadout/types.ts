import type { SubsystemType } from '@dangerous-inclinations/engine'

/** Where a palette card may be installed. Mirrors the engine's slot types. */
export type SlotType = 'forward' | 'side' | 'either'

/** What travels on the HTML5 drag: the tile and the rail it came from. */
export interface DragItem {
  componentType: SubsystemType
  slotType: SlotType
}

export const DRAG_MIME = 'application/x-di-component'

export function readDragItem(transfer: DataTransfer): DragItem | null {
  const raw = transfer.getData(DRAG_MIME) || transfer.getData('application/json') || transfer.getData('text/plain')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DragItem>
    if (typeof parsed?.componentType !== 'string') return null
    return { componentType: parsed.componentType as SubsystemType, slotType: (parsed.slotType ?? 'either') as SlotType }
  } catch {
    return null
  }
}
