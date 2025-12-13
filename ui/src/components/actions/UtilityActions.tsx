import { Box, Typography, styled } from '@mui/material'
import type { ActionType } from '@dangerous-inclinations/engine'
import type { Subsystem } from '@dangerous-inclinations/engine'
import { CustomIcon } from '../CustomIcon'

interface UtilityActionsProps {
  actionType: ActionType
  activateScoop: boolean
  onScoopToggle: (activate: boolean) => void
  scoopSubsystem: Subsystem | undefined
}

interface ScoopButtonProps {
  isActive: boolean
  disabled: boolean
}

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

const ScoopButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'disabled',
})<ScoopButtonProps>(({ theme, isActive, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: isActive ? theme.palette.secondary.main : theme.palette.primary.main,
  border: `2px solid ${isActive ? theme.palette.secondary.light : 'black'}`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.2s',
  opacity: disabled ? 0.5 : 1,
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: isActive ? theme.palette.secondary.light : theme.palette.primary.light,
        transform: 'scale(1.02)',
      },
}))

const StatusText = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.secondary,
  marginTop: '6px',
}))

export function UtilityActions({
  actionType,
  activateScoop,
  onScoopToggle,
  scoopSubsystem,
}: UtilityActionsProps) {
  const canActivateScoop =
    actionType === 'coast' && scoopSubsystem?.isPowered && !scoopSubsystem.usedThisTurn
  const isDisabled = !canActivateScoop

  return (
    <Container>
      <Typography variant="body2" fontWeight="bold" gutterBottom>
        Utility Systems
      </Typography>

      <ScoopButton
        isActive={activateScoop}
        disabled={isDisabled}
        onClick={() => !isDisabled && onScoopToggle(!activateScoop)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CustomIcon icon="scoop" size={16} />
          <Typography variant="body2" fontWeight="bold">
            Fuel Scoop
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activateScoop && (
            <Typography variant="caption" color="success.main" fontWeight="bold">
              ACTIVE
            </Typography>
          )}
          <Typography
            variant="caption"
            color={canActivateScoop ? 'success.main' : 'error.main'}
            fontWeight="bold"
          >
            {scoopSubsystem?.isPowered
              ? scoopSubsystem.usedThisTurn
                ? '✗ Used'
                : '✓ Ready'
              : '✗ Offline'}
          </Typography>
        </Box>
      </ScoopButton>

      <StatusText>
        {actionType === 'burn'
          ? 'Fuel scoop requires coasting'
          : !scoopSubsystem?.isPowered
            ? 'Fuel scoop is not powered'
            : scoopSubsystem.usedThisTurn
              ? 'Fuel scoop already used this turn'
              : 'Collect reaction mass while coasting'}
      </StatusText>
    </Container>
  )
}
