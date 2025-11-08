import { Box, Typography, Paper, Stack, Chip } from '@mui/material'
import type { Subsystem, ReactorState, HeatState, SubsystemType } from '../../types/subsystems'
import { getSubsystem } from '../../utils/subsystemHelpers'
import { isSubsystemOverclocked } from '../../types/subsystems'
import { RadialMenu } from './RadialMenu'
import { SubsystemButton } from './SubsystemButton'

interface RadialSubsystemPanelProps {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  onAllocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onDeallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onVentHeat: (amount: number) => void
}

export function RadialSubsystemPanel({
  subsystems,
  reactor,
  heat,
  onAllocateEnergy,
  onDeallocateEnergy,
  onVentHeat,
}: RadialSubsystemPanelProps) {
  const handleAllocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (subsystem && reactor.availableEnergy > 0) {
      onAllocateEnergy(subsystemType, subsystem.allocatedEnergy + 1)
    }
  }

  const handleDeallocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (subsystem && subsystem.allocatedEnergy > 0) {
      onDeallocateEnergy(subsystemType, 1)
    }
  }

  const renderSubsystemMenu = (subsystem: Subsystem) => {
    const isOverclocked = isSubsystemOverclocked(subsystem)
    const canAllocate = reactor.availableEnergy > 0
    const canDeallocate = subsystem.allocatedEnergy > 0

    // Create toggle button with indicators
    const customToggle = (
      <Box sx={{ position: 'relative' }}>
        {/* Power indicator */}
        {subsystem.allocatedEnergy > 0 && (
          <Box
            sx={{
              position: 'absolute',
              left: '-1em',
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              borderRadius: '50%',
              width: '1.2em',
              height: '1.2em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8em',
              fontWeight: 'bold',
              zIndex: 15,
            }}
          >
            {subsystem.allocatedEnergy}
          </Box>
        )}

        {/* Heat indicator (for overclocked systems) */}
        {isOverclocked && (
          <Box
            sx={{
              position: 'absolute',
              right: '-1em',
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'error.main',
              color: 'error.contrastText',
              borderRadius: '50%',
              width: '1.2em',
              height: '1.2em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8em',
              fontWeight: 'bold',
              zIndex: 15,
            }}
          >
            !
          </Box>
        )}

        <SubsystemButton
          subsystemType={subsystem.type}
          allocatedEnergy={subsystem.allocatedEnergy}
          isPowered={subsystem.isPowered}
          isOverclocked={isOverclocked}
          usedThisTurn={subsystem.usedThisTurn}
        />
      </Box>
    )

    // Create action buttons for submenu
    const actionButtons = [
      <SubsystemButton
        key="add"
        subsystemType={subsystem.type}
        allocatedEnergy={0}
        isPowered={false}
        variant="add"
        disabled={!canAllocate}
        onClick={() => handleAllocate(subsystem.type)}
      />,
      <SubsystemButton
        key="remove"
        subsystemType={subsystem.type}
        allocatedEnergy={0}
        isPowered={false}
        variant="remove"
        disabled={!canDeallocate}
        onClick={() => handleDeallocate(subsystem.type)}
      />,
    ]

    return (
      <RadialMenu
        key={subsystem.type}
        customToggle={customToggle}
        radius={6}
        startAngle={-Math.PI / 6}
        rotationAngle={Math.PI / 3}
      >
        {actionButtons}
      </RadialMenu>
    )
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Ship Systems
      </Typography>

      {/* Reactor Status */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Stack direction="row" spacing={2} justifyContent="space-between" flexWrap="wrap">
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
      </Box>

      {/* Subsystem Radial Menus */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 4,
          justifyItems: 'center',
          py: 2,
        }}
      >
        {subsystems.map((subsystem) => (
          <Box key={subsystem.type} sx={{ minHeight: '120px', display: 'flex', alignItems: 'center' }}>
            {renderSubsystemMenu(subsystem)}
          </Box>
        ))}
      </Box>

      {/* Heat Venting */}
      {heat.currentHeat > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'error.dark', borderRadius: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="error.contrastText">
              Heat Management
            </Typography>
            <SubsystemButton
              subsystemType="engines"
              allocatedEnergy={0}
              isPowered={false}
              variant="vent"
              disabled={heat.heatToVent >= heat.currentHeat}
              onClick={() => onVentHeat(1)}
              label="Vent Heat"
            />
            {heat.heatToVent > 0 && (
              <Chip label={`Venting: ${heat.heatToVent}`} color="warning" size="small" />
            )}
          </Stack>
        </Box>
      )}

      {/* Legend */}
      <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Click on a subsystem to allocate or deallocate energy. Overclocked subsystems (!) generate
          heat.
        </Typography>
      </Box>
    </Paper>
  )
}
