import { Box, Typography, styled, Slider } from '@mui/material'
import type { ActionType, BurnIntensity } from '@dangerous-inclinations/engine'
import type { Subsystem } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  getAdjustmentRange,
  calculateBurnMassCost,
} from '@dangerous-inclinations/engine'
import { CustomIcon } from '../CustomIcon'

const BURN_INTENSITY_OPTIONS: BurnIntensity[] = ['soft', 'medium', 'hard']

interface MovementControlProps {
  actionType: ActionType
  burnIntensity: BurnIntensity
  sectorAdjustment: number
  onActionTypeChange: (type: ActionType) => void
  onBurnIntensityChange: (intensity: BurnIntensity) => void
  onSectorAdjustmentChange: (adjustment: number) => void
  enginesSubsystem: Subsystem | undefined
  reactionMass: number
  canTransfer: boolean
  transferDestination?: string
  currentVelocity: number
}

interface ActionButtonProps {
  isActive: boolean
  disabled?: boolean
}

const ActionButton = styled(Box, {
  shouldForwardProp: prop => prop !== 'isActive' && prop !== 'disabled',
})<ActionButtonProps>(({ theme, isActive, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 12px',
  borderRadius: '6px',
  backgroundColor: isActive ? theme.palette.secondary.main : theme.palette.primary.main,
  border: `2px solid ${isActive ? theme.palette.secondary.light : 'black'}`,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'all 0.15s',
  opacity: disabled ? 0.5 : 1,
  flex: 1,
  '&:hover': disabled
    ? {}
    : {
        backgroundColor: isActive ? theme.palette.secondary.light : theme.palette.primary.light,
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
  currentVelocity,
}: MovementControlProps) {
  const burnCost =
    actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0, rings: 0 }
  const totalBurnMass =
    actionType === 'burn' ? calculateBurnMassCost(burnCost.mass, sectorAdjustment) : 0
  const adjustmentRange = getAdjustmentRange(currentVelocity)
  const transferCost = actionType === 'well_transfer' ? WELL_TRANSFER_COSTS : { energy: 0, mass: 0 }
  const hasEnoughEngines =
    enginesSubsystem &&
    enginesSubsystem.allocatedEnergy >=
      (actionType === 'burn' ? burnCost.energy : transferCost.energy)
  const hasEnoughMass = reactionMass >= (actionType === 'burn' ? totalBurnMass : transferCost.mass)

  const sliderValue = BURN_INTENSITY_OPTIONS.indexOf(burnIntensity)

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const value = typeof newValue === 'number' ? newValue : newValue[0]
    onBurnIntensityChange(BURN_INTENSITY_OPTIONS[value])
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        <ActionButton isActive={actionType === 'coast'} onClick={() => onActionTypeChange('coast')}>
          <Typography variant="caption" fontWeight="bold">
            Coast
          </Typography>
        </ActionButton>

        <ActionButton isActive={actionType === 'burn'} onClick={() => onActionTypeChange('burn')}>
          <Typography variant="caption" fontWeight="bold">
            Burn
          </Typography>
        </ActionButton>

        <ActionButton
          isActive={actionType === 'well_transfer'}
          disabled={!canTransfer}
          onClick={() => canTransfer && onActionTypeChange('well_transfer')}
        >
          <Typography variant="caption" fontWeight="bold">
            Transfer
          </Typography>
        </ActionButton>
      </Box>

      {actionType === 'burn' && (
        <Box sx={{ px: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Intensity:
            </Typography>
            <Box sx={{ flex: 1, px: 1 }}>
              <Slider
                size="small"
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
                  py: 0.5,
                  '& .MuiSlider-markLabel': { fontSize: '0.6rem' },
                  '& .MuiSlider-thumb': { width: 12, height: 12 },
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', minWidth: 45, textAlign: 'right' }}>
              ±{burnCost.rings} ring
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Phasing:
            </Typography>
            <Box sx={{ flex: 1, px: 1 }}>
              <Slider
                size="small"
                value={sectorAdjustment}
                onChange={(_, value) =>
                  onSectorAdjustmentChange(typeof value === 'number' ? value : value[0])
                }
                min={adjustmentRange.min}
                max={adjustmentRange.max}
                step={1}
                marks={Array.from(
                  { length: adjustmentRange.max - adjustmentRange.min + 1 },
                  (_, i) => {
                    const val = adjustmentRange.min + i
                    return { value: val, label: val === 0 ? '0' : val > 0 ? `+${val}` : `${val}` }
                  }
                )}
                sx={{
                  py: 0.5,
                  '& .MuiSlider-markLabel': { fontSize: '0.6rem' },
                  '& .MuiSlider-thumb': { width: 12, height: 12 },
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', minWidth: 45, textAlign: 'right' }}>
              {currentVelocity + sectorAdjustment} sec
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.65rem' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Cost:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <span style={{ color: hasEnoughEngines ? '#4caf50' : '#f44336' }}>
                {enginesSubsystem?.allocatedEnergy || 0}/{burnCost.energy}
              </span>
              <CustomIcon icon="energy" size={10} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <span style={{ color: hasEnoughMass ? '#4caf50' : '#f44336' }}>
                {totalBurnMass}/{reactionMass}
              </span>
              <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>mass</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {actionType === 'well_transfer' && (
        <Box sx={{ px: 0.5 }}>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block', mb: 0.5 }}>
            → {transferDestination || 'Unknown'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.65rem' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Cost:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <span style={{ color: hasEnoughEngines ? '#4caf50' : '#f44336' }}>
                {enginesSubsystem?.allocatedEnergy || 0}/{transferCost.energy}
              </span>
              <CustomIcon icon="energy" size={10} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <span style={{ color: hasEnoughMass ? '#4caf50' : '#f44336' }}>
                {transferCost.mass}/{reactionMass}
              </span>
              <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>mass</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
