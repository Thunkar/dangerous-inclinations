import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box } from '@mui/material'
import { GameProvider, useGame } from './context/GameContext'
import { GameBoard } from './components/GameBoard'
import { ControlPanel } from './components/ControlPanel'
import { StatusDisplay } from './components/StatusDisplay'
import { TurnHistoryPanel } from './components/TurnHistoryPanel'
import { GameOverModal } from './components/GameOverModal'

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

function GameContent() {
  const { gameState, pendingState, restartGame } = useGame()
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  // Get winner name if game is over
  const winnerName = gameState.winnerId
    ? gameState.players.find(p => p.id === gameState.winnerId)?.name
    : undefined

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
      {/* Game Over Modal */}
      <GameOverModal status={gameState.status} winnerName={winnerName} onRestart={restartGame} />

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

        {/* Right sidebar - Controls */}
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
          <ControlPanel player={activePlayer} allPlayers={gameState.players} />
        </Box>
      </Box>
    </Box>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GameProvider>
        <GameContent />
      </GameProvider>
    </ThemeProvider>
  )
}

export default App
