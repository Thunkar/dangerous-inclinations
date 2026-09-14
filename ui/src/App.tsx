/**
 * App root: theme, identity, sockets, and which screen is on the table.
 *
 * Routing is four query flags rather than a router dependency:
 *   ?recordings=1   the list of finished games
 *   ?replay=<id>    replay one of them
 *   ?game=<id>      drop straight into a live game (forks land here)
 *   (none)          lobby browser → lobby → game
 */
import { useCallback, useEffect, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material'
import { theme, TABLE } from './theme'
import { PlayerProvider, usePlayer } from './context/PlayerContext'
import { WebSocketProvider } from './context/WebSocketContext'
import { LobbyProvider, useLobby } from './context/LobbyContext'
import { GameProvider, useGame } from './context/GameContext'
import { LobbyBrowser } from './components/screens/LobbyBrowser'
import { LobbyScreen } from './components/screens/LobbyScreen'
import { LoadoutScreen } from './components/screens/LoadoutScreen'
import { DeploymentScreen } from './components/screens/DeploymentScreen'
import { GameEndScreen } from './components/screens/GameEndScreen'
import { ReplayScreen } from './components/screens/ReplayScreen'
import { RecordingsBrowser } from './components/screens/RecordingsBrowser'
import { TableRoot } from './components/table/TableRoot'
import { AbandonGameButton } from './components/AbandonGameButton'

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

type Route =
  | { kind: 'app' }
  | { kind: 'recordings' }
  | { kind: 'replay'; id: string }
  | { kind: 'game'; gameId: string }

function parseRoute(search: string): Route {
  const params = new URLSearchParams(search)
  const replay = params.get('replay')
  if (replay) return { kind: 'replay', id: replay }
  if (params.get('recordings') === '1') return { kind: 'recordings' }
  const game = params.get('game') ?? params.get('fork')
  if (game) return { kind: 'game', gameId: game }
  return { kind: 'app' }
}

function useRoute(): { route: Route; goTo: (next: Route) => void } {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.search))

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goTo = useCallback((next: Route) => {
    const params = new URLSearchParams()
    if (next.kind === 'replay') params.set('replay', next.id)
    if (next.kind === 'recordings') params.set('recordings', '1')
    if (next.kind === 'game') params.set('game', next.gameId)
    const search = params.toString()
    window.history.pushState(null, '', search ? `?${search}` : window.location.pathname)
    setRoute(next)
  }, [])

  return { route, goTo }
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function Loading({ message }: { message: string }) {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <CircularProgress size={44} />
      <Typography sx={{ color: TABLE.inkSoft }}>{message}</Typography>
    </Box>
  )
}

function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper sx={{ p: 3, maxWidth: 440 }}>
        <Typography variant="h6" color="error" gutterBottom>
          Something went wrong
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {message}
        </Typography>
        {onRetry && (
          <Button variant="contained" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Paper>
    </Box>
  )
}

function PlayerNameSetup() {
  const { playerName, setPlayerName, clearNewPlayerFlag } = usePlayer()
  const [name, setName] = useState(playerName)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    await setPlayerName(name.trim())
    clearNewPlayerFlag()
    setSaving(false)
  }

  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper sx={{ p: 4, maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Dangerous Inclinations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Orbital manoeuvre, heat and hidden objectives. What shall we call you?
        </Typography>
        <TextField
          fullWidth
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
          sx={{ mb: 2 }}
        />
        <Button fullWidth variant="contained" size="large" onClick={submit} disabled={!name.trim() || saving}>
          {saving ? <CircularProgress size={22} color="inherit" /> : 'Sit down'}
        </Button>
      </Paper>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Game screens
// ---------------------------------------------------------------------------

/** Picks the screen for the game's phase. Perspective is always this player. */
function GameScreens({ headerRight, onLeave }: { headerRight?: React.ReactNode; onLeave?: () => void }) {
  const { view } = useGame()

  switch (view.phase) {
    case 'lobby':
    case 'setup':
    case 'loadout':
      return <LoadoutScreen headerRight={headerRight} />
    case 'deployment':
      return <DeploymentScreen headerRight={headerRight} />
    case 'ended':
      return <GameEndScreen onLeave={onLeave} />
    case 'active':
    default:
      return (
        <Box sx={{ height: '100vh', width: '100vw' }}>
          <TableRoot headerRight={headerRight} />
        </Box>
      )
  }
}

function LiveGame({ gameId, headerRight, onLeave }: { gameId: string; headerRight?: React.ReactNode; onLeave?: () => void }) {
  return (
    <GameProvider
      gameId={gameId}
      fallback={<Loading message="Setting up the table…" />}
      renderError={(message) => <Failure message={message} />}
    >
      <GameScreens headerRight={headerRight} onLeave={onLeave} />
    </GameProvider>
  )
}

// ---------------------------------------------------------------------------
// Lobby flow
// ---------------------------------------------------------------------------

function LobbyFlow({ onOpenRecordings }: { onOpenRecordings: () => void }) {
  const { phase, gameId, joinLobby, isRestoringSession, returnToLobby } = useLobby()

  if (isRestoringSession) return <Loading message="Finding your seat…" />

  switch (phase) {
    case 'browser':
      return <LobbyBrowser onLobbyJoined={joinLobby} onOpenRecordings={onOpenRecordings} />
    case 'lobby':
      return <LobbyScreen />
    case 'game':
      if (!gameId) return <Loading message="Waiting for the game to start…" />
      return <LiveGame gameId={gameId} headerRight={<AbandonGameButton />} onLeave={returnToLobby} />
  }
}

function AuthenticatedApp({ onOpenRecordings }: { onOpenRecordings: () => void }) {
  const { isLoading, error, isAuthenticated, isNewPlayer, canRetry, retry } = usePlayer()

  if (isLoading) return <Loading message="Connecting to the server…" />
  // A transient failure keeps the saved seat: retry in place rather than reloading.
  if (error) return <Failure message={error} onRetry={canRetry ? retry : () => window.location.reload()} />
  if (!isAuthenticated) return null
  if (isNewPlayer) return <PlayerNameSetup />

  return (
    <LobbyProvider>
      <LobbyFlow onOpenRecordings={onOpenRecordings} />
    </LobbyProvider>
  )
}

// ---------------------------------------------------------------------------

function RootRouter() {
  const { route, goTo } = useRoute()

  if (route.kind === 'replay') {
    return <ReplayScreen recordingId={route.id} onExit={() => goTo({ kind: 'recordings' })} />
  }

  if (route.kind === 'recordings') {
    return (
      <RecordingsBrowser onOpen={(id) => goTo({ kind: 'replay', id })} onExit={() => goTo({ kind: 'app' })} />
    )
  }

  if (route.kind === 'game') {
    return (
      <PlayerProvider>
        <WebSocketProvider>
          <LiveGame gameId={route.gameId} onLeave={() => goTo({ kind: 'app' })} />
        </WebSocketProvider>
      </PlayerProvider>
    )
  }

  return (
    <PlayerProvider>
      <WebSocketProvider>
        <AuthenticatedApp onOpenRecordings={() => goTo({ kind: 'recordings' })} />
      </WebSocketProvider>
    </PlayerProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RootRouter />
    </ThemeProvider>
  )
}
