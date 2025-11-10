import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, Stack } from '@mui/material'
import { GameProvider, useGame } from './context/GameContext'
import { GameBoard } from './components/GameBoard'
import { ShipSystemsPanel } from './components/energy-management/ShipSystemsPanel'
import { ActionSelector } from './components/action-selector/ActionSelector'
import { StatusDisplay } from './components/StatusDisplay'

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
  const {
    gameState,
    setPendingAction,
    executeTurn,
    allocateSubsystemEnergy,
    deallocateSubsystemEnergy,
    requestHeatVent,
  } = useGame()
  const activePlayer = gameState.players[gameState.activePlayerIndex]

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Status Bar */}
      <StatusDisplay
        players={gameState.players}
        activePlayerIndex={gameState.activePlayerIndex}
        turn={gameState.turn}
      />

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%' }}>
        {/* Center - Game Board */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            p: 2,
            minWidth: 0,
          }}
        >
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GameBoard players={gameState.players} activePlayerIndex={gameState.activePlayerIndex} />
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
          <Stack spacing={2}>
            <Box sx={{ overflow: 'visible' }}>
              <ShipSystemsPanel
                subsystems={activePlayer.ship.pendingSubsystems || activePlayer.ship.subsystems}
                reactor={activePlayer.ship.pendingReactor || activePlayer.ship.reactor}
                heat={activePlayer.ship.pendingHeat || activePlayer.ship.heat}
                hitPoints={activePlayer.ship.hitPoints}
                maxHitPoints={activePlayer.ship.maxHitPoints}
                onAllocateEnergy={allocateSubsystemEnergy}
                onDeallocateEnergy={deallocateSubsystemEnergy}
                onVentHeat={requestHeatVent}
              />
            </Box>

            <ActionSelector
              player={activePlayer}
              allPlayers={gameState.players}
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
