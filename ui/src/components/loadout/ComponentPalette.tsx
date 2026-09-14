/**
 * The tiles in your set, grouped by the rail they fit: forward, side, and the
 * one that goes either way. Drag a card onto the mat, or click it and then
 * click a bay.
 */
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  EITHER_SLOT_SUBSYSTEMS,
  FORWARD_SLOT_SUBSYSTEMS,
  SIDE_SLOT_SUBSYSTEMS,
} from '@dangerous-inclinations/engine'
import { SectionLabel } from '../common/Panel'
import { ComponentCard } from './ComponentCard'
import type { SlotType } from './types'

interface ComponentPaletteProps {
  onComponentSelect: (componentType: SubsystemType, slotType: SlotType) => void
  onDragStart: (componentType: SubsystemType) => void
  onDragEnd: () => void
  selectedComponent: SubsystemType | null
  installedForward: ReadonlyArray<SubsystemType | null>
  installedSide: ReadonlyArray<SubsystemType | null>
}

function count(type: SubsystemType, slots: ReadonlyArray<SubsystemType | null>): number {
  return slots.filter((s) => s === type).length
}

export function ComponentPalette({
  onComponentSelect,
  onDragStart,
  onDragEnd,
  selectedComponent,
  installedForward,
  installedSide,
}: ComponentPaletteProps) {
  const sections: Array<{ label: string; slotType: SlotType; types: ReadonlyArray<SubsystemType> }> = [
    { label: 'Forward slot', slotType: 'forward', types: FORWARD_SLOT_SUBSYSTEMS },
    { label: 'Side slots', slotType: 'side', types: SIDE_SLOT_SUBSYSTEMS },
    { label: 'Either slot', slotType: 'either', types: EITHER_SLOT_SUBSYSTEMS },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {sections.map((section) => (
        <Box key={section.slotType}>
          <SectionLabel>{section.label}</SectionLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            {section.types.map((type) => (
              <ComponentCard
                key={type}
                componentType={type}
                slotType={section.slotType}
                onDragStart={() => onDragStart(type)}
                onDragEnd={onDragEnd}
                onClick={() => onComponentSelect(type, section.slotType)}
                isSelected={selectedComponent === type}
                installCount={count(type, installedForward) + count(type, installedSide)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
