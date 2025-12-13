import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box } from '@mui/material'
import { LobbyProvider, useLobby } from './context/LobbyContext'
import { GameProvider } from './context/GameContext'
import { GameBoard } from './components/GameBoard'
import { ControlPanel } from './components/ControlPanel'
import { StatusDisplay } from './components/StatusDisplay'
import { TurnHistoryPanel } from './components/TurnHistoryPanel'
import { LobbyScreen } from './components/LobbyScreen'
import { DeploymentScreen } from './components/DeploymentScreen'
import { GameEndScreen } from './components/GameEndScreen'
import { MissionPanel } from './components/MissionPanel'
import { useGame } from './context/GameContext'
import type { GameState } from '@dangerous-inclinations/engine'

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
 * Main app content router - routes to appropriate screen based on phase
 */
function AppContent() {
  const { phase, lobbyState, gameState, returnToLobby } = useLobby()

  // Handle game state changes from GameProvider
  const handleGameStateChange = (newState: GameState) => {
    // Check if game has ended
    if (newState.phase === 'ended' || newState.status !== 'active') {
      // Game state is managed internally, GameEndScreen will read from GameProvider
    }
  }

  // Route based on phase
  switch (phase) {
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

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LobbyProvider>
        <AppContent />
      </LobbyProvider>
    </ThemeProvider>
  )
}

export default App
