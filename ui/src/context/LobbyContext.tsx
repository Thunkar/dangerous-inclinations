import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { GameState } from '@dangerous-inclinations/engine'
import type { ServerLobby } from '../api/types'
import {
  deployShip,
  getAvailableDeploymentSectors,
  checkAllDeployed,
  transitionToActivePhase,
} from '@dangerous-inclinations/engine'
import { getLobby, leaveLobby, startGame as startGameAPI } from '../api/lobby'
import { usePlayer } from './PlayerContext'
import { useWebSocket } from './WebSocketContext'

type GamePhase = 'browser' | 'lobby' | 'deployment' | 'active' | 'ended'

interface LobbyContextType {
  phase: GamePhase
  lobbyState: ServerLobby | null
  gameState: GameState | null
  currentLobbyId: string | null
  // Lobby actions
  joinLobby: (lobbyId: string) => void
  addBotToLobby: (botName?: string) => void
  removeBotFromLobby: (botId: string) => void
  setReady: (isReady: boolean) => void
  startGame: () => void
  canStart: () => { canStart: boolean; reason?: string }
  leaveLobbyAction: () => void
  // Deployment actions
  deployPlayerShip: (sector: number) => void
  getDeploymentSectors: () => number[]
  // Transition to active game
  getActiveGameState: () => GameState | null
  // Restart (return to browser)
  returnToLobby: () => void
}

const LobbyContext = createContext<LobbyContextType | undefined>(undefined)

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { playerId, playerName } = usePlayer()
  const { client, connect, disconnect, isConnected } = useWebSocket()
  const [phase, setPhase] = useState<GamePhase>('browser')
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null)
  const [lobbyState, setLobbyState] = useState<ServerLobby | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)

  // Connect to lobby WebSocket room and listen for real-time updates
  useEffect(() => {
    if (phase !== 'lobby' || !currentLobbyId || !client) {
      console.log('[LobbyContext] Skipping WebSocket setup:', { phase, currentLobbyId, hasClient: !!client })
      return
    }

    // Load lobby state from server
    const loadLobby = async () => {
      try {
        const serverLobby = await getLobby(currentLobbyId)
        console.log('[LobbyContext] Loaded lobby:', serverLobby)
        setLobbyState(serverLobby)

        // Check if game started
        if (serverLobby.gameId) {
          console.log('[LobbyContext] Game already started:', serverLobby.gameId)
          // TODO: Fetch game state and transition to deployment
        }
      } catch (error) {
        console.error('[LobbyContext] Failed to load lobby:', error)
      }
    }

    const setupConnection = async () => {
      try {
        // Initial load
        await loadLobby()

        // Connect to lobby room for real-time updates
        if (!isConnected('lobby', currentLobbyId)) {
          console.log('[LobbyContext] Connecting to lobby room:', currentLobbyId)
          await connect('lobby', currentLobbyId)
          console.log('[LobbyContext] Connected to lobby room')
        }

        // Listen for lobby events
        const unsubscribe = client.onMessage('lobby', (message) => {
          console.log('[LobbyContext] Received message:', message)

          if (message.type === 'LOBBY_STATE') {
            // Full lobby state update from server
            console.log('[LobbyContext] Lobby state update:', message.payload)
            setLobbyState(message.payload)
          } else if (message.type === 'PLAYER_JOINED') {
            // Player joined - add to state
            console.log('[LobbyContext] Player joined:', message.payload)
            setLobbyState((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                players: [...prev.players, message.payload],
              }
            })
          } else if (message.type === 'PLAYER_LEFT') {
            // Player left - remove from state
            console.log('[LobbyContext] Player left:', message.payload.playerId)
            setLobbyState((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                players: prev.players.filter((p) => p.playerId !== message.payload.playerId),
              }
            })
          } else if (message.type === 'GAME_STARTING') {
            // Transition to deployment phase
            console.log('[LobbyContext] Game starting:', message.payload.gameId)
            // TODO: Fetch game state and transition to deployment
          }
        }, currentLobbyId)

        return unsubscribe
      } catch (error) {
        console.error('[LobbyContext] Failed to setup WebSocket:', error)
      }
    }

    let unsubscribe: (() => void) | undefined
    setupConnection().then((cleanup) => {
      unsubscribe = cleanup
    })

    return () => {
      unsubscribe?.()
      disconnect('lobby', currentLobbyId)
    }
  }, [phase, currentLobbyId, playerId, playerName, client, connect, disconnect, isConnected])

  // Join lobby action
  const joinLobbyAction = useCallback((lobbyId: string) => {
    setCurrentLobbyId(lobbyId)
    setPhase('lobby')
  }, [])

  // Leave lobby action
  const leaveLobbyAction = useCallback(async () => {
    if (!currentLobbyId) return

    try {
      await leaveLobby(currentLobbyId)
    } catch (error) {
      console.error('[LobbyContext] Failed to leave lobby:', error)
    } finally {
      setCurrentLobbyId(null)
      setLobbyState(null)
      setPhase('browser')
    }
  }, [currentLobbyId])

  // Lobby actions - now handled by server
  const addBotToLobby = useCallback(
    (botName?: string) => {
      // TODO: Call server API to add bot
      console.log('[LobbyContext] Add bot - not yet implemented:', botName)
    },
    []
  )

  const removeBotFromLobby = useCallback(
    (botId: string) => {
      // TODO: Call server API to remove bot
      console.log('[LobbyContext] Remove bot - not yet implemented:', botId)
    },
    []
  )

  const setReady = useCallback(
    (isReady: boolean) => {
      // TODO: Call server API to set ready status
      console.log('[LobbyContext] Set ready - not yet implemented:', isReady)
    },
    []
  )

  const canStart = useCallback(() => {
    if (!lobbyState) return { canStart: false, reason: 'No lobby' }
    if (lobbyState.players.length < 2) return { canStart: false, reason: 'Need at least 2 players' }
    if (lobbyState.gameId) return { canStart: false, reason: 'Game already started' }
    return { canStart: true }
  }, [lobbyState])

  const startGame = useCallback(async () => {
    if (!lobbyState || !currentLobbyId) return

    try {
      // Call server to start game
      const response = await startGameAPI(currentLobbyId)
      console.log('[LobbyContext] Game started on server:', response.gameId)

      // TODO: Transition to deployment phase when server sends game state
      // For now, just log
    } catch (error) {
      console.error('[LobbyContext] Failed to start game:', error)
    }
  }, [lobbyState, currentLobbyId])

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

  const returnToLobby = useCallback(async () => {
    // Leave current lobby if in one
    if (currentLobbyId) {
      try {
        await leaveLobby(currentLobbyId)
      } catch (error) {
        console.error('[LobbyContext] Failed to leave lobby:', error)
      }
    }

    setCurrentLobbyId(null)
    setLobbyState(null)
    setGameState(null)
    setPhase('browser')
  }, [currentLobbyId])

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
        currentLobbyId,
        joinLobby: joinLobbyAction,
        addBotToLobby,
        removeBotFromLobby,
        setReady,
        startGame,
        canStart,
        leaveLobbyAction,
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
