import { Box, Typography, Button, Paper, IconButton, Chip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { useLobby } from '../context/LobbyContext'

const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

export function LobbyScreen() {
  const { lobbyState, addBotToLobby, removeBotFromLobby, startGame, canStart } = useLobby()

  if (!lobbyState) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography>Loading lobby...</Typography>
      </Box>
    )
  }

  const startStatus = canStart()
  const filledSlots = lobbyState.playerSlots.filter(slot => slot.playerId !== null)
  const botCount = filledSlots.filter(slot => slot.isBot).length

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
      }}
    >
      {/* Title */}
      <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 2 }}>
        Dangerous Inclinations
      </Typography>

      <Typography variant="h5" color="text.secondary" sx={{ mb: 4 }}>
        Game Lobby
      </Typography>

      {/* Player Slots */}
      <Paper
        sx={{
          p: 3,
          minWidth: 400,
          maxWidth: 600,
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          Players ({filledSlots.length}/{lobbyState.maxPlayers})
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {lobbyState.playerSlots.map((slot, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                borderRadius: 1,
                bgcolor: slot.playerId ? 'action.selected' : 'action.hover',
                border: '1px solid',
                borderColor: slot.playerId
                  ? PLAYER_COLORS[index % PLAYER_COLORS.length]
                  : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {slot.playerId ? (
                  <>
                    {slot.isBot ? (
                      <SmartToyIcon sx={{ color: PLAYER_COLORS[index % PLAYER_COLORS.length] }} />
                    ) : (
                      <PersonIcon sx={{ color: PLAYER_COLORS[index % PLAYER_COLORS.length] }} />
                    )}
                    <Typography
                      sx={{
                        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
                        fontWeight: 'medium',
                      }}
                    >
                      {slot.playerName}
                    </Typography>
                    {slot.isReady && (
                      <Chip label="Ready" size="small" color="success" variant="outlined" />
                    )}
                  </>
                ) : (
                  <Typography color="text.secondary">Empty Slot</Typography>
                )}
              </Box>

              {/* Remove bot button */}
              {slot.isBot && (
                <IconButton
                  size="small"
                  onClick={() => removeBotFromLobby(slot.playerId!)}
                  sx={{ color: 'error.main' }}
                >
                  <RemoveIcon />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>

        {/* Add Bot Button */}
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => addBotToLobby()}
            disabled={filledSlots.length >= lobbyState.maxPlayers}
          >
            Add Bot ({botCount}/5)
          </Button>
        </Box>
      </Paper>

      {/* Start Game Button */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained"
          size="large"
          onClick={startGame}
          disabled={!startStatus.canStart}
          sx={{
            px: 6,
            py: 1.5,
            fontSize: '1.2rem',
          }}
        >
          Start Game
        </Button>
        {!startStatus.canStart && startStatus.reason && (
          <Typography variant="body2" color="warning.main">
            {startStatus.reason}
          </Typography>
        )}
      </Box>

      {/* Instructions */}
      <Paper sx={{ p: 2, maxWidth: 500, bgcolor: 'background.paper' }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Add bots to fill player slots. You need at least 2 players to start. Each player will
          receive 3 missions: 1 destroy mission and 2 cargo delivery missions. First to complete all
          3 missions wins!
        </Typography>
      </Paper>
    </Box>
  )
}
