import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, CircularProgress, Typography, TextField, Button, Paper } from '@mui/material'
import { PlayerProvider, usePlayer } from './context/PlayerContext'
import { WebSocketProvider } from './context/WebSocketContext'
import { LobbyProvider, useLobby } from './context/LobbyContext'
import { GameProvider } from './context/GameContext'
import { GameBoard } from './components/GameBoard'
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
import { useState } from 'react'

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
 * Player name setup screen - shown if player hasn't set a custom name yet
 */
function PlayerNameSetup() {
  const { playerName, setPlayerName } = usePlayer()
  const { isRestoringSession, phase } = useLobby()
  const [name, setName] = useState(playerName)
  const [ready, setReady] = useState(false)

  const handleSubmit = () => {
    if (name.trim()) {
      setPlayerName(name.trim())
      setReady(true)
    }
  }

  // Show loading while restoring session
  if (isRestoringSession) {
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

  // If session was restored to a non-browser phase, skip name setup
  if (phase !== 'browser') {
    return <AppContent />
  }

  // If player has already confirmed their name, move to lobby
  if (ready) {
    return <AppContent />
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
          onChange={(e) => setName(e.target.value)}
          onKeyPress={(e) => {
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
          disabled={!name.trim()}
          sx={{
            py: 1.5,
            fontSize: '1.1rem',
          }}
        >
          Enter Game
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
          <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        )
      }
      return <LoadoutScreen />

    case 'deployment':
      if (!gameState) {
        // Show loading while game state loads
        return (
          <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        )
      }
      return <DeploymentScreen />

    case 'active':
      if (!gameState || !lobbyState?.gameId) {
        // Show loading while game state loads
        return (
          <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      return <GameEndScreen gameState={gameState} onPlayAgain={returnToLobby} />

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

  // Authenticated - show name setup
  if (isAuthenticated) {
    return <PlayerNameSetup />
  }

  return null
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PlayerProvider>
        <WebSocketProvider>
          <LobbyProvider>
            <AuthenticatedApp />
          </LobbyProvider>
        </WebSocketProvider>
      </PlayerProvider>
    </ThemeProvider>
  )
}

export default App
