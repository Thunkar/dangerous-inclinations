import type { SubsystemType } from '@dangerous-inclinations/engine'

export type SlotType = 'forward' | 'side' | 'either'

export interface DragItem {
  type: 'component'
  componentType: SubsystemType
  slotType: SlotType
}

export interface LoadoutSlotProps {
  slotType: SlotType
  component: SubsystemType | null
  onDrop: (componentType: SubsystemType | null) => void
  onClick: () => void
  isHighlighted?: boolean
  isSelected?: boolean
  acceptingDrag?: boolean
}

export interface ComponentCardProps {
  componentType: SubsystemType
  slotType: SlotType
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
  isSelected?: boolean
  isInstalled?: boolean
}

export interface ComponentPaletteProps {
  onComponentSelect: (componentType: SubsystemType, slotType: SlotType) => void
  selectedComponent: SubsystemType | null
  installedComponents: Map<SubsystemType, number>
}
