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
import { MAX_PLAYERS, MIN_PLAYERS, fill } from '@dangerous-inclinations/engine'
import { createLobby, joinLobby, listLobbies } from '../../api/lobby'
import { usePlayer } from '../../context/PlayerContext'
import { useWebSocket } from '../../context/WebSocketContext'
import { Panel, SectionLabel } from '../common/Panel'
import { TABLE } from '../../design/tokens'
import { SCREENS } from '../../text/screens'

const S = SCREENS.lobbyBrowser

interface LobbyBrowserProps {
  onLobbyJoined: (lobbyId: string) => void
  onOpenRecordings: () => void
  /** Why the seat this browser had could not be restored, shown until dismissed. */
  notice?: string | null
}

function isGlobalMessage(data: unknown): data is GlobalSocketMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string'
  )
}

/** Table sizes on offer: whatever the rules allow (RULES §Setup). */
const SEAT_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)

export function LobbyBrowser({ onLobbyJoined, onOpenRecordings, notice }: LobbyBrowserProps) {
  const { playerName, setPlayerName } = usePlayer()
  const { client, connect } = useWebSocket()
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shownNotice, setShownNotice] = useState<string | null>(notice ?? null)
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
      setError(e instanceof Error ? e.message : S.unreachable)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the lobby list from the server on mount
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!client) return
    const unsubscribe = client.onMessage('global', data => {
      if (!isGlobalMessage(data)) return
      if (
        data.type === 'LOBBY_CREATED' ||
        data.type === 'LOBBY_DELETED' ||
        data.type === 'LOBBY_UPDATED'
      ) {
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
        newName.trim() || fill(S.defaultTableName, { name: playerName }),
        newMax,
        newPassword || undefined
      )
      await joinLobby(lobby.lobbyId, newPassword || undefined)
      setCreateOpen(false)
      onLobbyJoined(lobby.lobbyId)
    } catch (e) {
      setError(e instanceof Error ? e.message : S.createFailed)
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
      setError(e instanceof Error ? e.message : S.joinFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, gap: 2 }}
    >
      <Typography variant="h3" sx={{ color: TABLE.ink, mt: 3 }}>
        {S.title}
      </Typography>
      <Typography variant="body2" sx={{ color: TABLE.inkSoft, mb: 1 }}>
        {fill(S.lede, { min: MIN_PLAYERS, max: MAX_PLAYERS })}
      </Typography>

      <Panel
        title={S.panel}
        sx={{ width: '100%', maxWidth: 760 }}
        action={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Tooltip title={S.rename}>
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
            <Tooltip title={S.recordings}>
              <IconButton size="small" onClick={onOpenRecordings}>
                <VideoLibraryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={S.refresh}>
              <IconButton size="small" onClick={refresh}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              {S.newTable}
            </Button>
          </Box>
        }
      >
        <SectionLabel>{fill(S.sittingAs, { name: playerName })}</SectionLabel>
        {shownNotice && (
          <Alert severity="info" sx={{ my: 1 }} onClose={() => setShownNotice(null)}>
            {shownNotice}
          </Alert>
        )}
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
            {S.empty}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
            {lobbies.map(lobby => (
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
                <Typography sx={{ fontWeight: 700, color: TABLE.ink }}>
                  {lobby.lobbyName}
                </Typography>
                {lobby.hasPassword && <LockIcon sx={{ fontSize: 15, color: TABLE.inkSoft }} />}
                <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                  {fill(S.seats, { current: lobby.currentPlayers, max: lobby.maxPlayers })}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {lobby.seated ? (
                  // Your own table: back to your seat, game or no game.
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => onLobbyJoined(lobby.lobbyId)}
                  >
                    {S.rejoin}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy || lobby.gameStarted || lobby.currentPlayers >= lobby.maxPlayers}
                    onClick={() => (lobby.hasPassword ? setJoinTarget(lobby) : doJoin(lobby))}
                  >
                    {lobby.gameStarted ? S.inPlay : S.sitDown}
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Panel>

      {/* Create */}
      <Dialog
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{S.create.title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label={S.create.name}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={fill(S.defaultTableName, { name: playerName })}
            autoFocus
            fullWidth
          />
          <Select
            value={newMax}
            onChange={e => setNewMax(Number(e.target.value))}
            fullWidth
            size="small"
          >
            {SEAT_COUNTS.map(n => (
              <MenuItem key={n} value={n}>
                {fill(S.create.players, { count: n })}
              </MenuItem>
            ))}
          </Select>
          <TextField
            label={S.create.password}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={busy}>
            {S.create.cancel}
          </Button>
          <Button variant="contained" onClick={doCreate} disabled={busy}>
            {S.create.create}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Join with password */}
      <Dialog
        open={joinTarget !== null}
        onClose={() => !busy && setJoinTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{fill(S.join.title, { name: joinTarget?.lobbyName ?? '' })}</DialogTitle>
        <DialogContent>
          <TextField
            label={S.join.password}
            type="password"
            value={joinPassword}
            onChange={e => setJoinPassword(e.target.value)}
            autoFocus
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinTarget(null)} disabled={busy}>
            {S.join.cancel}
          </Button>
          <Button
            variant="contained"
            onClick={() => joinTarget && doJoin(joinTarget, joinPassword)}
            disabled={busy}
          >
            {S.join.sitDown}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename */}
      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{S.name.title}</DialogTitle>
        <DialogContent>
          <TextField
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            autoFocus
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameOpen(false)}>{S.name.cancel}</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (draftName.trim()) await setPlayerName(draftName.trim())
              setNameOpen(false)
            }}
          >
            {S.name.save}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
