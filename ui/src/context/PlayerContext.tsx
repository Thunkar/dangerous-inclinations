/**
 * PlayerContext - Manages player authentication and session
 *
 * This context handles:
 * - Player ID generation and persistence in localStorage
 * - Player name management
 * - Authentication state
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPlayer, getPlayer } from "../api/player";
import { ENV } from "../config/env";

// ============================================================================
// Types
// ============================================================================

interface PlayerContextValue {
  playerId: string | null;
  playerName: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setPlayerName: (name: string) => void;
  logout: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface PlayerProviderProps {
  children: ReactNode;
}

const STORAGE_KEY_PLAYER_ID = "playerId";
const DEFAULT_PLAYER_NAME = "Player";

export function PlayerProvider({ children }: PlayerProviderProps) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState<string>(DEFAULT_PLAYER_NAME);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize or restore player session
   * Only playerId is stored locally - player name comes from server
   */
  useEffect(() => {
    async function initializePlayer() {
      try {
        setIsLoading(true);
        setError(null);

        // Check if we have a stored player ID
        const storedPlayerId = localStorage.getItem(STORAGE_KEY_PLAYER_ID);

        if (storedPlayerId) {
          // Try to validate existing player ID with server
          const player = await getPlayer(storedPlayerId);

          if (player) {
            // Player exists on server, restore session (name comes from server)
            setPlayerId(player.playerId);
            setPlayerNameState(player.playerName);
            setIsAuthenticated(true);

            if (ENV.DEBUG) {
              console.log("[PlayerContext] Restored session:", player);
            }
          } else {
            // Player ID is invalid, create new player
            if (ENV.DEBUG) {
              console.log(
                "[PlayerContext] Stored player ID invalid, creating new player",
              );
            }
            localStorage.removeItem(STORAGE_KEY_PLAYER_ID);
            await createNewPlayer(DEFAULT_PLAYER_NAME);
          }
        } else {
          // No stored player ID, create new player
          await createNewPlayer(DEFAULT_PLAYER_NAME);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to initialize player";
        setError(message);
        console.error("[PlayerContext] Initialization error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    initializePlayer();
  }, []);

  /**
   * Create a new player on the server
   */
  async function createNewPlayer(name: string) {
    try {
      const response = await createPlayer(name);

      // Only store player ID - name comes from server
      localStorage.setItem(STORAGE_KEY_PLAYER_ID, response.playerId);

      setPlayerId(response.playerId);
      setPlayerNameState(response.playerName);
      setIsAuthenticated(true);

      if (ENV.DEBUG) {
        console.log("[PlayerContext] Created new player:", response);
      }
    } catch (err) {
      throw new Error(
        `Failed to create player: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Update player name (updates local state, should be synced to server via API)
   */
  const setPlayerName = useCallback(
    (name: string) => {
      if (!playerId) return;

      setPlayerNameState(name);

      // TODO: Add API call to update name on server
      // For now, the name will be updated when creating/joining a lobby

      if (ENV.DEBUG) {
        console.log("[PlayerContext] Updated player name:", name);
      }
    },
    [playerId],
  );

  /**
   * Logout - clears player session
   */
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_PLAYER_ID);
    setPlayerId(null);
    setPlayerNameState(DEFAULT_PLAYER_NAME);
    setIsAuthenticated(false);

    if (ENV.DEBUG) {
      console.log("[PlayerContext] Logged out");
    }
  }, []);

  const value: PlayerContextValue = {
    playerId,
    playerName,
    isAuthenticated,
    isLoading,
    error,
    setPlayerName,
    logout,
  };

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }

  return context;
}
