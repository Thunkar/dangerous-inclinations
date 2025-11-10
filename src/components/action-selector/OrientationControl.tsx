import { Box, Typography, styled } from '@mui/material'
import type { Facing } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
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

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

const FacingButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'isCurrent' && prop !== 'disabled',
})<FacingButtonProps>(({ theme, isActive, isCurrent, disabled }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px',
  borderRadius: '8px',
  minWidth: '100px',
  backgroundColor: isActive
    ? theme.palette.secondary.main
    : isCurrent
      ? theme.palette.primary.light
      : theme.palette.primary.main,
  border: `2px solid ${
    isActive ? theme.palette.secondary.light : isCurrent ? theme.palette.secondary.main : 'black'
  }`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.2s',
  opacity: disabled ? 0.5 : 1,
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: theme.palette.secondary.main,
        transform: 'scale(1.05)',
      },
}))

const StatusIndicator = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.75rem',
  marginTop: '8px',
  padding: '4px 8px',
  borderRadius: '4px',
  backgroundColor: theme.palette.background.default,
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
    <Container>
      <Typography variant="body2" fontWeight="bold" gutterBottom>
        Ship Orientation
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <FacingButton
          isActive={targetFacing === 'prograde' && needsRotation}
          isCurrent={currentFacing === 'prograde'}
          disabled={isDisabled && targetFacing === 'prograde'}
          onClick={() => !isDisabled && onFacingChange('prograde')}
        >
          <CustomIcon icon="energy" size={16} />
          <Typography variant="caption" fontWeight="bold" sx={{ mt: 0.5 }}>
            Prograde
          </Typography>
          {currentFacing === 'prograde' && (
            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontStyle: 'italic' }}>
              (current)
            </Typography>
          )}
        </FacingButton>

        <FacingButton
          isActive={targetFacing === 'retrograde' && needsRotation}
          isCurrent={currentFacing === 'retrograde'}
          disabled={isDisabled && targetFacing === 'retrograde'}
          onClick={() => !isDisabled && onFacingChange('retrograde')}
        >
          <CustomIcon icon="energy" size={16} />
          <Typography variant="caption" fontWeight="bold" sx={{ mt: 0.5 }}>
            Retrograde
          </Typography>
          {currentFacing === 'retrograde' && (
            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontStyle: 'italic' }}>
              (current)
            </Typography>
          )}
        </FacingButton>
      </Box>

      <StatusIndicator>
        <Typography variant="caption" color="text.secondary">
          Maneuvering:
        </Typography>
        <Typography
          variant="caption"
          color={canRotate ? 'success.main' : 'error.main'}
          fontWeight="bold"
        >
          {canRotate ? '✓ Ready' : '✗ ' + (rotationSubsystem?.usedThisTurn ? 'Used' : 'Unpowered')}
        </Typography>
        {needsRotation && canRotate && (
          <Typography variant="caption" color="warning.main" sx={{ ml: 1 }}>
            (1E to rotate)
          </Typography>
        )}
      </StatusIndicator>
    </Container>
  )
}
