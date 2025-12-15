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
      default: '#000000',
      paper: '#121212',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
    primary: {
      main: '#343434',
      light: '#4a4a4a',
      dark: '#1a1a1a',
    },
    secondary: {
      main: '#1412b7',
      light: '#3d3bd4',
      dark: '#0d0a8a',
    },
    error: {
      main: '#d40000',
      light: '#ff3333',
      dark: '#9a0000',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb333',
      dark: '#c77700',
    },
    divider: '#4a4a4a',
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
  onGameStateChange,
}: {
  initialGameState: GameState
  onGameStateChange: (state: GameState) => void
}) {
  return (
    <GameProvider initialGameState={initialGameState} onGameStateChange={onGameStateChange}>
      <ActiveGameContent />
    </GameProvider>
  )
}

/**
 * Player name setup screen - shown if player hasn't set a custom name yet
 */
function PlayerNameSetup() {
  const { playerName, setPlayerName } = usePlayer()
  const [name, setName] = useState(playerName)
  const [ready, setReady] = useState(false)

  const handleSubmit = () => {
    if (name.trim()) {
      setPlayerName(name.trim())
      setReady(true)
    }
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
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" gutterBottom>
          Welcome to Dangerous Inclinations
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Enter your player name to continue
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
          sx={{ mb: 2 }}
        />
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={!name.trim()}
        >
          Continue
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

    case 'deployment':
      if (!gameState) return null
      return <DeploymentScreen />

    case 'active':
      if (!gameState) return null
      return (
        <ActiveGameScreen initialGameState={gameState} onGameStateChange={handleGameStateChange} />
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
