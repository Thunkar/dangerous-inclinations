import { Box, Typography, styled } from '@mui/material'
import { SUBSYSTEM_CONFIGS } from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import type { SlotType } from './types'
import { getSubsystemIcon } from './subsystemIcons'

interface ComponentCardProps {
  componentType: SubsystemType
  slotType: SlotType
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
  isSelected?: boolean
  installCount?: number
}

function getSubsystemColor(type: SubsystemType): string {
  const config = SUBSYSTEM_CONFIGS[type]
  if (config.weaponStats) return '#f44336'
  if (config.isPassive) return '#4caf50'
  if (type === 'shields') return '#2196f3'
  return '#ff9800'
}

const Card = styled(Box, {
  shouldForwardProp: prop => !['isSelected', 'color'].includes(prop as string),
})<{ isSelected?: boolean; color: string }>(({ theme, isSelected, color }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(1),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${isSelected ? color : theme.palette.divider}`,
  cursor: 'grab',
  transition: 'all 0.2s',
  minWidth: 70,
  '&:hover': {
    borderColor: color,
    transform: 'scale(1.05)',
  },
  '&:active': {
    cursor: 'grabbing',
  },
}))

const IconCircle = styled(Box, {
  shouldForwardProp: prop => prop !== 'color',
})<{ color: string }>(({ color }) => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  backgroundColor: color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 4,
}))

const InstallBadge = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: -6,
  right: -6,
  width: 18,
  height: 18,
  borderRadius: '50%',
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontSize: '0.7rem',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}))

export function ComponentCard({
  componentType,
  slotType,
  onDragStart,
  onDragEnd,
  onClick,
  isSelected = false,
  installCount = 0,
}: ComponentCardProps) {
  const config = SUBSYSTEM_CONFIGS[componentType]
  const color = getSubsystemColor(componentType)
  const icon = getSubsystemIcon(componentType)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ componentType, slotType }))
    e.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Card
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        isSelected={isSelected}
        color={color}
      >
        <IconCircle color={color}>
          {icon ? (
            <img src={icon} alt={config.name} style={{ width: 24, height: 24, filter: 'brightness(0) invert(1)' }} />
          ) : (
            <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.65rem' }}>
              {componentType.slice(0, 3).toUpperCase()}
            </Typography>
          )}
        </IconCircle>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', textAlign: 'center' }}>
          {config.name}
        </Typography>
      </Card>
      {installCount > 0 && <InstallBadge>{installCount}</InstallBadge>}
    </Box>
  )
}
