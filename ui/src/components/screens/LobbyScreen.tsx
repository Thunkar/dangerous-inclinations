/**
 * The table before the game: who is sitting down, bots you have pulled up to
 * the empty seats, and the button that deals the cards.
 */
import { Alert, Box, Button, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useLobby } from '../../context/LobbyContext'
import { usePlayer } from '../../context/PlayerContext'
import { Panel } from '../common/Panel'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'

export function LobbyScreen() {
  const { lobbyState, addBotToLobby, removeBotFromLobby, startGame, canStart, leaveLobbyAction, error } =
    useLobby()
  const { playerId } = usePlayer()

  if (!lobbyState) {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ color: TABLE.inkSoft }}>Finding the table…</Typography>
      </Box>
    )
  }

  const start = canStart()
  const seats = Array.from({ length: lobbyState.maxPlayers }, (_, i) => lobbyState.players[i] ?? null)
  const isHost = lobbyState.hostPlayerId === playerId

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 3,
      }}
    >
      <Typography variant="h4" sx={{ color: TABLE.ink }}>
        {lobbyState.lobbyName}
      </Typography>

      <Panel title="Seats" sx={{ width: '100%', maxWidth: 560 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
          {seats.map((seat, index) => (
            <Box
              key={seat?.playerId ?? `empty-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.85,
                borderRadius: 1,
                border: `1px solid ${TABLE.plateEdge}`,
                bgcolor: seat ? 'rgba(126,165,205,0.05)' : 'transparent',
                borderStyle: seat ? 'solid' : 'dashed',
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: seat ? getPlayerColor(index) : 'transparent',
                  border: seat ? 'none' : `1px dashed ${TABLE.plateEdge}`,
                }}
              />
              {seat ? (
                seat.isBot ? (
                  <SmartToyIcon sx={{ fontSize: 17, color: TABLE.inkSoft }} />
                ) : (
                  <PersonIcon sx={{ fontSize: 17, color: TABLE.inkSoft }} />
                )
              ) : null}
              <Typography sx={{ color: seat ? TABLE.ink : TABLE.inkSoft, fontWeight: seat ? 700 : 400 }}>
                {seat ? seat.playerName : 'empty seat'}
                {seat?.playerId === playerId ? ' (you)' : ''}
                {seat?.playerId === lobbyState.hostPlayerId ? ' · host' : ''}
              </Typography>
              <Box sx={{ flex: 1 }} />
              {isHost && seat?.isBot && (
                <Tooltip title="Remove this bot">
                  <IconButton size="small" onClick={() => removeBotFromLobby(seat.playerId)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {isHost && !seat && (
                <Tooltip title="Seat a bot here">
                  <IconButton size="small" onClick={() => addBotToLobby()}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Button variant="outlined" startIcon={<ExitToAppIcon />} onClick={leaveLobbyAction}>
            Leave
          </Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={start.reason ?? 'Deal the missions and begin'}>
            <span>
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                disabled={!start.canStart}
                onClick={startGame}
              >
                Start
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Panel>
    </Box>
  )
}
