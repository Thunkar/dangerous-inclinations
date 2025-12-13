import { Box, Typography, Button, Paper, Chip } from '@mui/material'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { GameState } from '@dangerous-inclinations/engine'
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
} from '@dangerous-inclinations/engine'

const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

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

interface GameEndScreenProps {
  gameState: GameState
  onPlayAgain: () => void
}

export function GameEndScreen({ gameState, onPlayAgain }: GameEndScreenProps) {
  const winner = gameState.winnerId
    ? gameState.players.find(p => p.id === gameState.winnerId)
    : null
  const winnerIndex = winner ? gameState.players.findIndex(p => p.id === winner.id) : 0
  const winnerColor = PLAYER_COLORS[winnerIndex % PLAYER_COLORS.length]

  const isHumanWinner = gameState.winnerId === 'player1'

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        p: 4,
        background: isHumanWinner
          ? 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(0, 0, 0, 0.9) 100%)'
          : 'linear-gradient(135deg, rgba(244, 67, 54, 0.1) 0%, rgba(0, 0, 0, 0.9) 100%)',
      }}
    >
      {/* Trophy Icon */}
      <EmojiEventsIcon
        sx={{
          fontSize: 120,
          color: winnerColor,
          filter: 'drop-shadow(0 0 20px currentColor)',
        }}
      />

      {/* Result Title */}
      <Typography
        variant="h2"
        sx={{
          fontWeight: 'bold',
          color: isHumanWinner ? 'success.main' : 'error.main',
          textShadow: '0 0 20px currentColor',
        }}
      >
        {isHumanWinner ? 'VICTORY!' : 'DEFEAT'}
      </Typography>

      {/* Winner Info */}
      {winner && (
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" sx={{ color: winnerColor, mb: 1 }}>
            {winner.name} wins!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Completed all 3 missions in {gameState.turn} turns
          </Typography>
        </Box>
      )}

      {/* Winner's Completed Missions */}
      {winner && winner.missions.length > 0 && (
        <Paper
          sx={{
            p: 3,
            minWidth: 400,
            maxWidth: 500,
            bgcolor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid',
            borderColor: winnerColor,
          }}
        >
          <Typography variant="h6" sx={{ mb: 2, color: winnerColor }}>
            Completed Missions
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {winner.missions.map((mission: Mission, index: number) => (
              <Box
                key={mission.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                <CheckCircleIcon sx={{ color: 'success.main' }} />
                <Box>
                  {mission.type === 'destroy_ship' ? (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        Mission {index + 1}: Destroy Ship
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Target:{' '}
                        {gameState.players.find(
                          p => p.id === (mission as DestroyShipMission).targetPlayerId
                        )?.name || 'Unknown'}
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        Mission {index + 1}: Deliver Cargo
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getPlanetName((mission as DeliverCargoMission).pickupPlanetId)} →{' '}
                        {getPlanetName((mission as DeliverCargoMission).deliveryPlanetId)}
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Final Standings */}
      <Paper
        sx={{
          p: 3,
          minWidth: 400,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          Final Standings
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[...gameState.players]
            .sort((a, b) => b.completedMissionCount - a.completedMissionCount)
            .map((player, index) => {
              const playerIndex = gameState.players.findIndex(p => p.id === player.id)
              const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]

              return (
                <Box
                  key={player.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1,
                    borderRadius: 1,
                    bgcolor: player.id === winner?.id ? 'action.selected' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ width: 24, color: 'text.secondary' }}>
                      #{index + 1}
                    </Typography>
                    <Typography
                      sx={{ color, fontWeight: player.id === winner?.id ? 'bold' : 'normal' }}
                    >
                      {player.name}
                    </Typography>
                  </Box>
                  <Chip
                    label={`${player.completedMissionCount}/3 missions`}
                    size="small"
                    color={player.completedMissionCount >= 3 ? 'success' : 'default'}
                    variant={player.id === winner?.id ? 'filled' : 'outlined'}
                  />
                </Box>
              )
            })}
        </Box>
      </Paper>

      {/* Play Again Button */}
      <Button
        variant="contained"
        size="large"
        startIcon={<RestartAltIcon />}
        onClick={onPlayAgain}
        sx={{
          px: 6,
          py: 1.5,
          fontSize: '1.2rem',
          mt: 2,
        }}
      >
        Play Again
      </Button>
    </Box>
  )
}
