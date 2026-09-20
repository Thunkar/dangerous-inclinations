/**
 * LobbyContext - the seat before the game: browsing lobbies, sitting in one,
 * and the hand-off to a game. Once a lobby has a `gameId` the game tree
 * (GameProvider) takes over; this context only remembers which game it is.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { ServerLobby, LobbySocketMessage } from '../api/types'
import {
  getLobby,
  leaveLobby,
  startGame as startGameAPI,
  addBot as addBotAPI,
  removeBot as removeBotAPI,
} from '../api/lobby'
import { MIN_PLAYERS } from '@dangerous-inclinations/engine'
import { getPlayerStatus } from '../api/player'
import { usePlayer } from './PlayerContext'
import { useWebSocket } from './WebSocketContext'

export type LobbyPhase = 'browser' | 'lobby' | 'game'

interface LobbyContextType {
  phase: LobbyPhase
  lobbyState: ServerLobby | null
  currentLobbyId: string | null
  /** Set once the lobby's game has started. */
  gameId: string | null
  isRestoringSession: boolean
  error: string | null
  joinLobby: (lobbyId: string) => void
  addBotToLobby: (botName?: string) => Promise<void>
  removeBotFromLobby: (botId: string) => Promise<void>
  startGame: () => Promise<void>
  canStart: () => { canStart: boolean; reason?: string }
  leaveLobbyAction: () => Promise<void>
  /** Leave the table entirely and go back to the browser. */
  returnToLobby: () => Promise<void>
}

const LobbyContext = createContext<LobbyContextType | undefined>(undefined)

function isLobbyMessage(data: unknown): data is LobbySocketMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string'
}

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { playerId, isLoading: isPlayerLoading } = usePlayer()
  const { client, connect, disconnect } = useWebSocket()
  const [phase, setPhase] = useState<LobbyPhase>('browser')
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null)
  const [lobbyState, setLobbyState] = useState<ServerLobby | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sessionRestoredRef = useRef(false)

  // Restore the session from the server once the player is known.
  useEffect(() => {
    if (isPlayerLoading || !playerId || !client || sessionRestoredRef.current) return
    sessionRestoredRef.current = true

    const restore = async () => {
      try {
        const status = await getPlayerStatus(playerId)
        if (status?.lobby) {
          setCurrentLobbyId(status.lobby.lobbyId)
          setLobbyState(status.lobby)
          if (status.lobby.gameId) {
            setGameId(status.lobby.gameId)
            setPhase('game')
          } else {
            setPhase('lobby')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore session')
      } finally {
        setIsRestoringSession(false)
      }
    }
    restore()
  }, [isPlayerLoading, playerId, client])

  // Lobby room: live roster updates and the GAME_STARTING hand-off.
  useEffect(() => {
    if (isRestoringSession || !client || !currentLobbyId || phase === 'browser') return

    let cancelled = false
    const lobbyId = currentLobbyId

    const unsubscribe = client.onMessage(
      'lobby',
      (data) => {
        if (!isLobbyMessage(data)) return
        switch (data.type) {
          case 'PLAYER_JOINED':
            setLobbyState((prev) =>
              prev && !prev.players.some((p) => p.playerId === data.payload.playerId)
                ? { ...prev, players: [...prev.players, data.payload] }
                : prev,
            )
            break
          case 'PLAYER_LEFT':
            setLobbyState((prev) =>
              prev ? { ...prev, players: prev.players.filter((p) => p.playerId !== data.payload.playerId) } : prev,
            )
            break
          case 'GAME_STARTING':
            setLobbyState((prev) => (prev ? { ...prev, gameId: data.payload.gameId } : prev))
            setGameId(data.payload.gameId)
            setPhase('game')
            break
          default:
            break
        }
      },
      lobbyId,
    )

    const setup = async () => {
      try {
        const serverLobby = await getLobby(lobbyId)
        if (cancelled) return
        setLobbyState(serverLobby)
        if (serverLobby.gameId) {
          setGameId(serverLobby.gameId)
          setPhase('game')
        }
        await connect('lobby', lobbyId)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to join lobby room')
      }
    }
    setup()

    return () => {
      cancelled = true
      unsubscribe()
      disconnect('lobby', lobbyId)
    }
  }, [phase, currentLobbyId, client, connect, disconnect, isRestoringSession])

  const joinLobbyAction = useCallback((lobbyId: string) => {
    setError(null)
    setCurrentLobbyId(lobbyId)
    setPhase('lobby')
  }, [])

  const clearSeat = useCallback(() => {
    setCurrentLobbyId(null)
    setLobbyState(null)
    setGameId(null)
    setPhase('browser')
  }, [])

  const leaveLobbyAction = useCallback(async () => {
    if (!currentLobbyId) return
    try {
      await leaveLobby(currentLobbyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave lobby')
    } finally {
      clearSeat()
    }
  }, [currentLobbyId, clearSeat])

  const addBotToLobby = useCallback(
    async (botName?: string) => {
      if (!currentLobbyId) return
      try {
        await addBotAPI(currentLobbyId, botName)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add bot')
      }
    },
    [currentLobbyId],
  )

  const removeBotFromLobby = useCallback(
    async (botId: string) => {
      if (!currentLobbyId) return
      try {
        await removeBotAPI(currentLobbyId, botId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove bot')
      }
    },
    [currentLobbyId],
  )

  const canStart = useCallback(() => {
    if (!lobbyState) return { canStart: false, reason: 'No lobby' }
    if (lobbyState.players.length < MIN_PLAYERS)
      return { canStart: false, reason: `Need at least ${MIN_PLAYERS} players` }
    if (lobbyState.gameId) return { canStart: false, reason: 'Game already started' }
    if (playerId && lobbyState.hostPlayerId !== playerId) {
      return { canStart: false, reason: 'Waiting for the host to start' }
    }
    return { canStart: true }
  }, [lobbyState, playerId])

  const startGame = useCallback(async () => {
    if (!currentLobbyId) return
    try {
      const response = await startGameAPI(currentLobbyId)
      // GAME_STARTING normally arrives over the lobby socket; the REST reply is a fallback.
      setGameId(response.gameId)
      setPhase('game')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
    }
  }, [currentLobbyId])

  const returnToLobby = useCallback(async () => {
    if (currentLobbyId) {
      try {
        await leaveLobby(currentLobbyId)
      } catch {
        // Already gone; nothing to do.
      }
    }
    clearSeat()
  }, [currentLobbyId, clearSeat])

  return (
    <LobbyContext.Provider
      value={{
        phase,
        lobbyState,
        currentLobbyId,
        gameId,
        isRestoringSession,
        error,
        joinLobby: joinLobbyAction,
        addBotToLobby,
        removeBotFromLobby,
        startGame,
        canStart,
        leaveLobbyAction,
        returnToLobby,
      }}
    >
      {children}
    </LobbyContext.Provider>
  )
}

export function useLobby() {
  const context = useContext(LobbyContext)
  if (!context) throw new Error('useLobby must be used within a LobbyProvider')
  return context
}
