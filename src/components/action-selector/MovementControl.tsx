import { Box, Typography, styled } from '@mui/material'
import type { ActionType, BurnIntensity } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
import { BURN_COSTS } from '../../constants/rings'
import { CustomIcon } from '../CustomIcon'

interface MovementControlProps {
  actionType: ActionType
  burnIntensity: BurnIntensity
  onActionTypeChange: (type: ActionType) => void
  onBurnIntensityChange: (intensity: BurnIntensity) => void
  enginesSubsystem: Subsystem | undefined
  reactionMass: number
}

interface ActionButtonProps {
  isActive: boolean
  disabled?: boolean
}

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

const ActionButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'disabled',
})<ActionButtonProps>(({ theme, isActive, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 16px',
  borderRadius: '8px',
  backgroundColor: isActive ? theme.palette.secondary.main : theme.palette.primary.main,
  border: `2px solid ${isActive ? theme.palette.secondary.light : 'black'}`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.2s',
  opacity: disabled ? 0.5 : 1,
  flex: 1,
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: isActive ? theme.palette.secondary.light : theme.palette.primary.light,
        transform: 'scale(1.05)',
      },
}))

const IntensityButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'disabled',
})<ActionButtonProps>(({ theme, isActive, disabled }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px',
  borderRadius: '8px',
  backgroundColor: isActive ? theme.palette.secondary.main : theme.palette.primary.main,
  border: `2px solid ${isActive ? theme.palette.secondary.light : 'black'}`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.2s',
  opacity: disabled ? 0.5 : 1,
  minWidth: '80px',
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: isActive ? theme.palette.secondary.light : theme.palette.primary.light,
        transform: 'scale(1.05)',
      },
}))

const ResourceRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.7rem',
})

const StatusBar = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '8px',
  padding: '6px 8px',
  borderRadius: '4px',
  backgroundColor: theme.palette.background.default,
  fontSize: '0.75rem',
}))

export function MovementControl({
  actionType,
  burnIntensity,
  onActionTypeChange,
  onBurnIntensityChange,
  enginesSubsystem,
  reactionMass,
}: MovementControlProps) {
  const burnCost = actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0, rings: 0 }
  const hasEnoughEngines = enginesSubsystem && enginesSubsystem.allocatedEnergy >= burnCost.energy
  const hasEnoughMass = reactionMass >= burnCost.mass

  return (
    <Container>
      <Typography variant="body2" fontWeight="bold" gutterBottom>
        Movement
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <ActionButton isActive={actionType === 'coast'} onClick={() => onActionTypeChange('coast')}>
          <Typography variant="body2" fontWeight="bold">
            Coast
          </Typography>
        </ActionButton>

        <ActionButton isActive={actionType === 'burn'} onClick={() => onActionTypeChange('burn')}>
          <Typography variant="body2" fontWeight="bold">
            Burn
          </Typography>
        </ActionButton>
      </Box>

      {actionType === 'burn' && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Burn Intensity
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <IntensityButton
              isActive={burnIntensity === 'standard'}
              onClick={() => onBurnIntensityChange('standard')}
            >
              <Typography variant="caption" fontWeight="bold">
                Standard
              </Typography>
              <ResourceRow>
                1<CustomIcon icon="energy" size={10} />
                1<CustomIcon icon="heat" size={10} />
              </ResourceRow>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', mt: 0.25 }}>
                ±1 ring
              </Typography>
            </IntensityButton>

            <IntensityButton
              isActive={burnIntensity === 'hard'}
              onClick={() => onBurnIntensityChange('hard')}
            >
              <Typography variant="caption" fontWeight="bold">
                Hard
              </Typography>
              <ResourceRow>
                2<CustomIcon icon="energy" size={10} />
                2<CustomIcon icon="heat" size={10} />
              </ResourceRow>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', mt: 0.25 }}>
                ±2 rings
              </Typography>
            </IntensityButton>

            <IntensityButton
              isActive={burnIntensity === 'extreme'}
              onClick={() => onBurnIntensityChange('extreme')}
            >
              <Typography variant="caption" fontWeight="bold">
                Extreme
              </Typography>
              <ResourceRow>
                3<CustomIcon icon="energy" size={10} />
                3<CustomIcon icon="heat" size={10} />
              </ResourceRow>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', mt: 0.25 }}>
                ±3 rings
              </Typography>
            </IntensityButton>
          </Box>

          <StatusBar>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Engines:
              </Typography>
              <Typography
                variant="caption"
                color={hasEnoughEngines ? 'success.main' : 'error.main'}
                fontWeight="bold"
              >
                {enginesSubsystem?.allocatedEnergy || 0}/{burnCost.energy}
                <CustomIcon icon="energy" size={10} />
              </Typography>
            </Box>

            <Box sx={{ width: '1px', height: '12px', bgcolor: 'divider' }} />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Mass:
              </Typography>
              <Typography
                variant="caption"
                color={hasEnoughMass ? 'success.main' : 'error.main'}
                fontWeight="bold"
              >
                {reactionMass}/{burnCost.mass}
              </Typography>
            </Box>
          </StatusBar>
        </>
      )}
    </Container>
  )
}
