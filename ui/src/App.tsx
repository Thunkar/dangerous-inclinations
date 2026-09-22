/**
 * App root: theme, identity, sockets, and which screen is on the table.
 *
 * The video game is one section of a site now (`site/routes.ts`): `/` is the
 * landing page, `/tools` the things a real table wants and `/card` the card it
 * prints, and none of those three need a player, a socket or a server. `/play`
 * is everything that was here before, and the three query flags still decide
 * the route from any path, because a fork, a seat printed by `yarn seat` and
 * `scripts/shot.mjs` all hand out `?game=<id>`:
 *   ?recordings=1   the list of finished games
 *   ?replay=<id>    replay one of them
 *   ?game=<id>      drop straight into a live game (forks land here)
 */
import { useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material'
import { theme, TABLE } from './theme'
import { BoardModeProvider } from './context/BoardModeContext'
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
import { NavigationProvider, useNavigation } from './context/NavigationContext'
import { SiteHeader } from './site/SiteChrome'
import { Landing } from './site/Landing'
import { Tools } from './site/Tools'
import { Cheatsheet } from './site/Cheatsheet'

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

/**
 * A screen of /play before there is a table: the site's bar stays over it, so
 * somebody who arrived at /play can always get back out, whatever the server
 * is doing. A table brings its own chrome and takes the whole window.
 */
function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SiteHeader />
      {children}
    </Box>
  )
}

/** The whole window, for the moments around a table. */
function FullScreen({ children }: { children: React.ReactNode }) {
  return <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>{children}</Box>
}

function Loading({ message }: { message: string }) {
  return (
    <Box
      sx={{
        flex: 1,
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
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
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
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
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
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
          sx={{ mb: 2 }}
        />
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={submit}
          disabled={!name.trim() || saving}
        >
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
function GameScreens({
  headerRight,
  onLeave,
}: {
  headerRight?: React.ReactNode
  onLeave?: () => void
}) {
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

function LiveGame({
  gameId,
  headerRight,
  onLeave,
}: {
  gameId: string
  headerRight?: React.ReactNode
  onLeave?: () => void
}) {
  return (
    <GameProvider
      gameId={gameId}
      fallback={
        <FullScreen>
          <Loading message="Setting up the table…" />
        </FullScreen>
      }
      renderError={message => (
        <SiteFrame>
          <Failure message={message} />
        </SiteFrame>
      )}
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

  if (isRestoringSession) {
    return (
      <SiteFrame>
        <Loading message="Finding your seat…" />
      </SiteFrame>
    )
  }

  switch (phase) {
    case 'browser':
      return (
        <SiteFrame>
          <LobbyBrowser onLobbyJoined={joinLobby} onOpenRecordings={onOpenRecordings} />
        </SiteFrame>
      )
    case 'lobby':
      return <LobbyScreen />
    case 'game':
      if (!gameId) {
        return (
          <FullScreen>
            <Loading message="Waiting for the game to start…" />
          </FullScreen>
        )
      }
      return (
        <LiveGame gameId={gameId} headerRight={<AbandonGameButton />} onLeave={returnToLobby} />
      )
  }
}

function AuthenticatedApp({ onOpenRecordings }: { onOpenRecordings: () => void }) {
  const { isLoading, error, isAuthenticated, isNewPlayer, canRetry, retry } = usePlayer()

  if (isLoading) {
    return (
      <SiteFrame>
        <Loading message="Connecting to the server…" />
      </SiteFrame>
    )
  }
  // A transient failure keeps the saved seat: retry in place rather than reloading.
  if (error) {
    return (
      <SiteFrame>
        <Failure message={error} onRetry={canRetry ? retry : () => window.location.reload()} />
      </SiteFrame>
    )
  }
  if (!isAuthenticated) return null
  if (isNewPlayer) {
    return (
      <SiteFrame>
        <PlayerNameSetup />
      </SiteFrame>
    )
  }

  return (
    <LobbyProvider>
      <LobbyFlow onOpenRecordings={onOpenRecordings} />
    </LobbyProvider>
  )
}

// ---------------------------------------------------------------------------

function RootRouter() {
  const { route, goTo } = useNavigation()

  switch (route.kind) {
    case 'landing':
      return <Landing />

    case 'tools':
      return <Tools tool={route.tool} />

    case 'card':
      return <Cheatsheet />

    case 'replay':
      return <ReplayScreen recordingId={route.id} onExit={() => goTo({ kind: 'recordings' })} />

    case 'recordings':
      return (
        <RecordingsBrowser
          onOpen={id => goTo({ kind: 'replay', id })}
          onExit={() => goTo({ kind: 'play' })}
        />
      )

    case 'game':
      return (
        <PlayerProvider>
          <WebSocketProvider>
            <LiveGame gameId={route.gameId} onLeave={() => goTo({ kind: 'play' })} />
          </WebSocketProvider>
        </PlayerProvider>
      )

    case 'play':
      return (
        <PlayerProvider>
          <WebSocketProvider>
            <AuthenticatedApp onOpenRecordings={() => goTo({ kind: 'recordings' })} />
          </WebSocketProvider>
        </PlayerProvider>
      )
  }
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Which renderer draws the board is a preference of the whole app: a
          replay and a live table both read it. */}
      <BoardModeProvider>
        <NavigationProvider>
          <RootRouter />
        </NavigationProvider>
      </BoardModeProvider>
    </ThemeProvider>
  )
}
