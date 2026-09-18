/** Production setup screen with a local two-seat game, for visual regression work. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { createGame, submitLoadout, viewFor } from '@dangerous-inclinations/engine'
import { GameContext } from '../context/GameContext'
import { BoardModeProvider } from '../context/BoardModeContext'
import { LoadoutScreen } from '../components/screens/LoadoutScreen'
import { theme } from '../theme'
import '../index.css'

function Preview() {
  const [state, setState] = useState(() =>
    createGame(
      [
        { id: 'shipwright', name: 'Shipwright' },
        { id: 'crew', name: 'Crew' },
      ],
      20260916
    )
  )
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BoardModeProvider>
        <GameContext.Provider
          value={{
            gameId: 'shipyard-preview',
            view: viewFor(state, 'shipwright'),
            log: [],
            turnErrors: [],
            clearTurnErrors: () => {},
            chat: [],
            sendChat: async () => {},
            isAnimating: false,
            readOnly: false,
            seats: [],
            nameOf: id => state.players.find(p => p.id === id)?.name ?? id,
            submitTurn: () => {},
            deploy: async () => {},
            registerAnimator: () => {},
            history: [],
            replayTurn: () => {},
            submitLoadout: async (loadout, missionIds, appearance) => {
              const result = submitLoadout(state, 'shipwright', { loadout, missionIds, appearance })
              if (result.error) throw new Error(result.error)
              setState(result.state)
            },
          }}
        >
          <LoadoutScreen />
        </GameContext.Provider>
      </BoardModeProvider>
    </ThemeProvider>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
