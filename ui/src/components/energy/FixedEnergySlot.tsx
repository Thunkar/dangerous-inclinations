import { Box, styled, Tooltip, Typography } from '@mui/material'
import type { Subsystem } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { getSubsystemIcon } from '../loadout/subsystemIcons'

interface FixedEnergySlotProps {
  subsystem: Subsystem
  subsystemIndex: number
  availableEnergy: number
  onAllocate: (subsystemIndex: number, amount: number) => void
  onDeallocate: (subsystemIndex: number, amount: number) => void
}

function getEnergyColor(allocatedEnergy: number, maxEnergy: number): string {
  if (allocatedEnergy === 0) return '#444444'
  if (allocatedEnergy === maxEnergy) return '#4caf50'
  return '#ff9800'
}

const SlotContainer = styled(Box, {
  shouldForwardProp: prop => !['isPowered', 'isBroken', 'bgColor'].includes(prop as string),
})<{ isPowered: boolean; isBroken: boolean; bgColor: string }>(({ isPowered, isBroken, bgColor }) => ({
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: `2px solid ${bgColor}`,
  backgroundColor: isPowered ? bgColor : 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: isBroken ? 'not-allowed' : 'pointer',
  transition: 'all 0.2s',
  position: 'relative',
  opacity: isBroken ? 0.5 : 1,
  userSelect: 'none',
  '&:hover': {
    transform: isBroken ? 'none' : 'scale(1.1)',
    boxShadow: isBroken ? 'none' : `0 0 12px ${bgColor}`,
  },
}))

const EnergyBadge = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: -6,
  right: -6,
  width: 18,
  height: 18,
  borderRadius: '50%',
  backgroundColor: theme.palette.secondary.main,
  color: theme.palette.secondary.contrastText,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.7rem',
  fontWeight: 'bold',
  zIndex: 10,
}))

const BrokenIndicator = styled(Box)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) rotate(-45deg)',
  width: '120%',
  height: 3,
  backgroundColor: '#ff0000',
  zIndex: 15,
})

export function FixedEnergySlot({
  subsystem,
  subsystemIndex,
  availableEnergy,
  onAllocate,
  onDeallocate,
}: FixedEnergySlotProps) {
  const config = getSubsystemConfig(subsystem.type)
  const isPowered = subsystem.allocatedEnergy >= config.minEnergy
  const isBroken = subsystem.isBroken ?? false
  const bgColor = getEnergyColor(subsystem.allocatedEnergy, config.maxEnergy)
  const icon = getSubsystemIcon(subsystem.type)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isBroken) return

    // Left click: allocate energy
    if (e.button === 0) {
      if (subsystem.allocatedEnergy === 0) {
        // Power on: allocate minEnergy
        if (availableEnergy >= config.minEnergy) {
          onAllocate(subsystemIndex, config.minEnergy)
        }
      } else if (subsystem.allocatedEnergy < config.maxEnergy && availableEnergy > 0) {
        // Already powered: add 1
        onAllocate(subsystemIndex, subsystem.allocatedEnergy + 1)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isBroken) return

    // Right click: deallocate energy
    if (subsystem.allocatedEnergy === 0) return

    if (subsystem.allocatedEnergy === config.minEnergy) {
      // At minimum: turn off completely
      onDeallocate(subsystemIndex, subsystem.allocatedEnergy)
    } else if (subsystem.allocatedEnergy > config.minEnergy) {
      // Above minimum: decrease by 1
      onDeallocate(subsystemIndex, 1)
    }
  }

  const tooltipContent = (
    <Box>
      <Typography variant="body2" fontWeight="bold">
        {config.name} (Fixed)
      </Typography>
      <Typography variant="caption" display="block">
        Energy: {subsystem.allocatedEnergy}/{config.maxEnergy}
      </Typography>
      {config.minEnergy > 0 && (
        <Typography variant="caption" display="block" color="text.secondary">
          Min to power: {config.minEnergy}
        </Typography>
      )}
      {isBroken && (
        <Typography variant="caption" display="block" color="error">
          BROKEN - Needs repair
        </Typography>
      )}
      {!isBroken && (
        <Typography variant="caption" display="block" color="text.secondary">
          Left click: +power | Right click: -power
        </Typography>
      )}
    </Box>
  )

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <SlotContainer
        isPowered={isPowered}
        isBroken={isBroken}
        bgColor={bgColor}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {icon && (
          <img
            src={icon}
            alt={config.name}
            style={{
              width: 22,
              height: 22,
              filter: 'brightness(0) invert(1)',
              opacity: isPowered ? 1 : 0.5,
            }}
          />
        )}
        {subsystem.allocatedEnergy > 0 && <EnergyBadge>{subsystem.allocatedEnergy}</EnergyBadge>}
        {isBroken && <BrokenIndicator />}
        {subsystem.usedThisTurn && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'warning.main',
            }}
          />
        )}
      </SlotContainer>
    </Tooltip>
  )
}
