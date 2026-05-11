import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, CircularProgress, Typography, TextField, Button, Paper } from '@mui/material'
import { PlayerProvider, usePlayer } from './context/PlayerContext'
import { WebSocketProvider } from './context/WebSocketContext'
import { LobbyProvider, useLobby } from './context/LobbyContext'
import { GameProvider } from './context/GameContext'
import { ControlPanel } from './components/ControlPanel'
import { StatusDisplay } from './components/StatusDisplay'
import { TurnHistoryPanel } from './components/TurnHistoryPanel'
import { LobbyScreen } from './components/LobbyScreen'
import { LobbyBrowser } from './components/LobbyBrowser'
import { LoadoutScreen } from './components/LoadoutScreen'
import { DeploymentScreen } from './components/DeploymentScreen'
import { GameEndScreen } from './components/GameEndScreen'
import { MissionPanel } from './components/MissionPanel'
import { useGame } from './context/GameContext'
import type { GameState } from '@dangerous-inclinations/engine'
import { useCallback, useEffect, useState } from 'react'
import { GameBoard } from './components/GameBoard'
import { ReplayScreen } from './components/ReplayScreen'
import { RecordingsBrowser } from './components/RecordingsBrowser'

type ReplayRoute =
  | { kind: 'app' }
  | { kind: 'replay'; id: string }
  | { kind: 'browser' }
  // `fork`: render the live game tree pointed at a specific gameId
  // (e.g. one minted by `POST /api/games/fork`). Bypasses the lobby
  // flow — no LobbyProvider, no GAME_STARTING handshake; we connect
  // straight into the game's WebSocket room and render ActiveGameScreen.
  | { kind: 'fork'; gameId: string }

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0a0a0f',
      paper: '#16161f',
    },
    text: {
      primary: '#ffffff',
      secondary: '#9090a0',
    },
    primary: {
      main: '#3a7bd5', // Vibrant blue for better visibility
      light: '#5a9bf5',
      dark: '#2a5ba5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#7c4dff', // Purple accent
      light: '#a47fff',
      dark: '#5c2dc0',
      contrastText: '#ffffff',
    },
    error: {
      main: '#f44336',
      light: '#ff7961',
      dark: '#ba000d',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb333',
      dark: '#c77700',
    },
    success: {
      main: '#4caf50',
      light: '#80e27e',
      dark: '#087f23',
    },
    divider: '#3a3a4a',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Don't uppercase button text
          fontWeight: 600,
        },
        contained: {
          boxShadow: '0 2px 8px rgba(58, 123, 213, 0.3)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(58, 123, 213, 0.4)',
          },
        },
        outlined: {
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove default gradient overlay
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#3a3a4a',
            },
            '&:hover fieldset': {
              borderColor: '#5a5a6a',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#3a7bd5',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
})

/**
 * Active game screen - the main gameplay view
 * Wrapped in GameProvider which handles active gameplay
 */
function ActiveGameContent() {
  const { gameState, pendingState } = useGame()
  const activePlayer = gameState.players[gameState.activePlayerIndex]

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
      {/* Status Bar */}
      <StatusDisplay
        players={gameState.players}
        activePlayerIndex={gameState.activePlayerIndex}
        turn={gameState.turn}
        pendingHeat={pendingState.heat}
      />

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%' }}>
        {/* Left sidebar - Turn History */}
        <TurnHistoryPanel defaultExpanded={true} />

        {/* Center - Game Board */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GameBoard
              pendingFacing={pendingState.facing}
              pendingMovement={pendingState.movement}
            />
          </Box>
        </Box>

        {/* Right sidebar - Controls + Missions */}
        <Box
          sx={{
            minWidth: 300,
            maxWidth: 400,
            width: '25%',
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 2,
          }}
        >
          {/* Mission Panel - only show if player has missions */}
          {activePlayer && activePlayer.missions.length > 0 && (
            <MissionPanel player={activePlayer} allPlayers={gameState.players} />
          )}
          <ControlPanel player={activePlayer} allPlayers={gameState.players} />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Active game screen wrapper - provides GameContext for active gameplay
 */
function ActiveGameScreen({
  initialGameState,
  gameId,
  onGameStateChange,
}: {
  initialGameState: GameState
  gameId: string
  onGameStateChange: (state: GameState) => void
}) {
  return (
    <GameProvider
      initialGameState={initialGameState}
      gameId={gameId}
      onGameStateChange={onGameStateChange}
    >
      <ActiveGameContent />
    </GameProvider>
  )
}

/**
 * Loading screen while restoring session
 */
function SessionLoading() {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
      }}
    >
      <CircularProgress size={60} />
      <Typography variant="h6" color="text.secondary">
        Restoring session...
      </Typography>
    </Box>
  )
}

