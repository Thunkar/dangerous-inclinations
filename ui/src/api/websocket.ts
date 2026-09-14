/**
 * WebSocket client with room support (global, lobby, game). Handlers
 * registered before a connection opens are attached when it does, and
 * survive reconnection.
 *
 * One socket per room key: a connection is registered the moment it is
 * created, so a second `connect()` while the first is still dialling joins
 * that attempt instead of opening a rival socket. A connection that drops
 * keeps its entry (and its pending retry timer) in the map until the retry
 * fires or someone disconnects, so `disconnect`/`disconnectAll` can always
 * cancel the reconnect they are cleaning up after.
 */
import { ENV } from '../config/env'

type MessageHandler = (data: unknown) => void
type CloseHandler = () => void

export type WebSocketRoom = 'global' | 'lobby' | 'game'

interface RoomConnection {
  ws: WebSocket
  room: WebSocketRoom
  roomId?: string
  reconnectAttempts: number
  reconnectTimeout?: ReturnType<typeof setTimeout>
  intentionalDisconnect: boolean
  /** Settles when this socket opens; shared by every connect() call made while it dials. */
  opening?: Promise<void>
}

interface HandlerSet {
  message: Set<MessageHandler>
  close: Set<CloseHandler>
}

export class GameWebSocketClient {
  private readonly playerId: string
  private connections = new Map<string, RoomConnection>()
  private handlers = new Map<string, HandlerSet>()
  private readonly maxReconnectAttempts = 5
  private readonly baseReconnectDelay = 1000

  constructor(playerId: string) {
    this.playerId = playerId
  }

  private key(room: WebSocketRoom, roomId?: string): string {
    return roomId ? `${room}:${roomId}` : room
  }

  private handlersFor(key: string): HandlerSet {
    let set = this.handlers.get(key)
    if (!set) {
      set = { message: new Set(), close: new Set() }
      this.handlers.set(key, set)
    }
    return set
  }

  async connect(room: WebSocketRoom, roomId?: string): Promise<void> {
    const key = this.key(room, roomId)
    const existing = this.connections.get(key)
    if (existing) {
      if (existing.ws.readyState === WebSocket.OPEN) return
      // Already dialling: wait on that attempt rather than opening a second socket.
      if (existing.ws.readyState === WebSocket.CONNECTING) return existing.opening
      // A retry was pending for this key; we are doing it now.
      if (existing.reconnectTimeout) {
        clearTimeout(existing.reconnectTimeout)
        existing.reconnectTimeout = undefined
      }
    }

    const url = `${ENV.WS_URL}/ws/${room}?playerId=${encodeURIComponent(this.playerId)}${
      roomId ? `&roomId=${encodeURIComponent(roomId)}` : ''
    }`
    const ws = new WebSocket(url)
    const connection: RoomConnection = {
      ws,
      room,
      roomId,
      reconnectAttempts: existing?.reconnectAttempts ?? 0,
      intentionalDisconnect: false,
    }
    // Registered before it opens: two connect() calls can never race into two sockets.
    this.connections.set(key, connection)

    const opening = new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (finish: () => void) => {
        if (settled) return
        settled = true
        finish()
      }

      ws.onopen = () => {
        connection.reconnectAttempts = 0
        connection.opening = undefined
        settle(resolve)
      }

      ws.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(event.data as string)
          this.handlersFor(key).message.forEach((handler) => handler(data))
        } catch {
          // Malformed frame; ignore.
        }
      }

      ws.onerror = () => {
        settle(() => reject(new Error(`WebSocket error on ${key}`)))
      }

      ws.onclose = () => {
        connection.opening = undefined
        this.handlersFor(key).close.forEach((handler) => handler())
        settle(() => reject(new Error(`WebSocket ${key} closed before it opened`)))
        // Superseded by a newer socket for this key: nothing to clean up.
        if (this.connections.get(key) !== connection) return
        if (connection.intentionalDisconnect || connection.reconnectAttempts >= this.maxReconnectAttempts) {
          this.connections.delete(key)
          return
        }
        this.scheduleReconnect(room, roomId, connection)
      }
    })
    connection.opening = opening
    return opening
  }

  private scheduleReconnect(room: WebSocketRoom, roomId: string | undefined, connection: RoomConnection): void {
    const delay = Math.min(this.baseReconnectDelay * 2 ** connection.reconnectAttempts, 10000)
    connection.reconnectTimeout = setTimeout(() => {
      connection.reconnectTimeout = undefined
      if (connection.intentionalDisconnect) return
      connection.reconnectAttempts++
      this.connect(room, roomId).catch(() => {
        // onclose schedules the next attempt.
      })
    }, delay)
  }

  /** Stop retrying and close the socket. The entry must already be out of the map. */
  private teardown(connection: RoomConnection): void {
    connection.intentionalDisconnect = true
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout)
      connection.reconnectTimeout = undefined
    }
    if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
      connection.ws.close()
    }
  }

  disconnect(room: WebSocketRoom, roomId?: string): void {
    const key = this.key(room, roomId)
    const connection = this.connections.get(key)
    if (!connection) return
    this.connections.delete(key)
    this.teardown(connection)
  }

  send(room: WebSocketRoom, message: unknown, roomId?: string): boolean {
    const connection = this.connections.get(this.key(room, roomId))
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return false
    connection.ws.send(JSON.stringify(message))
    return true
  }

  onMessage(room: WebSocketRoom, handler: MessageHandler, roomId?: string): () => void {
    const set = this.handlersFor(this.key(room, roomId))
    set.message.add(handler)
    return () => {
      set.message.delete(handler)
    }
  }

  onClose(room: WebSocketRoom, handler: CloseHandler, roomId?: string): () => void {
    const set = this.handlersFor(this.key(room, roomId))
    set.close.add(handler)
    return () => {
      set.close.delete(handler)
    }
  }

  isConnected(room: WebSocketRoom, roomId?: string): boolean {
    const connection = this.connections.get(this.key(room, roomId))
    return connection ? connection.ws.readyState === WebSocket.OPEN : false
  }

  disconnectAll(): void {
    const all = [...this.connections.values()]
    this.connections.clear()
    all.forEach((connection) => this.teardown(connection))
  }
}
