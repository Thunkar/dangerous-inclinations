/**
 * WebSocketContext - one client per authenticated player, shared by the
 * lobby browser, the lobby room and the game room.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { GameWebSocketClient, type WebSocketRoom } from '../api/websocket'
import { usePlayer } from './PlayerContext'

interface WebSocketContextValue {
  client: GameWebSocketClient | null
  isConnected: (room: WebSocketRoom, roomId?: string) => boolean
  connect: (room: WebSocketRoom, roomId?: string) => Promise<void>
  disconnect: (room: WebSocketRoom, roomId?: string) => void
  send: (room: WebSocketRoom, message: unknown, roomId?: string) => boolean
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { playerId, isAuthenticated } = usePlayer()
  const [client, setClient] = useState<GameWebSocketClient | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !playerId) return
    const wsClient = new GameWebSocketClient(playerId)
    setClient(wsClient)
    return () => {
      wsClient.disconnectAll()
      setClient(null)
    }
  }, [isAuthenticated, playerId])

  const connect = useCallback(
    async (room: WebSocketRoom, roomId?: string) => {
      if (!client) throw new Error('WebSocket client not initialised')
      await client.connect(room, roomId)
    },
    [client],
  )

  const disconnect = useCallback(
    (room: WebSocketRoom, roomId?: string) => {
      client?.disconnect(room, roomId)
    },
    [client],
  )

  const send = useCallback(
    (room: WebSocketRoom, message: unknown, roomId?: string): boolean => client?.send(room, message, roomId) ?? false,
    [client],
  )

  const isConnected = useCallback(
    (room: WebSocketRoom, roomId?: string): boolean => client?.isConnected(room, roomId) ?? false,
    [client],
  )

  return (
    <WebSocketContext.Provider value={{ client, isConnected, connect, disconnect, send }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext)
  if (!context) throw new Error('useWebSocket must be used within a WebSocketProvider')
  return context
}
