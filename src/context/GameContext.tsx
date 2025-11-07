import { createContext, useContext, useState, useCallback } from 'react'
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
      hitPoints: 10,
      maxHitPoints: 10,
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
      ring: 5,
      sector: 48, // Ring 5 has 96 sectors (halfway around)
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
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
      sector: 5, // Ring 2 has 12 sectors (halfway around)
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
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

  const updatePowerAllocation = useCallback((allocation: PowerAllocation) => {
    setGameState(prev => {
      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...newPlayers[prev.activePlayerIndex],
        powerAllocation: allocation,
      }
      return { ...prev, players: newPlayers }
    })
  }, [])

  const setPendingAction = useCallback((action: PlayerAction) => {
    setGameState(prev => {
      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...newPlayers[prev.activePlayerIndex],
        pendingAction: action,
      }
      return { ...prev, players: newPlayers }
    })
  }, [])

  const executeTurn = useCallback(() => {
    setGameState(prev => {
      // Execute the active player's turn
      const activePlayer = prev.players[prev.activePlayerIndex]
      const { updatedPlayer, logEntries } = resolvePlayerTurn(activePlayer, prev.turn)

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = updatedPlayer

      let newLog = [...prev.turnLog, ...logEntries]

      // Move to next player
      const nextPlayerIndex = (prev.activePlayerIndex + 1) % prev.players.length
      const isNewTurn = nextPlayerIndex === 0

      // Check if the NEXT active player has a pending transfer that needs to resolve
      // This will make the ship appear at its destination when their turn starts
      let finalPlayers = newPlayers
      const nextPlayer = newPlayers[nextPlayerIndex]

      if (nextPlayer.ship.transferState) {
        console.log(`[DEBUG] Resolving transfer for ${nextPlayer.name} at start of their turn`)
        console.log(`[DEBUG] Current position: Ring ${nextPlayer.ship.ring}, Sector ${nextPlayer.ship.sector}`)
        console.log(`[DEBUG] Transfer state:`, nextPlayer.ship.transferState)

        // Resolve the next player's transfer so they see their ship at destination
        const tempPlayer = {
          ...nextPlayer,
          pendingAction: { type: 'coast' as const, activateScoop: false }
        }
        const { updatedPlayer: transferredPlayer, logEntries: transferLogs } =
          resolvePlayerTurn(tempPlayer, isNewTurn ? prev.turn + 1 : prev.turn)

        console.log(`[DEBUG] After resolution: Ring ${transferredPlayer.ship.ring}, Sector ${transferredPlayer.ship.sector}`)
        console.log(`[DEBUG] Transfer state after:`, transferredPlayer.ship.transferState)

        finalPlayers = [...newPlayers]
        finalPlayers[nextPlayerIndex] = transferredPlayer
        newLog = [...newLog, ...transferLogs]
      }

      return {
        ...prev,
        turn: isNewTurn ? prev.turn + 1 : prev.turn,
        activePlayerIndex: nextPlayerIndex,
        players: finalPlayers,
        turnLog: newLog,
      }
    })
  }, [])

  const resetGame = useCallback(() => {
    setGameState(createInitialState())
  }, [])

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
