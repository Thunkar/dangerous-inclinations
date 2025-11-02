import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { GameState, Player, PowerAllocation, PlayerAction } from '../types/game'
import { STARTING_REACTION_MASS } from '../constants/rings'
import { resolvePlayerTurn } from '../utils/turnResolution'

interface GameContextType {
  gameState: GameState
  updatePowerAllocation: (allocation: PowerAllocation) => void
  setPendingAction: (action: PlayerAction) => void
  executeTurn: () => void
  resetGame: () => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

const createInitialPlayers = (): Player[] => [
  {
    id: 'player1',
    name: 'Ship Alpha',
    color: '#2196f3',
    ship: {
      ring: 4,
      sector: 0,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      transferState: null,
    },
    powerAllocation: {
      rotation: 0,
      engines: 0,
      scoop: 0,
      weapons: 0,
      defense: 0,
    },
    pendingAction: null,
  },
  {
    id: 'player2',
    name: 'Ship Beta',
    color: '#f44336',
    ship: {
      ring: 6,
      sector: 15,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      transferState: null,
    },
    powerAllocation: {
      rotation: 0,
      engines: 0,
      scoop: 0,
      weapons: 0,
      defense: 0,
    },
    pendingAction: null,
  },
  {
    id: 'player3',
    name: 'Ship Gamma',
    color: '#4caf50',
    ship: {
      ring: 2,
      sector: 8,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      transferState: null,
    },
    powerAllocation: {
      rotation: 0,
      engines: 0,
      scoop: 0,
      weapons: 0,
      defense: 0,
    },
    pendingAction: null,
  },
]

const createInitialState = (): GameState => ({
  turn: 1,
  activePlayerIndex: 0,
  players: createInitialPlayers(),
  turnLog: [],
})

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(createInitialState())

  const updatePowerAllocation = (allocation: PowerAllocation) => {
    setGameState(prev => {
      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...newPlayers[prev.activePlayerIndex],
        powerAllocation: allocation,
      }
      return { ...prev, players: newPlayers }
    })
  }

  const setPendingAction = (action: PlayerAction) => {
    setGameState(prev => {
      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...newPlayers[prev.activePlayerIndex],
        pendingAction: action,
      }
      return { ...prev, players: newPlayers }
    })
  }

  const executeTurn = () => {
    setGameState(prev => {
      const activePlayer = prev.players[prev.activePlayerIndex]
      const { updatedPlayer, logEntries } = resolvePlayerTurn(activePlayer, prev.turn)

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = updatedPlayer

      const newLog = [...prev.turnLog, ...logEntries]

      // Move to next player
      const nextPlayerIndex = (prev.activePlayerIndex + 1) % prev.players.length
      const isNewTurn = nextPlayerIndex === 0

      return {
        ...prev,
        turn: isNewTurn ? prev.turn + 1 : prev.turn,
        activePlayerIndex: nextPlayerIndex,
        players: newPlayers,
        turnLog: newLog,
      }
    })
  }

  const resetGame = () => {
    setGameState(createInitialState())
  }

  return (
    <GameContext.Provider
      value={{
        gameState,
        updatePowerAllocation,
        setPendingAction,
        executeTurn,
        resetGame,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within GameProvider')
  }
  return context
}
