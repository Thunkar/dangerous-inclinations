import { Box, styled } from '@mui/material'
import { Add, Close } from '@mui/icons-material'
import { SUBSYSTEM_CONFIGS } from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import type { SlotType } from './types'
import { getSubsystemIcon } from './subsystemIcons'

interface LoadoutSlotProps {
  slotType: SlotType
  component: SubsystemType | null
  onDrop: (componentType: SubsystemType | null) => void
  onClick: () => void
  isHighlighted?: boolean
  isSelected?: boolean
  acceptingDrag?: boolean
}

function getSubsystemColor(type: SubsystemType): string {
  const config = SUBSYSTEM_CONFIGS[type]
  if (config.weaponStats) return '#f44336'
  if (config.isPassive) return '#4caf50'
  if (type === 'shields') return '#2196f3'
  return '#ff9800'
}

const SlotContainer = styled(Box, {
  shouldForwardProp: prop => !['isHighlighted', 'isSelected', 'acceptingDrag', 'hasComponent'].includes(prop as string),
})<{ isHighlighted?: boolean; isSelected?: boolean; acceptingDrag?: boolean; hasComponent?: boolean }>(
  ({ theme, isHighlighted, isSelected, acceptingDrag, hasComponent }) => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `2px ${hasComponent ? 'solid' : 'dashed'} ${
      isSelected ? theme.palette.primary.main : isHighlighted ? theme.palette.success.main : theme.palette.divider
    }`,
    backgroundColor: acceptingDrag
      ? theme.palette.success.dark + '40'
      : hasComponent
        ? theme.palette.background.paper
        : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
    '&:hover': {
      borderColor: theme.palette.primary.main,
      backgroundColor: hasComponent ? theme.palette.action.hover : theme.palette.action.hover,
    },
  })
)

const ComponentIcon = styled(Box, {
  shouldForwardProp: prop => prop !== 'color',
})<{ color: string }>(({ color }) => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  backgroundColor: color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}))

const ClearButton = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: -4,
  right: -4,
  width: 16,
  height: 16,
  borderRadius: '50%',
  backgroundColor: theme.palette.error.main,
  color: theme.palette.error.contrastText,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 0.2s',
  '&:hover': {
    backgroundColor: theme.palette.error.dark,
  },
}))

const SlotWrapper = styled(Box)({
  position: 'relative',
  '&:hover .clear-button': {
    opacity: 1,
  },
})

export function LoadoutSlot({
  slotType,
  component,
  onDrop,
  onClick,
  isHighlighted = false,
  isSelected = false,
  acceptingDrag = false,
}: LoadoutSlotProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.slotType === slotType) {
        onDrop(data.componentType)
      }
    } catch {
      // Invalid data, ignore
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDrop(null)
  }

  const color = component ? getSubsystemColor(component) : ''
  const icon = component ? getSubsystemIcon(component) : undefined

  return (
    <SlotWrapper>
      <SlotContainer
        onClick={onClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        isHighlighted={isHighlighted}
        isSelected={isSelected}
        acceptingDrag={acceptingDrag}
        hasComponent={!!component}
      >
        {component ? (
          <ComponentIcon color={color}>
            {icon && (
              <img src={icon} alt={component} style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)' }} />
            )}
          </ComponentIcon>
        ) : (
          <Add sx={{ color: 'text.disabled', fontSize: 20 }} />
        )}
      </SlotContainer>
      {component && (
        <ClearButton className="clear-button" onClick={handleClear}>
          <Close sx={{ fontSize: 12 }} />
        </ClearButton>
      )}
    </SlotWrapper>
  )
}
