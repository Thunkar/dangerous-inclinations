import { Box, styled, Typography } from '@mui/material'
import type { SubsystemType } from '../types/subsystems'
import { getSubsystemConfig } from '../types/subsystems'
import { CustomIcon } from './CustomIcon'

interface SubsystemButtonProps {
  subsystemType: SubsystemType
  allocatedEnergy: number
  isPowered: boolean
  isOverclocked?: boolean
  usedThisTurn?: boolean
  disabled?: boolean
  onClick?: () => void
  variant?: 'normal' | 'add' | 'remove' | 'vent'
  label?: string
  shouldBlur?: boolean
}

interface AbilityBoxProps {
  disabled?: boolean
  isOverclocked?: boolean
  variant?: 'normal' | 'add' | 'remove' | 'vent'
  shouldBlur?: boolean
}

const AbilityBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'disabled' && prop !== 'isOverclocked' && prop !== 'variant' && prop !== 'shouldBlur',
})<AbilityBoxProps>(({ theme, disabled, isOverclocked, variant, shouldBlur }) => {
  const isAction = variant === 'add' || variant === 'remove' || variant === 'vent'

  let actionColor = theme.palette.secondary.main
  if (variant === 'add') actionColor = theme.palette.secondary.light
  if (variant === 'remove') actionColor = theme.palette.warning.main
  if (variant === 'vent') actionColor = theme.palette.error.main

  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isAction ? '8px' : '5px 8px',
    borderRadius: isAction ? '50%' : '10px',
    minWidth: isAction ? '50px' : '50px',
    maxWidth: isAction ? '50px' : '60px',
    minHeight: isAction ? '50px' : undefined,
    color: disabled ? theme.palette.text.disabled : theme.palette.text.primary,
    backgroundColor: isOverclocked
      ? theme.palette.error.dark
      : disabled
      ? theme.palette.action.disabledBackground
      : isAction
      ? actionColor
      : theme.palette.primary.main,
    lineHeight: '1em',
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: disabled ? 'none' : isAction ? '3px 3px 2px 2px rgba(0,0,0,0.5)' : '2px 2px 1px 1px black',
    transition: 'all 0.2s',
    border: `2px solid ${disabled ? theme.palette.divider : 'black'}`,
    filter: shouldBlur ? 'blur(4px)' : undefined,
    '&:hover': disabled
      ? {}
      : {
          backgroundColor: isAction ? theme.palette.primary.light : 'black',
          transform: 'scale(1.1)',
        },
  }
})

const CostsRow = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  fontSize: '1em',
  fontWeight: 'bold',
})

const TextContainer = styled(Typography)({
  fontSize: '0.6em',
  fontStyle: 'italic',
  textAlign: 'center',
  lineHeight: '1em',
  marginTop: '2px',
})

export function SubsystemButton({
  subsystemType,
  allocatedEnergy,
  isPowered: _isPowered,
  isOverclocked = false,
  usedThisTurn = false,
  disabled = false,
  onClick,
  variant = 'normal',
  label,
  shouldBlur = false,
}: SubsystemButtonProps) {
  const config = getSubsystemConfig(subsystemType)

  const renderContent = () => {
    switch (variant) {
      case 'add':
        return (
          <CostsRow>
            +1
            <CustomIcon icon="energy" size={20} />
          </CostsRow>
        )
      case 'remove':
        return (
          <CostsRow>
            -1
            <CustomIcon icon="energy" size={20} />
          </CostsRow>
        )
      case 'vent':
        return (
          <CostsRow>
            -1
            <CustomIcon icon="heat" size={20} />
          </CostsRow>
        )
      default:
        return (
          <>
            <Box sx={{ mb: 0.25 }}>
              <CustomIcon icon={subsystemType} size={24} />
            </Box>
            <CostsRow>
              {allocatedEnergy}
              <CustomIcon icon="energy" size={12} />
              {isOverclocked && (
                <Box
                  component="span"
                  sx={{
                    ml: 0.5,
                    color: 'error.light',
                    fontWeight: 'bold',
                  }}
                >
                  !
                </Box>
              )}
            </CostsRow>
            <TextContainer>
              {label || config.name}
              {usedThisTurn && ' (used)'}
            </TextContainer>
          </>
        )
    }
  }

  return (
    <AbilityBox disabled={disabled} isOverclocked={isOverclocked} variant={variant} shouldBlur={shouldBlur} onClick={onClick}>
      {renderContent()}
    </AbilityBox>
  )
}
