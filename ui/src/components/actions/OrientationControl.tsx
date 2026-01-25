import { Box, Typography, styled } from '@mui/material'
import type { Facing } from '@dangerous-inclinations/engine'
import type { Subsystem } from '@dangerous-inclinations/engine'
import { CustomIcon } from '../CustomIcon'

interface OrientationControlProps {
  currentFacing: Facing
  targetFacing: Facing
  onFacingChange: (facing: Facing) => void
  rotationSubsystem: Subsystem | undefined
}

interface FacingButtonProps {
  isActive: boolean
  isCurrent: boolean
  disabled: boolean
}

const FacingButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'isCurrent' && prop !== 'disabled',
})<FacingButtonProps>(({ theme, isActive, isCurrent, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '6px',
  flex: 1,
  backgroundColor: isActive
    ? theme.palette.secondary.main
    : isCurrent
      ? theme.palette.primary.light
      : theme.palette.primary.main,
  border: `2px solid ${
    isActive ? theme.palette.secondary.light : isCurrent ? theme.palette.secondary.main : 'black'
  }`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.15s',
  opacity: disabled ? 0.5 : 1,
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: theme.palette.secondary.main,
      },
}))

export function OrientationControl({
  currentFacing,
  targetFacing,
  onFacingChange,
  rotationSubsystem,
}: OrientationControlProps) {
  const needsRotation = targetFacing !== currentFacing
  const canRotate = rotationSubsystem?.isPowered && !rotationSubsystem.usedThisTurn
  const isDisabled = !canRotate && needsRotation

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <FacingButton
          isActive={targetFacing === 'prograde' && needsRotation}
          isCurrent={currentFacing === 'prograde'}
          disabled={isDisabled && targetFacing === 'prograde'}
          onClick={() => !isDisabled && onFacingChange('prograde')}
        >
          <CustomIcon icon="energy" size={14} />
          <Typography variant="caption" fontWeight="bold">
            Prograde
          </Typography>
          {currentFacing === 'prograde' && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', opacity: 0.7 }}>
              (now)
            </Typography>
          )}
        </FacingButton>

        <FacingButton
          isActive={targetFacing === 'retrograde' && needsRotation}
          isCurrent={currentFacing === 'retrograde'}
          disabled={isDisabled && targetFacing === 'retrograde'}
          onClick={() => !isDisabled && onFacingChange('retrograde')}
        >
          <CustomIcon icon="energy" size={14} />
          <Typography variant="caption" fontWeight="bold">
            Retrograde
          </Typography>
          {currentFacing === 'retrograde' && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', opacity: 0.7 }}>
              (now)
            </Typography>
          )}
        </FacingButton>
      </Box>

      {needsRotation && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', color: canRotate ? 'warning.main' : 'error.main' }}
        >
          {canRotate ? 'Will rotate (generates heat)' : 'Rotation unpowered'}
        </Typography>
      )}
    </Box>
  )
}