/**
 * App router - decides which screen to show based on session state
 * Show name setup only for newly created players (not restored from server)
 */
function AppRouter() {
  const { isNewPlayer } = usePlayer()
  const { isRestoringSession } = useLobby()

  // Show loading while restoring session
  if (isRestoringSession) {
    return <SessionLoading />
  }

  // If player was just created (no existing ID in localStorage or server didn't know their ID),
  // show name setup. Otherwise, go directly to content.
  if (isNewPlayer) {
    return <PlayerNameSetup />
  }

  return <AppContent />
}

/**
 * Player name setup screen - shown only for newly created players
 */
function PlayerNameSetup() {
  const { playerName, setPlayerName, clearNewPlayerFlag } = usePlayer()
  const [name, setName] = useState(playerName)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (name.trim() && !saving) {
      setSaving(true)
      await setPlayerName(name.trim())
      clearNewPlayerFlag() // This will cause AppRouter to show AppContent
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 5,
          maxWidth: 450,
          width: '90%',
          textAlign: 'center',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            mb: 1,
            background: 'linear-gradient(135deg, #3a7bd5 0%, #7c4dff 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Dangerous Inclinations
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          Tactical Space Combat
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Enter your player name to begin
        </Typography>
        <TextField
          fullWidth
          label="Player Name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyPress={e => {
            if (e.key === 'Enter') {
              handleSubmit()
            }
          }}
          autoFocus
          sx={{ mb: 3 }}
          variant="outlined"
        />
        <Button
          fullWidth
          variant="contained"
          color="primary"
          size="large"
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          sx={{
            py: 1.5,
            fontSize: '1.1rem',
          }}
        >
          {saving ? <CircularProgress size={24} color="inherit" /> : 'Enter Game'}
        </Button>
      </Paper>
    </Box>
  )
}

/**
 * Main app content router - routes to appropriate screen based on phase
 */
