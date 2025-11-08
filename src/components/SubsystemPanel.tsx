import { Box, Typography, Button, Paper, Stack, Chip } from '@mui/material'
import { Add, Remove } from '@mui/icons-material'
import type { Subsystem, ReactorState, HeatState, SubsystemType } from '../types/subsystems'
import { getSubsystemConfig, isSubsystemOverclocked } from '../types/subsystems'

interface SubsystemPanelProps {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  onAllocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onDeallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onVentHeat: (amount: number) => void
}

export function SubsystemPanel({
  subsystems,
  reactor,
  heat,
  onAllocateEnergy,
  onDeallocateEnergy,
  onVentHeat,
}: SubsystemPanelProps) {
  const handleIncreaseEnergy = (subsystem: Subsystem) => {
    if (reactor.availableEnergy > 0) {
      onAllocateEnergy(subsystem.type, subsystem.allocatedEnergy + 1)
    }
  }

  const handleDecreaseEnergy = (subsystem: Subsystem) => {
    if (subsystem.allocatedEnergy > 0) {
      onDeallocateEnergy(subsystem.type, 1)
    }
  }

  const handleVentHeat = () => {
    if (heat.currentHeat > 0) {
      onVentHeat(1)
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Ship Systems
      </Typography>

      {/* Reactor Status */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Stack direction="row" spacing={2} justifyContent="space-between">
          <Box>
            <Typography variant="body2" color="text.secondary">
              Reactor
            </Typography>
            <Typography variant="h6">
              {reactor.availableEnergy} / {reactor.totalCapacity}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Heat
            </Typography>
            <Typography variant="h6" color={heat.currentHeat > 0 ? 'error.main' : 'inherit'}>
              {heat.currentHeat}
            </Typography>
          </Box>
          {reactor.energyToReturn > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                Returning
              </Typography>
              <Typography variant="h6" color="info.main">
                {reactor.energyToReturn}
              </Typography>
            </Box>
          )}
        </Stack>

        {/* Heat Venting */}
        {heat.currentHeat > 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={handleVentHeat}
              disabled={heat.heatToVent >= heat.currentHeat}
            >
              Vent Heat (-1)
            </Button>
            {heat.heatToVent > 0 && (
              <Chip
                label={`Venting: ${heat.heatToVent}`}
                color="warning"
                size="small"
                sx={{ ml: 1 }}
              />
            )}
          </Box>
        )}
      </Box>

      {/* Subsystems */}
      <Stack spacing={2}>
        {subsystems.map(subsystem => {
          const config = getSubsystemConfig(subsystem.type)
          const isOverclocked = isSubsystemOverclocked(subsystem)
          const canIncrement = reactor.availableEnergy > 0
          const canDecrement = subsystem.allocatedEnergy > 0

          return (
            <Box
              key={subsystem.type}
              sx={{
                p: 2,
                border: 1,
                borderColor: subsystem.isPowered ? 'primary.main' : 'divider',
                borderRadius: 1,
                bgcolor: isOverclocked ? 'error.dark' : 'background.paper',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {config.name}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip
                      label={`${subsystem.allocatedEnergy}E`}
                      size="small"
                      color={subsystem.isPowered ? 'primary' : 'default'}
                    />
                    {isOverclocked && (
                      <Chip label="OVERCLOCKED" size="small" color="error" />
                    )}
                    {subsystem.usedThisTurn && (
                      <Chip label="USED" size="small" color="success" />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Min: {config.minEnergy} | Normal Max: {config.maxEnergy}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleDecreaseEnergy(subsystem)}
                    disabled={!canDecrement}
                    sx={{ minWidth: 40 }}
                  >
                    <Remove fontSize="small" />
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleIncreaseEnergy(subsystem)}
                    disabled={!canIncrement}
                    sx={{ minWidth: 40 }}
                  >
                    <Add fontSize="small" />
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Paper>
  )
}
