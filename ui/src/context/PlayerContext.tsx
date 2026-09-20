/**
 * PlayerContext - who is sitting at this seat.
 *
 * Only the player id is stored locally; the name comes from the server.
 * `playerId` is the perspective every game screen renders from.
 *
 * A stored id is only ever thrown away when the server says it does not know
 * it. If the server cannot be reached, the id stays put and the app offers to
 * try again. Losing a seat (and with it a game in progress) to a dropped
 * connection is not a trade worth making.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { STORAGE_KEY_PLAYER_ID } from '../api/client'
import { createPlayer, getPlayer, updatePlayerName as updatePlayerNameApi } from '../api/player'

interface PlayerContextValue {
  playerId: string | null
  playerName: string
  isAuthenticated: boolean
  /** True for a freshly created player who has not picked a name yet. */
  isNewPlayer: boolean
  isLoading: boolean
  error: string | null
  /** True when the error is transient and the stored identity is still intact. */
  canRetry: boolean
  /** Ask the server again, keeping the stored id. */
  retry: () => void
  setPlayerName: (name: string) => Promise<void>
  clearNewPlayerFlag: () => void
  logout: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const DEFAULT_PLAYER_NAME = 'Player'

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerNameState] = useState<string>(DEFAULT_PLAYER_NAME)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isNewPlayer, setIsNewPlayer] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function createNewPlayer(name: string) {
      const response = await createPlayer(name)
      if (cancelled) return
      localStorage.setItem(STORAGE_KEY_PLAYER_ID, response.playerId)
      setPlayerId(response.playerId)
      setPlayerNameState(response.playerName)
      setIsAuthenticated(true)
      setIsNewPlayer(true)
    }

    async function initialise() {
      setIsLoading(true)
      setError(null)
      setCanRetry(false)
      try {
        const storedPlayerId = localStorage.getItem(STORAGE_KEY_PLAYER_ID)
        if (storedPlayerId) {
          let player
          try {
            player = await getPlayer(storedPlayerId)
          } catch (err) {
            // The server could not be asked: keep the id and offer a retry.
            if (cancelled) return
            setError(
              err instanceof Error
                ? `Could not reach the server (${err.message}). Your seat is still saved.`
                : 'Could not reach the server. Your seat is still saved.',
            )
            setCanRetry(true)
            return
          }
          if (cancelled) return
          if (player) {
            setPlayerId(player.playerId)
            setPlayerNameState(player.playerName)
            setIsAuthenticated(true)
            setIsNewPlayer(false)
            return
          }
          // A 404: this player really is gone.
          localStorage.removeItem(STORAGE_KEY_PLAYER_ID)
        }
        await createNewPlayer(DEFAULT_PLAYER_NAME)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to initialise player')
        setCanRetry(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    initialise()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const setPlayerName = useCallback(
    async (name: string) => {
      if (!playerId) return
      setPlayerNameState(name)
      try {
        await updatePlayerNameApi(playerId, name)
      } catch {
        // Local state is already updated; the server keeps the old name until the next sync.
      }
    },
    [playerId],
  )

  const clearNewPlayerFlag = useCallback(() => setIsNewPlayer(false), [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_PLAYER_ID)
    setPlayerId(null)
    setPlayerNameState(DEFAULT_PLAYER_NAME)
    setIsAuthenticated(false)
    setIsNewPlayer(false)
  }, [])

  return (
    <PlayerContext.Provider
      value={{
        playerId,
        playerName,
        isAuthenticated,
        isNewPlayer,
        isLoading,
        error,
        canRetry,
        retry,
        setPlayerName,
        clearNewPlayerFlag,
        logout,
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider')
  return context
}
