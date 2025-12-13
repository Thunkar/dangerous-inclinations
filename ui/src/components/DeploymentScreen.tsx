import { Box, Typography, Paper, Button, Chip, Divider } from '@mui/material'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { useLobby } from '../context/LobbyContext'
import { DeploymentBoard } from './DeploymentBoard'
import type { DestroyShipMission, DeliverCargoMission } from '@dangerous-inclinations/engine'

const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

const PLANET_NAMES: Record<string, string> = {
  'planet-alpha': 'Alpha',
  'planet-beta': 'Beta',
  'planet-gamma': 'Gamma',
}

export function DeploymentScreen() {
  const { gameState, deployPlayerShip, getDeploymentSectors } = useLobby()

  if (!gameState) {
    return null
  }

  const activePlayer = gameState.players[gameState.activePlayerIndex]
  const isHumanTurn = activePlayer?.id === 'player1'
  const availableSectors = getDeploymentSectors()
  const humanPlayer = gameState.players.find(p => p.id === 'player1')

  // Count deployed players
  const deployedCount = gameState.players.filter(p => p.hasDeployed).length
  const totalPlayers = gameState.players.length

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Typography variant="h5">
          Ship Deployment ({deployedCount}/{totalPlayers})
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {activePlayer && (
            <Chip
              icon={<RocketLaunchIcon />}
              label={`${activePlayer.name}'s turn to deploy`}
              sx={{
                bgcolor: PLAYER_COLORS[gameState.activePlayerIndex % PLAYER_COLORS.length],
                color: 'white',
              }}
            />
          )}
        </Box>
      </Box>

      {/* Main content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%', minHeight: 0 }}>
        {/* Left panel - Player status & Missions */}
        <Box
          sx={{
            width: 320,
            minWidth: 320,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 2,
            flexShrink: 0,
          }}
        >
          <Typography variant="h6" sx={{ mb: 2 }}>
            Players
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {gameState.players.map((player, index) => (
              <Paper
                key={player.id}
                sx={{
                  p: 1.5,
                  bgcolor: player.hasDeployed ? 'action.selected' : 'background.paper',
                  border: '2px solid',
                  borderColor:
                    gameState.activePlayerIndex === index
                      ? PLAYER_COLORS[index % PLAYER_COLORS.length]
                      : 'transparent',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography
                    sx={{
                      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
                      fontWeight: 'medium',
                    }}
                  >
                    {player.name}
                  </Typography>
                  {player.hasDeployed ? (
                    <Chip label="Deployed" size="small" color="success" variant="outlined" />
                  ) : gameState.activePlayerIndex === index ? (
                    <Chip label="Deploying..." size="small" color="warning" variant="outlined" />
                  ) : (
                    <Chip label="Waiting" size="small" variant="outlined" />
                  )}
                </Box>
              </Paper>
            ))}
          </Box>

          {/* Your Missions - Show human player's missions */}
          {humanPlayer && humanPlayer.missions.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>
                Your Missions
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {humanPlayer.missions.map((mission, index) => (
                  <Paper
                    key={mission.id}
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {mission.type === 'destroy_ship' ? (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <GpsFixedIcon sx={{ color: 'error.main', fontSize: 20, mt: 0.3 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            Mission {index + 1}: Destroy Ship
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Target:{' '}
                            <span style={{ color: PLAYER_COLORS[
                              gameState.players.findIndex(p => p.id === (mission as DestroyShipMission).targetPlayerId) % PLAYER_COLORS.length
                            ] }}>
                              {gameState.players.find(
                                p => p.id === (mission as DestroyShipMission).targetPlayerId
                              )?.name || 'Unknown'}
                            </span>
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <LocalShippingIcon sx={{ color: 'info.main', fontSize: 20, mt: 0.3 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            Mission {index + 1}: Deliver Cargo
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {PLANET_NAMES[(mission as DeliverCargoMission).pickupPlanetId] || (mission as DeliverCargoMission).pickupPlanetId}
                            {' → '}
                            {PLANET_NAMES[(mission as DeliverCargoMission).deliveryPlanetId] || (mission as DeliverCargoMission).deliveryPlanetId}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            </>
          )}

          {/* Instructions */}
          <Paper sx={{ mt: 3, p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="body2" color="text.secondary">
              {isHumanTurn ? (
                <>
                  <strong>Your turn!</strong> Click a highlighted sector on Ring 4 to deploy
                  your ship.
                </>
              ) : (
                <>
                  Waiting for <strong>{activePlayer?.name}</strong> to deploy...
                </>
              )}
            </Typography>
          </Paper>
        </Box>

        {/* Center - Deployment Board */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <DeploymentBoard
            gameState={gameState}
            availableSectors={availableSectors}
            onSelectSector={deployPlayerShip}
            enabled={isHumanTurn}
          />
        </Box>

        {/* Right panel - Sector selection (alternative UI) */}
        {isHumanTurn && (
          <Box
            sx={{
              width: 220,
              minWidth: 220,
              borderLeft: 1,
              borderColor: 'divider',
              overflow: 'auto',
              p: 2,
              flexShrink: 0,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2 }}>
              Select Sector
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Click a sector on the board or select below:
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {availableSectors.slice(0, 12).map(sector => (
                <Button
                  key={sector}
                  variant="outlined"
                  size="small"
                  onClick={() => deployPlayerShip(sector)}
                  sx={{ minWidth: 50 }}
                >
                  S{sector}
                </Button>
              ))}
              {availableSectors.length > 12 && (
                <Typography variant="body2" color="text.secondary">
                  + {availableSectors.length - 12} more on board
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
