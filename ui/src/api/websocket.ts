/**
 * WebSocket client with room support
 * Handles connections to different "rooms" (global, lobby, game)
 */

import { ENV } from "../config/env";

type MessageHandler = (data: any) => void;
type ErrorHandler = (error: Event) => void;
type CloseHandler = () => void;

export type WebSocketRoom = "global" | "lobby" | "game";

interface RoomConnection {
  ws: WebSocket;
  room: WebSocketRoom;
  roomId?: string; // For lobby/game rooms
  reconnectAttempts: number;
  reconnectTimeout?: ReturnType<typeof setTimeout>;
  messageHandlers: Set<MessageHandler>;
  errorHandlers: Set<ErrorHandler>;
  closeHandlers: Set<CloseHandler>;
  intentionalDisconnect: boolean; // Flag to prevent auto-reconnect
}

/**
 * WebSocket client that manages multiple room connections
 */
export class GameWebSocketClient {
  private connections: Map<string, RoomConnection> = new Map();
  private playerId: string;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Get connection key for a room
   */
  private getConnectionKey(room: WebSocketRoom, roomId?: string): string {
    return roomId ? `${room}:${roomId}` : room;
  }

  /**
   * Connect to a WebSocket room
   */
  async connect(
    room: WebSocketRoom,
    roomId?: string,
  ): Promise<RoomConnection> {
    const key = this.getConnectionKey(room, roomId);

    // If already connected, return existing connection
    const existing = this.connections.get(key);
    if (
      existing &&
      (existing.ws.readyState === WebSocket.OPEN ||
        existing.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (ENV.DEBUG) {
        console.log(`[WS] Already connected to ${key}`);
      }
      return existing;
    }

    return new Promise((resolve, reject) => {
      // Build WebSocket URL
      let wsUrl = `${ENV.WS_URL}/ws/${room}?playerId=${this.playerId}`;
      if (roomId) {
        wsUrl += `&roomId=${roomId}`;
      }

      if (ENV.DEBUG) {
        console.log(`[WS] Connecting to ${key}:`, wsUrl);
      }

      const ws = new WebSocket(wsUrl);

      const connection: RoomConnection = {
        ws,
        room,
        roomId,
        reconnectAttempts: 0,
        messageHandlers: new Set(),
        errorHandlers: new Set(),
        closeHandlers: new Set(),
        intentionalDisconnect: false,
      };

      // Setup event handlers
      ws.onopen = () => {
        connection.reconnectAttempts = 0;
        if (ENV.DEBUG) {
          console.log(`[WS] Connected to ${key}`);
        }
        this.connections.set(key, connection);
        resolve(connection);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (ENV.DEBUG) {
            console.log(`[WS] Message from ${key}:`, data);
          }
          // Notify all handlers
          connection.messageHandlers.forEach((handler) => handler(data));
        } catch (error) {
          console.error(`[WS] Failed to parse message from ${key}:`, error);
        }
      };

      ws.onerror = (error) => {
        console.error(`[WS] Error on ${key}:`, error);
        connection.errorHandlers.forEach((handler) => handler(error));
        reject(error);
      };

      ws.onclose = () => {
        if (ENV.DEBUG) {
          console.log(`[WS] Connection closed: ${key}, intentional: ${connection.intentionalDisconnect}`);
        }

        // Notify close handlers
        connection.closeHandlers.forEach((handler) => handler());

        // Remove from connections
        this.connections.delete(key);

        // Only attempt reconnection if this wasn't an intentional disconnect
        if (!connection.intentionalDisconnect) {
          this.scheduleReconnect(room, roomId, connection);
        }
      };
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(
    room: WebSocketRoom,
    roomId: string | undefined,
    connection: RoomConnection,
  ): void {
    if (connection.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[WS] Max reconnect attempts reached for ${room}${roomId ? `:${roomId}` : ""}`,
      );
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * 2 ** connection.reconnectAttempts,
      10000,
    );

    if (ENV.DEBUG) {
      console.log(
        `[WS] Reconnecting to ${room}${roomId ? `:${roomId}` : ""} in ${delay}ms...`,
      );
    }

    connection.reconnectTimeout = setTimeout(async () => {
      connection.reconnectAttempts++;
      try {
        const newConnection = await this.connect(room, roomId);
        // Transfer handlers to new connection
        newConnection.messageHandlers = new Set(connection.messageHandlers);
        newConnection.errorHandlers = new Set(connection.errorHandlers);
        newConnection.closeHandlers = new Set(connection.closeHandlers);
      } catch (error) {
        console.error(`[WS] Reconnection failed:`, error);
      }
    }, delay);
  }

  /**
   * Disconnect from a room
   */
  disconnect(room: WebSocketRoom, roomId?: string): void {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);

    if (connection) {
      // Mark as intentional disconnect to prevent auto-reconnect
      connection.intentionalDisconnect = true;

      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
      }

      if (
        connection.ws.readyState === WebSocket.OPEN ||
        connection.ws.readyState === WebSocket.CONNECTING
      ) {
        connection.ws.close();
      }

      this.connections.delete(key);

      if (ENV.DEBUG) {
        console.log(`[WS] Disconnected from ${key}`);
      }
    }
  }

  /**
   * Send a message to a room
   */
  send(room: WebSocketRoom, message: any, roomId?: string): void {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);

    if (!connection) {
      console.error(`[WS] Not connected to ${key}`);
      return;
    }

    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
      if (ENV.DEBUG) {
        console.log(`[WS] Sent to ${key}:`, message);
      }
    } else {
      console.error(`[WS] WebSocket not ready for ${key}`);
    }
  }

  /**
   * Add message handler for a room
   */
  onMessage(
    room: WebSocketRoom,
    handler: MessageHandler,
    roomId?: string,
  ): () => void {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);

    if (connection) {
      connection.messageHandlers.add(handler);
    }

    // Return cleanup function
    return () => {
      const conn = this.connections.get(key);
      if (conn) {
        conn.messageHandlers.delete(handler);
      }
    };
  }

  /**
   * Add error handler for a room
   */
  onError(
    room: WebSocketRoom,
    handler: ErrorHandler,
    roomId?: string,
  ): () => void {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);

    if (connection) {
      connection.errorHandlers.add(handler);
    }

    return () => {
      const conn = this.connections.get(key);
      if (conn) {
        conn.errorHandlers.delete(handler);
      }
    };
  }

  /**
   * Add close handler for a room
   */
  onClose(
    room: WebSocketRoom,
    handler: CloseHandler,
    roomId?: string,
  ): () => void {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);

    if (connection) {
      connection.closeHandlers.add(handler);
    }

    return () => {
      const conn = this.connections.get(key);
      if (conn) {
        conn.closeHandlers.delete(handler);
      }
    };
  }

  /**
   * Check if connected to a room
   */
  isConnected(room: WebSocketRoom, roomId?: string): boolean {
    const key = this.getConnectionKey(room, roomId);
    const connection = this.connections.get(key);
    return connection ? connection.ws.readyState === WebSocket.OPEN : false;
  }

  /**
   * Disconnect all connections
   */
  disconnectAll(): void {
    this.connections.forEach((connection) => {
      // Mark as intentional disconnect to prevent auto-reconnect
      connection.intentionalDisconnect = true;

      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
      }
      if (
        connection.ws.readyState === WebSocket.OPEN ||
        connection.ws.readyState === WebSocket.CONNECTING
      ) {
        connection.ws.close();
      }
    });
    this.connections.clear();

    if (ENV.DEBUG) {
      console.log("[WS] Disconnected from all rooms");
    }
  }
}
