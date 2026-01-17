import { Box, Typography, Paper, styled } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { ComponentCard } from './ComponentCard'
import type { SlotType } from './types'

interface ComponentPaletteProps {
  onComponentSelect: (componentType: SubsystemType, slotType: SlotType) => void
  onDragStart: (componentType: SubsystemType) => void
  onDragEnd: () => void
  selectedComponent: SubsystemType | null
  installedForward: (SubsystemType | null)[]
  installedSide: (SubsystemType | null)[]
}

// Forward-only subsystems
const FORWARD_SUBSYSTEMS: SubsystemType[] = ['scoop', 'railgun', 'sensor_array']
// Side-only subsystems
const SIDE_SUBSYSTEMS: SubsystemType[] = ['laser', 'shields', 'radiator', 'fuel_tank']
// Either slot subsystems (can go in forward OR side)
const EITHER_SUBSYSTEMS: SubsystemType[] = ['missiles']

const PaletteSection = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1.5),
  backgroundColor: theme.palette.background.paper,
}))

const ComponentGrid = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(1),
  justifyContent: 'center',
}))

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: theme.spacing(1),
  color: theme.palette.text.secondary,
  textTransform: 'uppercase',
  letterSpacing: 1,
}))

function countInstalled(component: SubsystemType, slots: (SubsystemType | null)[]): number {
  return slots.filter(s => s === component).length
}

export function ComponentPalette({
  onComponentSelect,
  onDragStart,
  onDragEnd,
  selectedComponent,
  installedForward,
  installedSide,
}: ComponentPaletteProps) {
  // Count installed "either" components across both slot types
  const countInstalledEither = (component: SubsystemType) =>
    countInstalled(component, installedForward) + countInstalled(component, installedSide)

  return (
    <Box>
      <PaletteSection elevation={0}>
        <SectionTitle>Forward Slots</SectionTitle>
        <ComponentGrid>
          {FORWARD_SUBSYSTEMS.map(type => (
            <ComponentCard
              key={type}
              componentType={type}
              slotType="forward"
              onDragStart={() => onDragStart(type)}
              onDragEnd={onDragEnd}
              onClick={() => onComponentSelect(type, 'forward')}
              isSelected={selectedComponent === type}
              installCount={countInstalled(type, installedForward)}
            />
          ))}
        </ComponentGrid>
      </PaletteSection>

      <PaletteSection elevation={0}>
        <SectionTitle>Side Slots</SectionTitle>
        <ComponentGrid>
          {SIDE_SUBSYSTEMS.map(type => (
            <ComponentCard
              key={type}
              componentType={type}
              slotType="side"
              onDragStart={() => onDragStart(type)}
              onDragEnd={onDragEnd}
              onClick={() => onComponentSelect(type, 'side')}
              isSelected={selectedComponent === type}
              installCount={countInstalled(type, installedSide)}
            />
          ))}
        </ComponentGrid>
      </PaletteSection>

      <PaletteSection elevation={0}>
        <SectionTitle>Universal (Any Slot)</SectionTitle>
        <ComponentGrid>
          {EITHER_SUBSYSTEMS.map(type => (
            <ComponentCard
              key={type}
              componentType={type}
              slotType="either"
              onDragStart={() => onDragStart(type)}
              onDragEnd={onDragEnd}
              onClick={() => onComponentSelect(type, 'either')}
              isSelected={selectedComponent === type}
              installCount={countInstalledEither(type)}
            />
          ))}
        </ComponentGrid>
      </PaletteSection>
    </Box>
  )
}
