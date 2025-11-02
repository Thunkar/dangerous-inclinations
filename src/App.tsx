import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, Typography, Button, Stack } from '@mui/material'
import { GameProvider, useGame } from './context/GameContext'
import { GameBoard } from './components/GameBoard'
import { TurnIndicator } from './components/TurnIndicator'
import { PowerAllocationPanel } from './components/PowerAllocationPanel'
import { ActionSelector } from './components/ActionSelector'
import { StatusDisplay } from './components/StatusDisplay'

const theme = createTheme({
  palette: {
    mode: 'light',
  },
})

function GameContent() {
  const { gameState, updatePowerAllocation, setPendingAction, executeTurn, resetGame } = useGame()
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h5" component="h1">
          Orbital Combat Simulator
        </Typography>
        <Button variant="outlined" onClick={resetGame}>
          Reset Game
        </Button>
      </Box>

      <TurnIndicator activePlayer={activePlayer} turn={gameState.turn} />

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar - Player Status */}
        <Box
          sx={{
            width: 300,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 2,
          }}
        >
          <StatusDisplay
            players={gameState.players}
            activePlayerIndex={gameState.activePlayerIndex}
            turnLog={gameState.turnLog}
          />
        </Box>

        {/* Center - Game Board */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            p: 3,
          }}
        >
          <GameBoard players={gameState.players} activePlayerIndex={gameState.activePlayerIndex} />
        </Box>

        {/* Right sidebar - Controls */}
        <Box
          sx={{
            width: 350,
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 2,
          }}
        >
          <Stack spacing={2}>
            <PowerAllocationPanel
              allocation={activePlayer.powerAllocation}
              onChange={updatePowerAllocation}
            />

            <ActionSelector
              player={activePlayer}
              onActionSelect={setPendingAction}
              onExecuteTurn={executeTurn}
            />
          </Stack>
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
