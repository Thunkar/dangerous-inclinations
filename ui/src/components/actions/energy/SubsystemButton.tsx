import { Box, styled, Typography } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { CustomIcon } from '../../CustomIcon'

interface SubsystemButtonProps {
  subsystemType: SubsystemType
  allocatedEnergy: number
  isPowered: boolean
  isOverclocked?: boolean
  usedThisTurn?: boolean
  isBroken?: boolean
  disabled?: boolean
  onClick?: () => void
  variant?: 'normal' | 'add' | 'remove' | 'vent'
  label?: string
  shouldBlur?: boolean
}

interface AbilityBoxProps {
  disabled?: boolean
  isOverclocked?: boolean
  isBroken?: boolean
  variant?: 'normal' | 'add' | 'remove' | 'vent'
  shouldBlur?: boolean
}

const AbilityBox = styled(Box, {
  shouldForwardProp: prop =>
    prop !== 'disabled' &&
    prop !== 'isOverclocked' &&
    prop !== 'isBroken' &&
    prop !== 'variant' &&
    prop !== 'shouldBlur',
})<AbilityBoxProps>(({ theme, disabled, isOverclocked, isBroken, variant, shouldBlur }) => {
  const isAction = variant === 'add' || variant === 'remove' || variant === 'vent'

  let actionColor = theme.palette.secondary.main
  if (variant === 'add') actionColor = theme.palette.secondary.light
  if (variant === 'remove') actionColor = theme.palette.warning.main
  if (variant === 'vent') actionColor = theme.palette.error.main

  // For action buttons, use a darker background when disabled to maintain readability
  const getBackgroundColor = () => {
    if (isBroken) return theme.palette.grey[700] // Dark gray for broken
    if (isOverclocked) return theme.palette.error.dark
    if (disabled) {
      if (isAction) {
        // For action buttons when disabled, use darker version of their color
        if (variant === 'add') return theme.palette.secondary.dark
        if (variant === 'remove') return theme.palette.warning.dark
        if (variant === 'vent') return theme.palette.error.dark
      }
      return theme.palette.primary.dark
    }
    if (isAction) return actionColor
    return theme.palette.primary.main
  }

  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isAction ? '6px' : '4px 6px',
    borderRadius: isAction ? '50%' : '8px',
    minWidth: isAction ? '40px' : '40px',
    maxWidth: isAction ? '40px' : '50px',
    minHeight: isAction ? '40px' : undefined,
    color: disabled ? theme.palette.text.secondary : theme.palette.text.primary,
    backgroundColor: getBackgroundColor(),
    lineHeight: '1em',
    cursor: disabled ? 'default' : 'pointer',
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
  gap: '2px',
  fontSize: '0.85em',
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
  isBroken = false,
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
            +
            <CustomIcon icon="energy" size={14} />
          </CostsRow>
        )
      case 'remove':
        return (
          <CostsRow>
            -
            <CustomIcon icon="energy" size={14} />
          </CostsRow>
        )
      default:
        return (
          <>
            <Box sx={{ mb: 0.25, position: 'relative' }}>
              <CustomIcon icon={subsystemType} size={14} />
              {isBroken && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -2,
                    right: -6,
                    color: 'error.main',
                    fontSize: '1em',
                    fontWeight: 'bold',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </Box>
              )}
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
            <TextContainer sx={{ color: isBroken ? 'error.main' : 'inherit' }}>
              {isBroken ? 'BROKEN' : label || config.name}
              {usedThisTurn && !isBroken && ' (used)'}
            </TextContainer>
          </>
        )
    }
  }

  return (
    <AbilityBox
      disabled={disabled || isBroken}
      isOverclocked={isOverclocked}
      isBroken={isBroken}
      variant={variant}
      shouldBlur={shouldBlur}
      onClick={isBroken ? undefined : onClick}
    >
      {renderContent()}
    </AbilityBox>
  )
}
