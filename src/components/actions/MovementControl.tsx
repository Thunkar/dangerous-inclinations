import { Box, Typography, styled, Slider } from '@mui/material'
import type { ActionType, BurnIntensity } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
import { BURN_COSTS, WELL_TRANSFER_COSTS } from '../../constants/rings'
import { CustomIcon } from '../CustomIcon'

const BURN_INTENSITY_OPTIONS: BurnIntensity[] = ['soft', 'medium', 'hard']

const BURN_DESCRIPTIONS = {
  soft: 'Soft: Transfer ±1 ring',
  medium: 'Medium: Transfer ±2 rings',
  hard: 'Hard: Transfer ±3 rings',
}

interface MovementControlProps {
  actionType: ActionType
  burnIntensity: BurnIntensity
  sectorAdjustment: number
  onActionTypeChange: (type: ActionType) => void
  onBurnIntensityChange: (intensity: BurnIntensity) => void
  onSectorAdjustmentChange: (adjustment: number) => void
  enginesSubsystem: Subsystem | undefined
  reactionMass: number
  canTransfer: boolean // Whether ship is at a valid transfer sector
  transferDestination?: string // Name of destination well if transfer available
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

const AdjustmentButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive',
})<{ isActive: boolean }>(({ theme, isActive }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 12px',
  borderRadius: '6px',
  backgroundColor: isActive ? theme.palette.secondary.main : theme.palette.primary.dark,
  border: `2px solid ${isActive ? theme.palette.secondary.light : theme.palette.primary.main}`,
  cursor: 'pointer',
  transition: 'all 0.2s',
  flex: 1,
  '&:hover': {
    backgroundColor: isActive ? theme.palette.secondary.light : theme.palette.primary.main,
    transform: 'scale(1.05)',
  },
}))

export function MovementControl({
  actionType,
  burnIntensity,
  sectorAdjustment,
  onActionTypeChange,
  onBurnIntensityChange,
  onSectorAdjustmentChange,
  enginesSubsystem,
  reactionMass,
  canTransfer,
  transferDestination,
}: MovementControlProps) {
  const burnCost = actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0, rings: 0 }
  const transferCost = actionType === 'well_transfer' ? WELL_TRANSFER_COSTS : { energy: 0, mass: 0 }
  const hasEnoughEngines = enginesSubsystem && enginesSubsystem.allocatedEnergy >= (actionType === 'burn' ? burnCost.energy : transferCost.energy)
  const hasEnoughMass = reactionMass >= (actionType === 'burn' ? burnCost.mass : transferCost.mass)

  // Convert burnIntensity to slider value (0-2)
  const sliderValue = BURN_INTENSITY_OPTIONS.indexOf(burnIntensity)

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const value = typeof newValue === 'number' ? newValue : newValue[0]
    onBurnIntensityChange(BURN_INTENSITY_OPTIONS[value])
  }

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

        <ActionButton
          isActive={actionType === 'well_transfer'}
          disabled={!canTransfer}
          onClick={() => canTransfer && onActionTypeChange('well_transfer')}
        >
          <Typography variant="body2" fontWeight="bold">
            Transfer
          </Typography>
        </ActionButton>
      </Box>

      {actionType === 'burn' && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Burn Intensity
          </Typography>

          <Box sx={{ px: 1, mb: 1 }}>
            <Slider
              value={sliderValue}
              onChange={handleSliderChange}
              min={0}
              max={2}
              step={1}
              marks={[
                { value: 0, label: '1' },
                { value: 1, label: '2' },
                { value: 2, label: '3' },
              ]}
              sx={{
                '& .MuiSlider-markLabel': {
                  fontSize: '0.7rem',
                },
              }}
            />
          </Box>

          {/* Description and costs */}
          <Box sx={{ mb: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="caption" fontWeight="bold" display="block">
              {BURN_DESCRIPTIONS[burnIntensity]}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Cost:
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {burnCost.energy}
                <CustomIcon icon="energy" size={10} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {burnCost.mass}
                <CustomIcon icon="heat" size={10} />
              </Box>
            </Box>
          </Box>

          {/* Sector Adjustment */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Sector Adjustment
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <AdjustmentButton
              isActive={sectorAdjustment === 0}
              onClick={() => onSectorAdjustmentChange(0)}
            >
              <Typography variant="caption" fontWeight="bold">
                0
              </Typography>
            </AdjustmentButton>
            <AdjustmentButton
              isActive={sectorAdjustment === 1}
              onClick={() => onSectorAdjustmentChange(1)}
            >
              <Typography variant="caption" fontWeight="bold">
                +1
              </Typography>
            </AdjustmentButton>
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
                {burnCost.mass}/{reactionMass}
              </Typography>
            </Box>
          </StatusBar>
        </>
      )}

      {actionType === 'well_transfer' && (
        <>
          {/* Transfer destination info */}
          <Box sx={{ mb: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="caption" fontWeight="bold" display="block">
              Transfer to: {transferDestination || 'Unknown'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Cost:
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {transferCost.energy}
                <CustomIcon icon="energy" size={10} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {transferCost.mass}
                <CustomIcon icon="heat" size={10} />
              </Box>
            </Box>
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
                {enginesSubsystem?.allocatedEnergy || 0}/{transferCost.energy}
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
                {transferCost.mass}/{reactionMass}
              </Typography>
            </Box>
          </StatusBar>
        </>
      )}
    </Container>
  )
}
