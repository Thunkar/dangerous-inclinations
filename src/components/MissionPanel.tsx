import { Box, Typography, Paper, Chip, LinearProgress, Tooltip } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import WarningIcon from '@mui/icons-material/Warning'
import type { Player } from '../types/game'
import type { Mission, DestroyShipMission, DeliverCargoMission } from '../game-logic/missions/types'

interface MissionPanelProps {
  player: Player
  allPlayers: Player[]
}

// Planet display names
const PLANET_NAMES: Record<string, string> = {
  'planet-alpha': 'Alpha',
  'planet-beta': 'Beta',
  'planet-gamma': 'Gamma',
  'planet-delta': 'Delta',
  'planet-epsilon': 'Epsilon',
  'planet-zeta': 'Zeta',
}

function getPlanetName(planetId: string): string {
  return PLANET_NAMES[planetId] || planetId
}

function DestroyMissionCard({
  mission,
  targetPlayer,
}: {
  mission: DestroyShipMission
  targetPlayer: Player | undefined
}) {
  const targetName = targetPlayer?.name || 'Unknown'
  const targetColor = targetPlayer?.color || '#888'

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
              color: mission.isCompleted ? 'text.secondary' : isPickedUp ? 'info.main' : 'text.secondary',
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
  const completedCount = player.completedMissionCount
  const totalMissions = player.missions.length
  const progress = totalMissions > 0 ? (completedCount / totalMissions) * 100 : 0

  // No missions in legacy mode
  if (totalMissions === 0) {
    return null
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          Missions
        </Typography>
        <Chip
          label={`${completedCount}/${totalMissions}`}
          size="small"
          color={completedCount >= 3 ? 'success' : 'default'}
        />
      </Box>

      {/* Progress bar */}
      <Box sx={{ mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
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
  )
}
