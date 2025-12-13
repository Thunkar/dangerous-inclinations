import { Box, Typography, Paper, Stack } from '@mui/material'
import type { Subsystem, ReactorState, HeatState, SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystem, getSubsystemConfig } from '@dangerous-inclinations/engine'
import { RadialMenu } from './RadialMenu'
import { SubsystemButton } from './SubsystemButton'

interface RadialSubsystemPanelProps {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  dissipationCapacity: number
  onAllocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onDeallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
}

export function RadialSubsystemPanel({
  subsystems,
  reactor,
  heat,
  dissipationCapacity,
  onAllocateEnergy,
  onDeallocateEnergy,
}: RadialSubsystemPanelProps) {
  const handleAllocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (!subsystem) return

    const config = getSubsystemConfig(subsystemType)

    // If unpowered (0 energy), power to minEnergy
    // If already powered, increment by 1 (up to maxEnergy)
    if (subsystem.allocatedEnergy === 0) {
      // Must allocate at least minEnergy to turn on
      if (reactor.availableEnergy >= config.minEnergy) {
        onAllocateEnergy(subsystemType, config.minEnergy)
      }
    } else if (subsystem.allocatedEnergy < config.maxEnergy && reactor.availableEnergy > 0) {
      // Already powered, add +1 (pass new total, not increment)
      onAllocateEnergy(subsystemType, subsystem.allocatedEnergy + 1)
    }
  }

  const handleDeallocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (!subsystem || subsystem.allocatedEnergy === 0) return

    const config = getSubsystemConfig(subsystemType)

    // If at minEnergy, turn off completely (deallocate all)
    // If above minEnergy, decrement by 1
    if (subsystem.allocatedEnergy === config.minEnergy) {
      // At minimum - turn off completely
      onDeallocateEnergy(subsystemType, subsystem.allocatedEnergy)
    } else if (subsystem.allocatedEnergy > config.minEnergy) {
      // Above minimum - decrease by 1
      onDeallocateEnergy(subsystemType, 1)
    }
  }

  const renderSubsystemMenu = (subsystem: Subsystem) => {
    const config = getSubsystemConfig(subsystem.type)
    // Can allocate if: not broken AND (unpowered and have enough for minEnergy, or powered and below max with available energy)
    const canAllocate =
      !subsystem.isBroken &&
      ((subsystem.allocatedEnergy === 0 && reactor.availableEnergy >= config.minEnergy) ||
      (subsystem.allocatedEnergy > 0 && subsystem.allocatedEnergy < config.maxEnergy && reactor.availableEnergy > 0))
    const canDeallocate = subsystem.allocatedEnergy > 0

    // Create toggle button with indicators
    const customToggle = (
      <Box sx={{ position: 'relative' }}>
        {/* Power indicator */}
        {subsystem.allocatedEnergy > 0 && !subsystem.isBroken && (
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

        <SubsystemButton
          subsystemType={subsystem.type}
          allocatedEnergy={subsystem.allocatedEnergy}
          isPowered={subsystem.isPowered}
          usedThisTurn={subsystem.usedThisTurn}
          isBroken={subsystem.isBroken}
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
          <Box>
            <Typography variant="body2" color="text.secondary">
              Dissipation
            </Typography>
            <Typography variant="h6" color="info.main">
              {dissipationCapacity}
            </Typography>
          </Box>
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

      {/* Heat Warning */}
      {heat.currentHeat > dissipationCapacity && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'error.dark', borderRadius: 1 }}>
          <Typography variant="body2" color="error.contrastText">
            Warning: Heat ({heat.currentHeat}) exceeds dissipation capacity ({dissipationCapacity}).
            You will take {heat.currentHeat - dissipationCapacity} damage at start of next turn!
          </Typography>
        </Box>
      )}

      {/* Legend */}
      <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Click on a subsystem to allocate or deallocate energy. Heat is generated when subsystems
          are used, and dissipates automatically at the start of each turn.
        </Typography>
      </Box>
    </Paper>
  )
}