function AppContent() {
  const { phase, lobbyState, gameState, returnToLobby, joinLobby } = useLobby()

  // Handle game state changes from GameProvider
  const handleGameStateChange = (newState: GameState) => {
    // Check if game has ended
    if (newState.phase === 'ended') {
      // Game state is managed internally, GameEndScreen will read from GameProvider
    }
  }

  // Route based on phase
  switch (phase) {
    case 'browser':
      return <LobbyBrowser onLobbyJoined={joinLobby} />

    case 'lobby':
      if (!lobbyState) return null
      return <LobbyScreen />

    case 'loadout':
      if (!gameState) {
        // Show loading while game state loads
        return (
          <Box
            sx={{
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress />
          </Box>
        )
      }
      return <LoadoutScreen />

    case 'deployment':
      if (!gameState) {
        // Show loading while game state loads
        return (
          <Box
            sx={{
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress />
          </Box>
        )
      }
      return <DeploymentScreen />

    case 'active':
      if (!gameState || !lobbyState?.gameId) {
        // Show loading while game state loads
        return (
          <Box
            sx={{
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress />
          </Box>
        )
      }
      return (
        <ActiveGameScreen
          initialGameState={gameState}
          gameId={lobbyState.gameId}
          onGameStateChange={handleGameStateChange}
        />
      )

    case 'ended':
      if (!gameState) return null
      return (
        <GameEndScreen
          gameState={gameState}
          gameId={lobbyState?.gameId}
          onPlayAgain={returnToLobby}
        />
      )

    default:
      return null
  }
}

/**
 * App content with player authentication
 */
function AuthenticatedApp() {
  const { isLoading, error, isAuthenticated } = usePlayer()

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Connecting to server...
        </Typography>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, maxWidth: 400 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Connection Error
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {error}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Please make sure the server is running and try refreshing the page.
          </Typography>
        </Paper>
      </Box>
    )
  }

  // Authenticated - route to appropriate screen
  if (isAuthenticated) {
    return <AppRouter />
  }

  return null
}

/**
 * Read replay routing flags off the URL. We use plain query params (instead of
 * a full router) to keep the dependency surface small.
 *   ?replay=<id>     → load that recording into ReplayScreen
 *   ?recordings=1    → show the recordings browser
 */
function useReplayRoute(): { route: ReplayRoute; goTo: (next: ReplayRoute) => void } {
  const [route, setRoute] = useState<ReplayRoute>(() => parseReplayRoute(window.location.search))

  useEffect(() => {
    const handler = () => setRoute(parseReplayRoute(window.location.search))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const goTo = useCallback((next: ReplayRoute) => {
    const params = new URLSearchParams(window.location.search)
    params.delete('replay')
    params.delete('recordings')
    params.delete('fork')
    if (next.kind === 'replay') params.set('replay', next.id)
    if (next.kind === 'browser') params.set('recordings', '1')
    if (next.kind === 'fork') params.set('fork', next.gameId)
    const search = params.toString()
    const url = search ? `?${search}` : window.location.pathname
    window.history.pushState(null, '', url)
    setRoute(next)
  }, [])

  return { route, goTo }
}

function parseReplayRoute(search: string): ReplayRoute {
  const params = new URLSearchParams(search)
  const replay = params.get('replay')
  if (replay) return { kind: 'replay', id: replay }
  if (params.get('recordings') === '1') return { kind: 'browser' }
  const fork = params.get('fork')
  if (fork) return { kind: 'fork', gameId: fork }
  return { kind: 'app' }
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RootRouter />
    </ThemeProvider>
  )
}

function RootRouter() {
  const { route, goTo } = useReplayRoute()

  if (route.kind === 'replay') {
    return <ReplayScreen recordingId={route.id} onExit={() => goTo({ kind: 'app' })} />
  }

  if (route.kind === 'browser') {
    return (
      <RecordingsBrowser
        onOpen={(id) => goTo({ kind: 'replay', id })}
        onExit={() => goTo({ kind: 'app' })}
      />
    )
  }

  if (route.kind === 'fork') {
    return (
      <PlayerProvider>
        <WebSocketProvider>
          <ForkedGameRoot
            gameId={route.gameId}
            onExit={() => goTo({ kind: 'app' })}
          />
        </WebSocketProvider>
      </PlayerProvider>
    )
  }

  return (
    <PlayerProvider>
      <WebSocketProvider>
        <LobbyProvider>
          <AuthenticatedApp />
        </LobbyProvider>
      </WebSocketProvider>
    </PlayerProvider>
  )
}

/**
 * Render an existing game by id, bypassing the lobby flow. Used by
 * `?fork=<gameId>` URLs after `POST /api/games/fork` mints a new game
 * out of a recording snapshot. Fetches the game state once on mount and
 * hands it to ActiveGameScreen, which manages its own WS subscription
 * and animation queue from there.
 */
function ForkedGameRoot({
  gameId,
  onExit,
}: {
  gameId: string
  onExit: () => void
}) {
  const { isLoading: playerLoading } = usePlayer()
  const [initialState, setInitialState] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (playerLoading) return
    let cancelled = false
    import('./api/game').then(({ getGameState }) =>
      getGameState(gameId)
        .then((state) => {
          if (!cancelled) setInitialState(state)
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        }),
    )
    return () => {
      cancelled = true
    }
  }, [gameId, playerLoading])

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Failed to load forked game: {error}</Typography>
        <Button onClick={onExit} sx={{ mt: 2 }}>
          Back
        </Button>
      </Box>
    )
  }

  if (!initialState || playerLoading) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  // The forked game has phase already set ("active" most often) — reuse
  // ActiveGameScreen for the live tree. The end-of-game transition is
  // handled by GameContext via TURN_EXECUTED, just like a normal game.
  if (initialState.phase === 'ended') {
    return (
      <GameEndScreen gameState={initialState} gameId={gameId} onPlayAgain={onExit} />
    )
  }

  return (
    <ActiveGameScreen
      initialGameState={initialState}
      gameId={gameId}
      onGameStateChange={(newState) => {
        // Once a forked game ends, swap to the end screen on the next
        // render. ActiveGameScreen unmounts and we route through the
        // phase=ended branch above on the next state arrival.
        if (newState.phase === 'ended') setInitialState(newState)
      }}
    />
  )
}

export default App
