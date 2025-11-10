import { Box, Typography, styled, Select, MenuItem, FormControl, IconButton, Tooltip } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import type { Player } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
import { getSubsystemConfig } from '../../types/subsystems'
import { calculateFiringSolutions } from '../../utils/weaponRange'
import { CustomIcon } from '../CustomIcon'

interface WeaponCardProps {
  subsystem: Subsystem | undefined
  currentPlayer: Player
  allPlayers: Player[]
  selectedTarget: string
  onTargetSelect: (targetId: string) => void
  showRange: boolean
  onRangeToggle: () => void
}

interface CardContainerProps {
  isPowered: boolean
  isUsed: boolean
}

const CardContainer = styled(Box, {
  shouldForwardProp: prop => prop !== 'isPowered' && prop !== 'isUsed',
})<CardContainerProps>(({ theme, isPowered, isUsed }) => ({
  padding: '10px',
  borderRadius: '8px',
  backgroundColor: isPowered && !isUsed ? theme.palette.primary.main : theme.palette.primary.dark,
  border: `2px solid ${
    isPowered && !isUsed ? theme.palette.secondary.main : theme.palette.divider
  }`,
  opacity: isPowered && !isUsed ? 1 : 0.6,
  transition: 'all 0.2s',
}))

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
})

const StatusBadge = styled(Box, {
  shouldForwardProp: prop => prop !== 'isPowered' && prop !== 'isUsed',
})<{ isPowered: boolean; isUsed: boolean }>(({ theme, isPowered, isUsed }) => ({
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '0.65rem',
  fontWeight: 'bold',
  backgroundColor: isPowered && !isUsed ? theme.palette.success.dark : theme.palette.error.dark,
  color: theme.palette.text.primary,
}))

const WeaponStats = styled(Box)({
  display: 'flex',
  gap: '8px',
  marginBottom: '8px',
  fontSize: '0.7rem',
})

const StatItem = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
})

export function WeaponCard({
  subsystem,
  currentPlayer,
  allPlayers,
  selectedTarget,
  onTargetSelect,
  showRange,
  onRangeToggle,
}: WeaponCardProps) {
  if (!subsystem) {
    return null
  }

  const subsystemConfig = getSubsystemConfig(subsystem.type)
  const weaponStats = subsystemConfig.weaponStats

  if (!weaponStats) {
    return null // Not a weapon subsystem
  }

  const isPowered = subsystem.isPowered
  const isUsed = subsystem.usedThisTurn
  const canFire = isPowered && !isUsed

  // Calculate firing solutions for all potential targets
  const firingSolutions = calculateFiringSolutions(
    weaponStats,
    currentPlayer.ship,
    allPlayers,
    currentPlayer.id
  )

  const targetsInRange = firingSolutions.filter(fs => fs.inRange).length

  return (
    <CardContainer isPowered={isPowered} isUsed={isUsed}>
      <Header>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CustomIcon icon={subsystem.type} size={16} />
          <Typography variant="body2" fontWeight="bold">
            {subsystemConfig.name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={showRange ? 'Hide Range' : 'Show Range'} placement="top">
            <IconButton
              size="small"
              onClick={onRangeToggle}
              sx={{
                padding: '4px',
                color: showRange ? 'primary.main' : 'text.secondary',
              }}
            >
              {showRange ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
            </IconButton>
          </Tooltip>
          <StatusBadge isPowered={isPowered} isUsed={isUsed}>
            {!isPowered ? 'OFFLINE' : isUsed ? 'USED' : 'READY'}
          </StatusBadge>
        </Box>
      </Header>

      <WeaponStats>
        <StatItem>
          <CustomIcon icon="energy" size={10} />
          <Typography variant="caption">
            {subsystem.allocatedEnergy}/{subsystemConfig.minEnergy}
          </Typography>
        </StatItem>
        <StatItem>
          <Typography variant="caption" color="error.light">
            💥 {weaponStats.damage}
          </Typography>
        </StatItem>
        <StatItem>
          <Typography variant="caption" color="text.secondary">
            {weaponStats.arc === 'spinal' ? 'Spinal' : weaponStats.arc === 'broadside' ? 'Broadside' : 'Turret'}
          </Typography>
        </StatItem>
        <StatItem>
          <Typography variant="caption" color="text.secondary">
            {weaponStats.arc === 'spinal'
              ? `S${currentPlayer.ship.ring * 2}`
              : `R${weaponStats.ringRange}/S${weaponStats.sectorRange}`}
          </Typography>
        </StatItem>
      </WeaponStats>

      <FormControl fullWidth size="small" disabled={!canFire}>
        <Select
          value={selectedTarget}
          onChange={e => onTargetSelect(e.target.value)}
          displayEmpty
          sx={{
            fontSize: '0.8rem',
            '& .MuiSelect-select': {
              padding: '6px 8px',
            },
          }}
        >
          <MenuItem value="">
            <em>No Target ({targetsInRange} in range)</em>
          </MenuItem>
          {firingSolutions.map(solution => {
            const { targetPlayer, inRange, distance, wrongFacing } = solution
            const warnings = []
            if (!inRange) warnings.push('OUT OF RANGE')
            if (wrongFacing) warnings.push('WRONG FACING')

            return (
              <MenuItem key={targetPlayer.id} value={targetPlayer.id} disabled={!inRange}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <Typography variant="caption">{targetPlayer.name}</Typography>
                  <Typography
                    variant="caption"
                    color={inRange ? 'text.secondary' : 'error.main'}
                    sx={{ ml: 1 }}
                  >
                    R{targetPlayer.ship.ring}S{targetPlayer.ship.sector} (D{Math.round(distance)})
                    {warnings.length > 0 && ` ${warnings.join(', ')}`}
                  </Typography>
                </Box>
              </MenuItem>
            )
          })}
        </Select>
      </FormControl>
    </CardContainer>
  )
}
