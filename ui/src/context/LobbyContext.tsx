import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { GameState } from '@dangerous-inclinations/engine'
import type { LobbyState } from '@dangerous-inclinations/engine'
import {
  createLobby,
  addBot,
  removeBot,
  setPlayerReady,
  startGame as startGameFromLobby,
  canStartGame,
} from '@dangerous-inclinations/engine'
import {
  deployShip,
  getAvailableDeploymentSectors,
  checkAllDeployed,
  transitionToActivePhase,
} from '@dangerous-inclinations/engine'
import { GRAVITY_WELLS } from '@dangerous-inclinations/engine'

type GamePhase = 'lobby' | 'deployment' | 'active' | 'ended'

interface LobbyContextType {
  phase: GamePhase
  lobbyState: LobbyState | null
  gameState: GameState | null
  // Lobby actions
  addBotToLobby: (botName?: string) => void
  removeBotFromLobby: (botId: string) => void
  setReady: (isReady: boolean) => void
  startGame: () => void
  canStart: () => { canStart: boolean; reason?: string }
  // Deployment actions
  deployPlayerShip: (sector: number) => void
  getDeploymentSectors: () => number[]
  // Transition to active game
  getActiveGameState: () => GameState | null
  // Restart (return to lobby)
  returnToLobby: () => void
}

const LobbyContext = createContext<LobbyContextType | undefined>(undefined)

export function LobbyProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<GamePhase>('lobby')
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(() => {
    const lobby = createLobby('player1', 'Human', 6)
    const readyResult = setPlayerReady(lobby, 'player1', true)
    return readyResult.success && readyResult.lobbyState ? readyResult.lobbyState : lobby
  })
  const [gameState, setGameState] = useState<GameState | null>(null)

  // Lobby actions
  const addBotToLobby = useCallback(
    (botName?: string) => {
      if (!lobbyState) return
      const result = addBot(lobbyState, botName)
      if (result.success && result.lobbyState) {
        setLobbyState(result.lobbyState)
      }
    },
    [lobbyState]
  )

  const removeBotFromLobby = useCallback(
    (botId: string) => {
      if (!lobbyState) return
      const result = removeBot(lobbyState, botId)
      if (result.success && result.lobbyState) {
        setLobbyState(result.lobbyState)
      }
    },
    [lobbyState]
  )

  const setReady = useCallback(
    (isReady: boolean) => {
      if (!lobbyState) return
      const result = setPlayerReady(lobbyState, 'player1', isReady)
      if (result.success && result.lobbyState) {
        setLobbyState(result.lobbyState)
      }
    },
    [lobbyState]
  )

  const canStart = useCallback(() => {
    if (!lobbyState) return { canStart: false, reason: 'No lobby' }
    return canStartGame(lobbyState)
  }, [lobbyState])

  const startGame = useCallback(() => {
    if (!lobbyState) return
    const result = startGameFromLobby(lobbyState, GRAVITY_WELLS)
    if (result.success && result.gameState) {
      setGameState(result.gameState)
      setPhase('deployment')
    }
  }, [lobbyState])

  // Deployment actions
  const deployPlayerShip = useCallback(
    (sector: number) => {
      if (!gameState || phase !== 'deployment') return

      // Find the current player who needs to deploy
      const playerToDeployIndex = gameState.players.findIndex(p => !p.hasDeployed)
      if (playerToDeployIndex === -1) return

      const playerToDeploy = gameState.players[playerToDeployIndex]
      const result = deployShip(gameState, playerToDeploy.id, sector)

      if (result.success && result.gameState) {
        let newState = result.gameState

        // Check if all players have deployed
        if (checkAllDeployed(newState)) {
          newState = transitionToActivePhase(newState)
          setGameState(newState)
          setPhase('active')
        } else {
          setGameState(newState)
        }
      }
    },
    [gameState, phase]
  )

  const getDeploymentSectors = useCallback(() => {
    if (!gameState) return []
    return getAvailableDeploymentSectors(gameState)
  }, [gameState])

  const getActiveGameState = useCallback(() => {
    return phase === 'active' ? gameState : null
  }, [phase, gameState])

  const returnToLobby = useCallback(() => {
    const lobby = createLobby('player1', 'Human', 6)
    const readyResult = setPlayerReady(lobby, 'player1', true)
    setLobbyState(readyResult.success && readyResult.lobbyState ? readyResult.lobbyState : lobby)
    setGameState(null)
    setPhase('lobby')
  }, [])

  // Auto-deploy bots during deployment phase
  useEffect(() => {
    if (phase !== 'deployment' || !gameState) return

    const activePlayer = gameState.players[gameState.activePlayerIndex]
    if (!activePlayer) return

    // Check if active player is a bot (not player1)
    if (activePlayer.id !== 'player1' && !activePlayer.hasDeployed) {
      // Auto-deploy bot after a short delay
      const timer = setTimeout(() => {
        const availableSectors = getAvailableDeploymentSectors(gameState)
        if (availableSectors.length > 0) {
          // Pick a random sector
          const randomIndex = Math.floor(Math.random() * availableSectors.length)
          const sector = availableSectors[randomIndex]

          // Deploy the bot
          const result = deployShip(gameState, activePlayer.id, sector)
          if (result.success && result.gameState) {
            let newState = result.gameState

            // Check if all players have deployed
            if (checkAllDeployed(newState)) {
              newState = transitionToActivePhase(newState)
              setGameState(newState)
              setPhase('active')
            } else {
              setGameState(newState)
            }
          }
        }
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [phase, gameState])

  return (
    <LobbyContext.Provider
      value={{
        phase,
        lobbyState,
        gameState,
        addBotToLobby,
        removeBotFromLobby,
        setReady,
        startGame,
        canStart,
        deployPlayerShip,
        getDeploymentSectors,
        getActiveGameState,
        returnToLobby,
      }}
    >
      {children}
    </LobbyContext.Provider>
  )
}

export function useLobby() {
  const context = useContext(LobbyContext)
  if (!context) {
    throw new Error('useLobby must be used within a LobbyProvider')
  }
  return context
}
