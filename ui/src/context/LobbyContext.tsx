import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { GameState } from '@dangerous-inclinations/engine'
import type { ServerLobby } from '../api/types'
import { getAvailableDeploymentSectors } from '@dangerous-inclinations/engine'
import { getLobby, leaveLobby, startGame as startGameAPI, addBot as addBotAPI, removeBot as removeBotAPI } from '../api/lobby'
import { getGameState as fetchGameState, deployShip as deployShipAPI } from '../api/game'
import { getPlayerStatus } from '../api/player'
import { usePlayer } from './PlayerContext'
import { useWebSocket } from './WebSocketContext'
import { ENV } from '../config/env'

type GamePhase = 'browser' | 'lobby' | 'deployment' | 'active' | 'ended'

interface LobbyContextType {
  phase: GamePhase
  lobbyState: ServerLobby | null
  gameState: GameState | null
  currentLobbyId: string | null
  isRestoringSession: boolean
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
  const { playerId, playerName, isLoading: isPlayerLoading } = usePlayer()
  const { client, connect, disconnect, isConnected } = useWebSocket()
  const [phase, setPhase] = useState<GamePhase>('browser')
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null)
  const [lobbyState, setLobbyState] = useState<ServerLobby | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const sessionRestoredRef = useRef(false)

  // Restore session from server on mount - server is single source of truth
  useEffect(() => {
    // Wait for player authentication to complete AND WebSocket client to be ready
    if (isPlayerLoading || !playerId || !client) {
      if (ENV.DEBUG) {
        console.log('[LobbyContext] Waiting for dependencies:', { isPlayerLoading, playerId: !!playerId, client: !!client })
      }
      return
    }

    // Only restore once
    if (sessionRestoredRef.current) {
      return
    }
    sessionRestoredRef.current = true

    const restoreSession = async () => {
      if (ENV.DEBUG) {
        console.log('[LobbyContext] Fetching player status from server')
      }

      try {
        const status = await getPlayerStatus(playerId)

        if (!status) {
          if (ENV.DEBUG) {
            console.log('[LobbyContext] No player status found')
          }
          setIsRestoringSession(false)
          return
        }

        // If player is in a lobby
        if (status.lobby) {
          if (ENV.DEBUG) {
            console.log('[LobbyContext] Found lobby:', status.lobby)
          }

          setCurrentLobbyId(status.lobby.lobbyId)
          setLobbyState(status.lobby)

          // If there's an active game
          if (status.gameState) {
            if (ENV.DEBUG) {
              console.log('[LobbyContext] Found game state:', status.gameState.phase)
            }

            setGameState(status.gameState)

            // Determine phase from game state
            const gamePhase: GamePhase =
              status.gameState.phase === 'deployment' ? 'deployment' :
              status.gameState.phase === 'ended' ? 'ended' : 'active'
            setPhase(gamePhase)
          } else {
            // In lobby but no game started
            setPhase('lobby')
          }
        }
        // If no lobby, player starts at browser phase (default)
      } catch (error) {
        console.error('[LobbyContext] Failed to restore session:', error)
      }

      setIsRestoringSession(false)
    }

    restoreSession()
  }, [isPlayerLoading, playerId, client])

  // Connect to lobby/game WebSocket rooms and listen for real-time updates
  useEffect(() => {
    // Don't setup WebSocket connections during session restoration
    if (isRestoringSession) {
      console.log('[LobbyContext] Skipping WebSocket setup during session restoration')
      return
    }

    if ((phase !== 'lobby' && phase !== 'deployment' && phase !== 'active') || !currentLobbyId || !client) {
      console.log('[LobbyContext] Skipping WebSocket setup:', { phase, currentLobbyId, hasClient: !!client })
      return
    }

    const setupConnection = async () => {
      try {
        // Load lobby state from server
        const serverLobby = await getLobby(currentLobbyId)
        console.log('[LobbyContext] Loaded lobby:', serverLobby)
        setLobbyState(serverLobby)

        // Check if game started - rejoin ongoing game
        let currentGameId = serverLobby.gameId
        if (currentGameId) {
          console.log('[LobbyContext] Game already started:', currentGameId)
          try {
            const loadedGameState = await fetchGameState(currentGameId)
            console.log('[LobbyContext] Loaded game state:', loadedGameState)
            setGameState(loadedGameState)
            // Transition to appropriate phase based on game state
            const newPhase = loadedGameState.phase === 'deployment' ? 'deployment' :
                           loadedGameState.phase === 'ended' ? 'ended' : 'active'
            setPhase(newPhase)
          } catch (error) {
            console.error('[LobbyContext] Failed to load game state:', error)
          }
        }

        // Connect to lobby room for real-time updates
        if (!isConnected('lobby', currentLobbyId)) {
          console.log('[LobbyContext] Connecting to lobby room:', currentLobbyId)
          await connect('lobby', currentLobbyId)
          console.log('[LobbyContext] Connected to lobby room')
        }

        // If game exists, also connect to game room
        if (currentGameId) {
          if (!isConnected('game', currentGameId)) {
            console.log('[LobbyContext] Connecting to game room:', currentGameId)
            await connect('game', currentGameId)
            console.log('[LobbyContext] Connected to game room')
          }
        }

        // Listen for lobby events
        const unsubscribeLobby = client.onMessage('lobby', (message) => {
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
            console.log('[LobbyContext] Game starting:', message.payload)
            setGameState(message.payload.gameState)
            setPhase('deployment')
            // Update currentGameId for game room connection
            currentGameId = message.payload.gameId
          } else if (message.type === 'GAME_STATE_UPDATED') {
            // Game state update (from deployment or turn execution)
            console.log('[LobbyContext] Game state updated:', message.payload)
            const newState = message.payload as GameState
            setGameState(newState)

            // Update phase based on game state
            if (newState.phase === 'active') {
              setPhase('active')
            } else if (newState.phase === 'ended') {
              setPhase('ended')
            }
          }
        }, currentLobbyId)

        // Listen for game events if we have a game
        let unsubscribeGame: (() => void) | undefined
        if (currentGameId) {
          unsubscribeGame = client.onMessage('game', (message) => {
            console.log('[LobbyContext] Received game message:', message)

            if (message.type === 'GAME_STATE_UPDATED') {
              // Game state update (from deployment or turn execution)
              console.log('[LobbyContext] Game state updated via game room:', message.payload)
              const newState = message.payload as GameState
              setGameState(newState)

              // Update phase based on game state
              if (newState.phase === 'active') {
                setPhase('active')
              } else if (newState.phase === 'ended') {
                setPhase('ended')
              }
            }
          }, currentGameId)
        }

        return () => {
          unsubscribeLobby?.()
          unsubscribeGame?.()
        }
      } catch (error) {
        console.error('[LobbyContext] Failed to setup WebSocket:', error)
      }
    }

    let cleanup: (() => void) | undefined
    setupConnection().then((cleanupFn) => {
      cleanup = cleanupFn
    })

    return () => {
      cleanup?.()
      disconnect('lobby', currentLobbyId)
      // Don't disconnect from game room here - GameContext manages it during active phase
      // Only disconnect if we're leaving entirely (browser phase)
    }
  }, [phase, currentLobbyId, playerId, playerName, client, connect, disconnect, isConnected, isRestoringSession])

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
    async (botName?: string) => {
      if (!currentLobbyId) {
        console.error('[LobbyContext] Cannot add bot: no lobby ID')
        return
      }

      try {
        await addBotAPI(currentLobbyId, botName)
        // Server will broadcast PLAYER_JOINED to all players via WebSocket
      } catch (error) {
        console.error('[LobbyContext] Failed to add bot:', error)
      }
    },
    [currentLobbyId]
  )

  const removeBotFromLobby = useCallback(
    async (botId: string) => {
      if (!currentLobbyId) {
        console.error('[LobbyContext] Cannot remove bot: no lobby ID')
        return
      }

      try {
        await removeBotAPI(currentLobbyId, botId)
        // Server will broadcast PLAYER_LEFT to all players via WebSocket
      } catch (error) {
        console.error('[LobbyContext] Failed to remove bot:', error)
      }
    },
    [currentLobbyId]
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
    async (sector: number) => {
      if (!lobbyState?.gameId || phase !== 'deployment') {
        console.error('[LobbyContext] Cannot deploy: no game ID or not in deployment phase')
        return
      }

      try {
        // Call server to deploy ship
        const updatedGameState = await deployShipAPI(lobbyState.gameId, sector)
        console.log('[LobbyContext] Deployment successful:', updatedGameState)

        // Server will broadcast GAME_STATE_UPDATED to all players, which we'll handle in the WebSocket listener
      } catch (error) {
        console.error('[LobbyContext] Failed to deploy ship:', error)
      }
    },
    [lobbyState?.gameId, phase]
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

  // TODO: Bot auto-deployment should be handled by the server

  return (
    <LobbyContext.Provider
      value={{
        phase,
        lobbyState,
        gameState,
        currentLobbyId,
        isRestoringSession,
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
