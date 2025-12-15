/**
 * WebSocketContext - Manages WebSocket connections across the app
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { GameWebSocketClient } from "../api/websocket";
import { usePlayer } from "./PlayerContext";

interface WebSocketContextValue {
  client: GameWebSocketClient | null;
  isConnected: (room: "global" | "lobby" | "game", roomId?: string) => boolean;
  connect: (room: "global" | "lobby" | "game", roomId?: string) => Promise<void>;
  disconnect: (room: "global" | "lobby" | "game", roomId?: string) => void;
  send: (room: "global" | "lobby" | "game", message: any, roomId?: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { playerId, isAuthenticated } = usePlayer();
  const [client, setClient] = useState<GameWebSocketClient | null>(null);

  // Initialize client when player is authenticated
  useEffect(() => {
    if (isAuthenticated && playerId) {
      const wsClient = new GameWebSocketClient(playerId);
      setClient(wsClient);

      // Cleanup on unmount
      return () => {
        wsClient.disconnectAll();
      };
    }
  }, [isAuthenticated, playerId]);

  const connect = useCallback(
    async (room: "global" | "lobby" | "game", roomId?: string) => {
      if (!client) {
        throw new Error("WebSocket client not initialized");
      }
      await client.connect(room, roomId);
    },
    [client],
  );

  const disconnect = useCallback(
    (room: "global" | "lobby" | "game", roomId?: string) => {
      if (!client) return;
      client.disconnect(room, roomId);
    },
    [client],
  );

  const send = useCallback(
    (room: "global" | "lobby" | "game", message: any, roomId?: string) => {
      if (!client) {
        console.error("[WebSocketContext] Client not initialized");
        return;
      }
      client.send(room, message, roomId);
    },
    [client],
  );

  const isConnected = useCallback(
    (room: "global" | "lobby" | "game", roomId?: string): boolean => {
      if (!client) return false;
      return client.isConnected(room, roomId);
    },
    [client],
  );

  const value: WebSocketContextValue = {
    client,
    isConnected,
    connect,
    disconnect,
    send,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }

  return context;
}
