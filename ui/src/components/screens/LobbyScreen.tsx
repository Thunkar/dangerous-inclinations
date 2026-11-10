/**
 * The table before the game: who is sitting down, bots you have pulled up to
 * the empty seats, and the button that deals the cards.
 */
import { Alert, Box, Button, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PsychologyIcon from '@mui/icons-material/Psychology'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useLobby } from '../../context/LobbyContext'
import { usePlayer } from '../../context/PlayerContext'
import { Panel } from '../common/Panel'
import { getPlayerColor } from '../../utils/playerColors'
import { agentLabel } from '../../utils/agents'
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { SCREENS } from '../../text/screens'

const S = SCREENS.lobby

export function LobbyScreen() {
  const {
    lobbyState,
    addBotToLobby,
    removeBotFromLobby,
    startGame,
    canStart,
    leaveLobbyAction,
    error,
  } = useLobby()
  const { playerId } = usePlayer()

  if (!lobbyState) {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ color: TABLE.inkSoft }}>{S.finding}</Typography>
      </Box>
    )
  }

  const start = canStart()
  const seats = Array.from(
    { length: lobbyState.maxPlayers },
    (_, i) => lobbyState.players[i] ?? null
  )
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

      <Panel title={S.seats} sx={{ width: '100%', maxWidth: 560 }}>
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
                border: `1px solid ${TABLE.plateEdge}`,
                bgcolor: seat ? TABLE.plateSunk : 'transparent',
                borderStyle: seat ? 'solid' : 'dashed',
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  bgcolor: seat ? getPlayerColor(index) : 'transparent',
                  border: seat ? 'none' : `1px dashed ${TABLE.plateEdge}`,
                }}
              />
              {seat ? (
                seat.isBot ? (
                  <SmartToyIcon sx={{ fontSize: 17, color: TABLE.inkSoft }} />
                ) : seat.agent ? (
                  <PsychologyIcon sx={{ fontSize: 17, color: TABLE.inkSoft }} />
                ) : (
                  <PersonIcon sx={{ fontSize: 17, color: TABLE.inkSoft }} />
                )
              ) : null}
              <Typography
                sx={{ color: seat ? TABLE.ink : TABLE.inkSoft, fontWeight: seat ? 700 : 400 }}
              >
                {seat ? seat.playerName : S.emptySeat}
                {seat?.playerId === playerId ? S.you : ''}
                {seat?.playerId === lobbyState.hostPlayerId ? S.host : ''}
              </Typography>
              {seat?.agent && (
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.72rem',
                    color: TABLE.inkSoft,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {agentLabel(seat.agent)}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              {isHost && seat?.isBot && (
                <Tooltip title={S.removeBot}>
                  <IconButton size="small" onClick={() => removeBotFromLobby(seat.playerId)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {isHost && !seat && (
                <Tooltip title={S.addBot}>
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
            {S.leave}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={start.reason ?? S.startHint}>
            <span>
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                disabled={!start.canStart}
                onClick={startGame}
              >
                {S.start}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Panel>
    </Box>
  )
}
