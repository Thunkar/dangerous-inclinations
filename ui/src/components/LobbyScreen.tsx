import { Box, Typography, Button, Paper, IconButton, Chip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useLobby } from '../context/LobbyContext'

const PLAYER_COLORS = [
  '#3a7bd5', // Blue
  '#e53935', // Red
  '#43a047', // Green
  '#fb8c00', // Orange
  '#8e24aa', // Purple
  '#00acc1', // Cyan
]

export function LobbyScreen() {
  const { lobbyState, addBotToLobby, removeBotFromLobby, startGame, canStart, leaveLobbyAction } = useLobby()

  if (!lobbyState) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 70%)',
        }}
      >
        <Typography color="text.secondary">Loading lobby...</Typography>
      </Box>
    )
  }

  const startStatus = canStart()
  const botCount = lobbyState.players.filter(p => p.isBot).length

  // Create slots array with max players, filling with actual players and empty slots
  const playerSlots = Array.from({ length: lobbyState.maxPlayers }, (_, index) => {
    return lobbyState.players[index] || null
  })

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        p: 4,
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 70%)',
      }}
    >
      {/* Header with Leave Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, width: '100%', maxWidth: 700 }}>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #3a7bd5 0%, #7c4dff 50%, #00d4ff 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 0.5,
            }}
          >
            Dangerous Inclinations
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: 'rgba(255,255,255,0.6)',
              fontWeight: 300,
              letterSpacing: '0.1em',
            }}
          >
            Game Lobby
          </Typography>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<ExitToAppIcon />}
            onClick={leaveLobbyAction}
            sx={{
              borderColor: 'rgba(244, 67, 54, 0.5)',
              '&:hover': {
                borderColor: '#f44336',
                bgcolor: 'rgba(244, 67, 54, 0.1)',
              },
            }}
          >
            Leave
          </Button>
        </Box>
      </Box>

      {/* Player Slots */}
      <Paper
        sx={{
          p: 4,
          minWidth: 450,
          maxWidth: 600,
          bgcolor: 'rgba(22, 22, 31, 0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(58, 123, 213, 0.2)',
          borderRadius: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Players
          </Typography>
          <Chip
            label={`${lobbyState.players.length}/${lobbyState.maxPlayers}`}
            size="small"
            sx={{
              bgcolor: 'rgba(58, 123, 213, 0.2)',
              color: '#3a7bd5',
              fontWeight: 600,
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {playerSlots.map((player, index) => {
            const playerColor = PLAYER_COLORS[index % PLAYER_COLORS.length]
            return (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  borderRadius: 2,
                  bgcolor: player ? `${playerColor}15` : 'rgba(255,255,255,0.03)',
                  border: '1px solid',
                  borderColor: player ? `${playerColor}40` : 'rgba(255,255,255,0.08)',
                  transition: 'all 0.2s ease',
                  ...(player && {
                    '&:hover': {
                      bgcolor: `${playerColor}20`,
                      borderColor: `${playerColor}60`,
                    },
                  }),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {player ? (
                    <>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          bgcolor: `${playerColor}30`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {player.isBot ? (
                          <SmartToyIcon sx={{ color: playerColor, fontSize: 20 }} />
                        ) : (
                          <PersonIcon sx={{ color: playerColor, fontSize: 20 }} />
                        )}
                      </Box>
                      <Box>
                        <Typography
                          sx={{
                            color: playerColor,
                            fontWeight: 600,
                            fontSize: '0.95rem',
                          }}
                        >
                          {player.playerName}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'rgba(255,255,255,0.4)' }}
                        >
                          {player.isBot ? 'AI Player' : 'Human'}
                        </Typography>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          bgcolor: 'rgba(255,255,255,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px dashed rgba(255,255,255,0.15)',
                        }}
                      >
                        <PersonIcon sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 20 }} />
                      </Box>
                      <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                        Empty Slot
                      </Typography>
                    </>
                  )}
                </Box>

                {/* Remove bot button */}
                {player?.isBot && (
                  <IconButton
                    size="small"
                    onClick={() => removeBotFromLobby(player.playerId)}
                    sx={{
                      color: 'rgba(244, 67, 54, 0.7)',
                      '&:hover': {
                        bgcolor: 'rgba(244, 67, 54, 0.1)',
                        color: '#f44336',
                      },
                    }}
                  >
                    <RemoveIcon />
                  </IconButton>
                )}
              </Box>
            )
          })}
        </Box>

        {/* Add Bot Button */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => addBotToLobby()}
            disabled={lobbyState.players.length >= lobbyState.maxPlayers}
            sx={{
              borderColor: 'rgba(58, 123, 213, 0.5)',
              color: '#3a7bd5',
              px: 3,
              '&:hover': {
                borderColor: '#3a7bd5',
                bgcolor: 'rgba(58, 123, 213, 0.1)',
              },
              '&.Mui-disabled': {
                borderColor: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.3)',
              },
            }}
          >
            Add Bot ({botCount}/5)
          </Button>
        </Box>
      </Paper>

      {/* Start Game Button */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          size="large"
          onClick={startGame}
          disabled={!startStatus.canStart}
          startIcon={<PlayArrowIcon />}
          sx={{
            px: 6,
            py: 1.5,
            fontSize: '1.1rem',
            fontWeight: 600,
            background: startStatus.canStart
              ? 'linear-gradient(135deg, #3a7bd5 0%, #7c4dff 100%)'
              : undefined,
            boxShadow: startStatus.canStart
              ? '0 4px 20px rgba(58, 123, 213, 0.4)'
              : 'none',
            '&:hover': {
              background: 'linear-gradient(135deg, #4a8be5 0%, #8c5dff 100%)',
              boxShadow: '0 6px 24px rgba(58, 123, 213, 0.5)',
            },
            '&.Mui-disabled': {
              bgcolor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.3)',
            },
          }}
        >
          Start Game
        </Button>
        {!startStatus.canStart && startStatus.reason && (
          <Typography
            variant="body2"
            sx={{
              color: '#fb8c00',
              bgcolor: 'rgba(251, 140, 0, 0.1)',
              px: 2,
              py: 0.5,
              borderRadius: 1,
            }}
          >
            {startStatus.reason}
          </Typography>
        )}
      </Box>

      {/* Instructions */}
      <Paper
        sx={{
          p: 3,
          maxWidth: 500,
          bgcolor: 'rgba(22, 22, 31, 0.6)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}
          align="center"
        >
          Add bots to fill player slots. You need at least 2 players to start. Each player will
          receive 3 missions: 1 destroy mission and 2 cargo delivery missions. First to complete all
          3 missions wins!
        </Typography>
      </Paper>
    </Box>
  )
}
