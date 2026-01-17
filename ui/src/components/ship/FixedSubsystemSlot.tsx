import { Box, styled } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'

interface FixedSubsystemSlotProps {
  subsystemType: SubsystemType
  label: string
}

const SUBSYSTEM_ICONS: Partial<Record<SubsystemType, string>> = {
  engines: '/assets/icons/thrusters.png',
  rotation: '/assets/icons/maneuvering_thrusters.png',
}

const SlotContainer = styled(Box)(({ theme }) => ({
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: `2px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.action.disabledBackground,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.7,
}))

const IconWrapper = styled(Box)({
  width: 36,
  height: 36,
  borderRadius: '50%',
  backgroundColor: '#ff9800',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export function FixedSubsystemSlot({ subsystemType, label }: FixedSubsystemSlotProps) {
  const icon = SUBSYSTEM_ICONS[subsystemType]

  return (
    <SlotContainer title={`${label} (fixed)`}>
      <IconWrapper>
        {icon && (
          <img
            src={icon}
            alt={label}
            style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)' }}
          />
        )}
      </IconWrapper>
    </SlotContainer>
  )
}
