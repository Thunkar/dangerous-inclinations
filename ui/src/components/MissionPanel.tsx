import { useState } from 'react'
import { Box, Typography, Paper, Chip, LinearProgress, Tooltip, Collapse, IconButton } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import WarningIcon from '@mui/icons-material/Warning'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { Player } from '@dangerous-inclinations/engine'
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
} from '@dangerous-inclinations/engine'
import { getPlayerColorById } from '@/utils/playerColors'

interface MissionPanelProps {
  player: Player
  allPlayers: Player[]
}

// Planet display names
const PLANET_NAMES: Record<string, string> = {
  'planet-alpha': 'Alpha',
  'planet-beta': 'Beta',
  'planet-gamma': 'Gamma',
}

function getPlanetName(planetId: string): string {
  return PLANET_NAMES[planetId] || planetId
}

function DestroyMissionCard({
  mission,
  targetPlayer,
  allPlayers,
}: {
  mission: DestroyShipMission
  targetPlayer: Player | undefined
  allPlayers: Player[]
}) {
  const targetName = targetPlayer?.name || 'Unknown'
  const targetColor = targetPlayer ? getPlayerColorById(targetPlayer.id, allPlayers) : '#888'

  return (
    <Paper
      sx={{
        p: 1.5,
        bgcolor: mission.isCompleted ? 'success.dark' : 'background.paper',
        border: '1px solid',
        borderColor: mission.isCompleted ? 'success.main' : 'divider',
        opacity: mission.isCompleted ? 0.8 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {mission.isCompleted ? (
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
        ) : (
          <GpsFixedIcon sx={{ color: 'error.main', fontSize: 20 }} />
        )}
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Destroy Ship
        </Typography>
        {mission.isCompleted && (
          <Chip label="Complete" size="small" color="success" sx={{ ml: 'auto' }} />
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 3.5 }}>
        <Typography variant="body2" color="text.secondary">
          Target:
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: targetColor,
            fontWeight: 'medium',
            textDecoration: mission.isCompleted ? 'line-through' : 'none',
          }}
        >
          {targetName}
        </Typography>
      </Box>
    </Paper>
  )
}

function CargoMissionCard({
  mission,
  cargo,
}: {
  mission: DeliverCargoMission
  cargo: { isPickedUp: boolean } | undefined
}) {
  const pickupPlanet = getPlanetName(mission.pickupPlanetId)
  const deliveryPlanet = getPlanetName(mission.deliveryPlanetId)
  const isPickedUp = cargo?.isPickedUp || false

  return (
    <Paper
      sx={{
        p: 1.5,
        bgcolor: mission.isCompleted ? 'success.dark' : 'background.paper',
        border: '1px solid',
        borderColor: mission.isCompleted ? 'success.main' : 'divider',
        opacity: mission.isCompleted ? 0.8 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {mission.isCompleted ? (
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
        ) : (
          <LocalShippingIcon sx={{ color: 'info.main', fontSize: 20 }} />
        )}
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Deliver Cargo
        </Typography>
        {mission.isCompleted && (
          <Chip label="Complete" size="small" color="success" sx={{ ml: 'auto' }} />
        )}
      </Box>

      <Box sx={{ ml: 3.5 }}>
        {/* Progress indicator */}
        {!mission.isCompleted && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Tooltip title={isPickedUp ? 'Cargo aboard' : 'Cargo at station'}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: isPickedUp ? 'warning.main' : 'grey.600',
                }}
              />
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              {isPickedUp ? 'Cargo aboard - deliver to station' : 'Pick up cargo at station'}
            </Typography>
          </Box>
        )}

        {/* Route */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              color: isPickedUp ? 'text.secondary' : 'warning.main',
              textDecoration: isPickedUp ? 'line-through' : 'none',
            }}
          >
            {pickupPlanet}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            →
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: mission.isCompleted
                ? 'text.secondary'
                : isPickedUp
                  ? 'info.main'
                  : 'text.secondary',
              fontWeight: isPickedUp && !mission.isCompleted ? 'bold' : 'normal',
            }}
          >
            {deliveryPlanet}
          </Typography>
        </Box>
      </Box>
    </Paper>
  )
}

export function MissionPanel({ player, allPlayers }: MissionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const completedCount = player.completedMissionCount
  const totalMissions = player.missions.length
  const progress = totalMissions > 0 ? (completedCount / totalMissions) * 100 : 0

  // No missions in legacy mode
  if (totalMissions === 0) {
    return null
  }

  return (
    <Paper
      sx={{
        mb: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          bgcolor: 'rgba(255,255,255,0.03)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'divider',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
            Missions
          </Typography>
          <Chip
            label={`${completedCount}/${totalMissions}`}
            size="small"
            color={completedCount >= 3 ? 'success' : 'default'}
            sx={{ height: 20, '& .MuiChip-label': { px: 1, fontSize: '0.65rem' } }}
          />
        </Box>
        <IconButton size="small" sx={{ p: 0.25 }}>
          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ p: 1.5 }}>
          {/* Progress bar */}
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 1,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': {
                  bgcolor: completedCount >= 3 ? 'success.main' : 'primary.main',
                },
              }}
            />
            {completedCount >= 3 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <WarningIcon sx={{ fontSize: 14, color: 'success.main' }} />
                <Typography variant="caption" color="success.main">
                  Victory achieved!
                </Typography>
              </Box>
            )}
          </Box>

          {/* Mission cards */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {player.missions.map((mission: Mission) => {
              if (mission.type === 'destroy_ship') {
                const destroyMission = mission as DestroyShipMission
                const targetPlayer = allPlayers.find(p => p.id === destroyMission.targetPlayerId)
                return (
                  <DestroyMissionCard
                    key={mission.id}
                    mission={destroyMission}
                    targetPlayer={targetPlayer}
                    allPlayers={allPlayers}
                  />
                )
              } else if (mission.type === 'deliver_cargo') {
                const cargoMission = mission as DeliverCargoMission
                const cargo = player.cargo.find(c => c.missionId === mission.id)
                return <CargoMissionCard key={mission.id} mission={cargoMission} cargo={cargo} />
              }
              return null
            })}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  )
}
