/**
 * The table list: which games are being set up, and the door to make one.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import LockIcon from '@mui/icons-material/Lock'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import type { GlobalSocketMessage, LobbyListItem } from '../../api/types'
import { MAX_PLAYERS, MIN_PLAYERS } from '@dangerous-inclinations/engine'
import { createLobby, joinLobby, listLobbies } from '../../api/lobby'
import { usePlayer } from '../../context/PlayerContext'
import { useWebSocket } from '../../context/WebSocketContext'
import { Panel, SectionLabel } from '../common/Panel'
import { TABLE } from '../../theme'

interface LobbyBrowserProps {
  onLobbyJoined: (lobbyId: string) => void
  onOpenRecordings: () => void
}

function isGlobalMessage(data: unknown): data is GlobalSocketMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string'
}

/** Table sizes on offer: whatever the rules allow (RULES §Setup). */
const SEAT_COUNTS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i
)

export function LobbyBrowser({ onLobbyJoined, onOpenRecordings }: LobbyBrowserProps) {
  const { playerName, setPlayerName } = usePlayer()
  const { client, connect } = useWebSocket()
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMax, setNewMax] = useState<number>(SEAT_COUNTS[Math.floor(SEAT_COUNTS.length / 2)])
  const [newPassword, setNewPassword] = useState('')

  const [joinTarget, setJoinTarget] = useState<LobbyListItem | null>(null)
  const [joinPassword, setJoinPassword] = useState('')

  const [nameOpen, setNameOpen] = useState(false)
  const [draftName, setDraftName] = useState(playerName)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setLobbies(await listLobbies())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!client) return
    const unsubscribe = client.onMessage('global', (data) => {
      if (!isGlobalMessage(data)) return
      if (data.type === 'LOBBY_CREATED' || data.type === 'LOBBY_DELETED' || data.type === 'LOBBY_UPDATED') {
        refresh()
      }
    })
    connect('global').catch(() => {
      /* the list still refreshes on demand */
    })
    return unsubscribe
  }, [client, connect, refresh])

  const doCreate = async () => {
    setBusy(true)
    try {
      const lobby = await createLobby(
        newName.trim() || `${playerName}'s table`,
        newMax,
        newPassword || undefined,
      )
      await joinLobby(lobby.lobbyId, newPassword || undefined)
      setCreateOpen(false)
      onLobbyJoined(lobby.lobbyId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the table')
    } finally {
      setBusy(false)
    }
  }

  const doJoin = async (lobby: LobbyListItem, password?: string) => {
    setBusy(true)
    try {
      await joinLobby(lobby.lobbyId, password)
      setJoinTarget(null)
      setJoinPassword('')
      onLobbyJoined(lobby.lobbyId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sit down at that table')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, gap: 2 }}>
      <Typography variant="h3" sx={{ color: TABLE.ink, mt: 3 }}>
        Dangerous Inclinations
      </Typography>
      <Typography variant="body2" sx={{ color: TABLE.inkSoft, mb: 1 }}>
        Orbital manoeuvre, heat management and hidden objectives for {MIN_PLAYERS}–{MAX_PLAYERS} players.
      </Typography>

      <Panel
        title="Tables"
        sx={{ width: '100%', maxWidth: 760 }}
        action={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Tooltip title="Change your name">
              <IconButton
                size="small"
                onClick={() => {
                  setDraftName(playerName)
                  setNameOpen(true)
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Watch a recorded game">
              <IconButton size="small" onClick={onOpenRecordings}>
                <VideoLibraryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={refresh}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              New table
            </Button>
          </Box>
        }
      >
        <SectionLabel>Sitting as {playerName}</SectionLabel>
        {error && (
          <Alert severity="error" sx={{ my: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {loading && lobbies.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={22} />
          </Box>
        ) : lobbies.length === 0 ? (
          <Typography variant="body2" sx={{ color: TABLE.inkSoft, py: 2 }}>
            No tables yet. Make one and add a bot or two.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
            {lobbies.map((lobby) => (
              <Box
                key={lobby.lobbyId}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 0.75,
                  border: `1px solid ${TABLE.plateEdge}`,
                  bgcolor: TABLE.plateSunk,
                }}
              >
                <Typography sx={{ fontWeight: 700, color: TABLE.ink }}>{lobby.lobbyName}</Typography>
                {lobby.hasPassword && <LockIcon sx={{ fontSize: 15, color: TABLE.inkSoft }} />}
                <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                  {lobby.currentPlayers}/{lobby.maxPlayers} seats
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || lobby.gameStarted || lobby.currentPlayers >= lobby.maxPlayers}
                  onClick={() => (lobby.hasPassword ? setJoinTarget(lobby) : doJoin(lobby))}
                >
                  {lobby.gameStarted ? 'in play' : 'Sit down'}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Panel>

      {/* Create */}
      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New table</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Table name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`${playerName}'s table`}
            autoFocus
            fullWidth
          />
          <Select value={newMax} onChange={(e) => setNewMax(Number(e.target.value))} fullWidth size="small">
            {SEAT_COUNTS.map((n) => (
              <MenuItem key={n} value={n}>
                {n} players
              </MenuItem>
            ))}
          </Select>
          <TextField
            label="Password (optional)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={doCreate} disabled={busy}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Join with password */}
      <Dialog open={joinTarget !== null} onClose={() => !busy && setJoinTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Join {joinTarget?.lobbyName}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            label="Password"
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            autoFocus
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinTarget(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => joinTarget && doJoin(joinTarget, joinPassword)}
            disabled={busy}
          >
            Sit down
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename */}
      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Your name</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (draftName.trim()) await setPlayerName(draftName.trim())
              setNameOpen(false)
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
