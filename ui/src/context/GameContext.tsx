/**
 * GameContext - the game as seen from this seat.
 *
 * Holds a `GameView` (never a GameState) and the visible event history.
 * Incoming turns are queued: an animator registered by the board plays each
 * turn's events before the next view is committed, so the table shows one
 * thing happening at a time.
 *
 * Two providers share the same context shape:
 *   - GameProvider: a live game over the WebSocket (fetches the view by id).
 *   - ReplayGameProvider: a finished recording, viewed through `viewFor`
 *     for a chosen perspective.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { GameEvent, GameRecording, GameView, PlayerAction, ShipLoadout } from '@dangerous-inclinations/engine'
import { filterEventsFor, reconstructStateAtTurn, viewFor } from '@dangerous-inclinations/engine'
import type { GameSocketMessage, SubmitTurnMessage } from '../api/types'
import { getGame, submitLoadout as submitLoadoutAPI, deployShip as deployShipAPI } from '../api/game'
import { useWebSocket } from './WebSocketContext'
import { usePlayer } from './PlayerContext'

/**
 * Plays one turn's events from `prev` to `next`, then calls `done`.
 * May return a cancel function: the queue calls it when the table is reset
 * (a replay seek, a change of seat) so a half-played turn stops at once.
 */
export type Animator = (
  prev: GameView,
  next: GameView,
  events: GameEvent[],
  done: () => void,
) => void | (() => void)

export interface GameContextValue {
  /** Live game id, or null for a replay. */
  gameId: string | null
  view: GameView
  /** Every event this seat may see, oldest first. */
  log: GameEvent[]
  turnErrors: string[]
  clearTurnErrors: () => void
  isAnimating: boolean
  /** Replays and spectators cannot act. */
  readOnly: boolean
  nameOf: (playerId: string) => string
  submitTurn: (actions: PlayerAction[]) => void
  submitLoadout: (loadout: ShipLoadout, missionIds: string[]) => Promise<void>
  deploy: (sector: number) => Promise<void>
  registerAnimator: (animator: Animator | null) => void
}

const GameContext = createContext<GameContextValue | undefined>(undefined)

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used within a GameProvider')
  return context
}

// ---------------------------------------------------------------------------
// Shared view queue
// ---------------------------------------------------------------------------

interface QueuedUpdate {
  view: GameView
  events: GameEvent[]
  animate: boolean
  /** Replace the log with `events` instead of appending. */
  replaceLog?: boolean
}

function useViewQueue(initialView: GameView, initialLog: GameEvent[]) {
  const [view, setView] = useState<GameView>(initialView)
  const [log, setLog] = useState<GameEvent[]>(initialLog)
  const [isAnimating, setIsAnimating] = useState(false)
  const animatorRef = useRef<Animator | null>(null)
  const cancelAnimationRef = useRef<(() => void) | null>(null)
  const queueRef = useRef<QueuedUpdate[]>([])
  const processingRef = useRef(false)
  const viewRef = useRef<GameView>(initialView)
  const latestRef = useRef<GameView>(initialView)
  const unmountedRef = useRef(false)
  /**
   * Bumped by `reset`. A turn already playing captures the generation it
   * started in; when it finishes it only commits if that is still current, so
   * a seek while the board is animating cannot overwrite the view it jumped to.
   */
  const generationRef = useRef(0)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const commit = useCallback((update: QueuedUpdate) => {
    viewRef.current = update.view
    setView(update.view)
    setLog((prev) => (update.replaceLog ? update.events : [...prev, ...update.events]))
  }, [])

  const pump = useCallback(() => {
    if (unmountedRef.current) return
    const generation = generationRef.current
    const next = queueRef.current.shift()
    if (!next) {
      processingRef.current = false
      setIsAnimating(false)
      return
    }
    processingRef.current = true
    const animator = animatorRef.current
    if (next.animate && animator && next.events.length > 0) {
      setIsAnimating(true)
      const cancel = animator(viewRef.current, next.view, next.events, () => {
        if (unmountedRef.current || generationRef.current !== generation) return
        cancelAnimationRef.current = null
        commit(next)
        // Let React paint the committed view before the next turn plays.
        setTimeout(() => {
          if (generationRef.current === generation) pump()
        }, 60)
      })
      cancelAnimationRef.current = typeof cancel === 'function' ? cancel : null
    } else {
      commit(next)
      pump()
    }
  }, [commit])

  const enqueue = useCallback(
    (update: QueuedUpdate) => {
      latestRef.current = update.view
      queueRef.current.push(update)
      if (!processingRef.current) pump()
    },
    [pump],
  )

  const reset = useCallback((nextView: GameView, nextLog: GameEvent[]) => {
    generationRef.current++
    cancelAnimationRef.current?.()
    cancelAnimationRef.current = null
    queueRef.current = []
    processingRef.current = false
    latestRef.current = nextView
    viewRef.current = nextView
    setIsAnimating(false)
    setView(nextView)
    setLog(nextLog)
  }, [])

  const registerAnimator = useCallback((animator: Animator | null) => {
    animatorRef.current = animator
  }, [])

  return { view, log, isAnimating, enqueue, reset, registerAnimator, latestRef }
}

function makeNameOf(view: GameView) {
  return (playerId: string) => view.players.find((p) => p.id === playerId)?.name ?? playerId
}

// ---------------------------------------------------------------------------
// Live game
// ---------------------------------------------------------------------------

function isGameMessage(data: unknown): data is GameSocketMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string'
}

interface LiveGameProps {
  gameId: string
  initialView: GameView
  initialEvents: GameEvent[]
  children: ReactNode
}

function LiveGameProvider({ gameId, initialView, initialEvents, children }: LiveGameProps) {
  const { client, connect } = useWebSocket()
  const { playerId } = usePlayer()
  const { view, log, isAnimating, enqueue, registerAnimator, latestRef } = useViewQueue(initialView, initialEvents)
  const [turnErrors, setTurnErrors] = useState<string[]>([])

  useEffect(() => {
    if (!client) return
    let cancelled = false

    const unsubscribe = client.onMessage(
      'game',
      (data) => {
        if (!isGameMessage(data)) return
        switch (data.type) {
          case 'GAME_VIEW':
            enqueue({ view: data.payload.view, events: data.payload.events, animate: false, replaceLog: true })
            break
          case 'TURN_EXECUTED':
            enqueue({ view: data.payload.view, events: data.payload.events, animate: !data.payload.rewind })
            break
          case 'TURN_ERROR':
            setTurnErrors(data.payload.errors ?? (data.payload.error ? [data.payload.error] : ['Turn rejected']))
            break
          default:
            break
        }
      },
      gameId,
    )

    connect('game', gameId).catch(() => {
      if (!cancelled) setTurnErrors(['Lost connection to the game'])
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [client, connect, gameId, enqueue])

  const submitTurn = useCallback(
    (actions: PlayerAction[]) => {
      const latest = latestRef.current
      const message: SubmitTurnMessage = {
        type: 'SUBMIT_TURN',
        payload: { actions, turn: latest.turn, activePlayerId: latest.activePlayerId },
      }
      setTurnErrors([])
      if (!client?.send('game', message, gameId)) {
        setTurnErrors(['Not connected to the game'])
      }
    },
    [client, gameId, latestRef],
  )

  const submitLoadout = useCallback(
    async (loadout: ShipLoadout, missionIds: string[]) => {
      const result = await submitLoadoutAPI(gameId, loadout, missionIds)
      enqueue({ view: result.view, events: [], animate: false })
    },
    [gameId, enqueue],
  )

  const deploy = useCallback(
    async (sector: number) => {
      const result = await deployShipAPI(gameId, sector)
      enqueue({ view: result.view, events: [], animate: false })
    },
    [gameId, enqueue],
  )

  const nameOf = useMemo(() => makeNameOf(view), [view])
  const clearTurnErrors = useCallback(() => setTurnErrors([]), [])

  const value = useMemo<GameContextValue>(
    () => ({
      gameId,
      view,
      log,
      turnErrors,
      clearTurnErrors,
      isAnimating,
      readOnly: view.me === null || view.me.id !== playerId,
      nameOf,
      submitTurn,
      submitLoadout,
      deploy,
      registerAnimator,
    }),
    [
      gameId,
      view,
      log,
      turnErrors,
      clearTurnErrors,
      isAnimating,
      playerId,
      nameOf,
      submitTurn,
      submitLoadout,
      deploy,
      registerAnimator,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

interface GameProviderProps {
  gameId: string
  children: ReactNode
  /** Rendered while the first view loads. */
  fallback?: ReactNode
  /** Rendered if the view cannot be loaded. */
  renderError?: (message: string) => ReactNode
}

/** Loads the view for `gameId` and keeps it live over the WebSocket. */
export function GameProvider({ gameId, children, fallback = null, renderError }: GameProviderProps) {
  const { isLoading: playerLoading } = usePlayer()
  const [initial, setInitial] = useState<{ view: GameView; events: GameEvent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (playerLoading) return
    let cancelled = false
    setInitial(null)
    setError(null)
    getGame(gameId)
      .then((response) => {
        if (!cancelled) setInitial({ view: response.view, events: response.events ?? [] })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [gameId, playerLoading])

  if (error) return <>{renderError ? renderError(error) : null}</>
  if (!initial) return <>{fallback}</>

  return (
    <LiveGameProvider key={gameId} gameId={gameId} initialView={initial.view} initialEvents={initial.events}>
      {children}
    </LiveGameProvider>
  )
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

interface ReplayGameProviderProps {
  recording: GameRecording
  /** -1 = initial state; n = after turn n. */
  turnIndex: number
  /** Whose seat to look from; null = spectator (public information only). */
  perspectiveId: string | null
  children: ReactNode
}

function replayView(recording: GameRecording, turnIndex: number, perspectiveId: string | null): GameView {
  return viewFor(reconstructStateAtTurn(recording, turnIndex), perspectiveId)
}

function replayLog(recording: GameRecording, turnIndex: number, perspectiveId: string | null): GameEvent[] {
  return recording.turns.slice(0, Math.max(0, turnIndex + 1)).flatMap((t) => filterEventsFor(t.events, perspectiveId))
}

export function ReplayGameProvider({ recording, turnIndex, perspectiveId, children }: ReplayGameProviderProps) {
  const initialView = useMemo(() => replayView(recording, turnIndex, perspectiveId), [recording, turnIndex, perspectiveId])
  const initialLog = useMemo(() => replayLog(recording, turnIndex, perspectiveId), [recording, turnIndex, perspectiveId])
  const { view, log, isAnimating, enqueue, reset, registerAnimator } = useViewQueue(initialView, initialLog)
  const lastRef = useRef<{ turnIndex: number; perspectiveId: string | null; recording: GameRecording }>({
    turnIndex,
    perspectiveId,
    recording,
  })

  useEffect(() => {
    const last = lastRef.current
    lastRef.current = { turnIndex, perspectiveId, recording }
    if (last.recording === recording && last.perspectiveId === perspectiveId && last.turnIndex === turnIndex) return

    const nextView = replayView(recording, turnIndex, perspectiveId)
    const stepForward = last.recording === recording && last.perspectiveId === perspectiveId && turnIndex === last.turnIndex + 1
    if (stepForward) {
      const events = filterEventsFor(recording.turns[turnIndex]?.events ?? [], perspectiveId)
      enqueue({ view: nextView, events, animate: true })
    } else {
      reset(nextView, replayLog(recording, turnIndex, perspectiveId))
    }
  }, [recording, turnIndex, perspectiveId, enqueue, reset])

  const nameOf = useMemo(() => makeNameOf(view), [view])
  const noop = useCallback(() => {}, [])
  const asyncNoop = useCallback(async () => {}, [])

  const value = useMemo<GameContextValue>(
    () => ({
      gameId: null,
      view,
      log,
      turnErrors: [],
      clearTurnErrors: noop,
      isAnimating,
      readOnly: true,
      nameOf,
      submitTurn: noop,
      submitLoadout: asyncNoop,
      deploy: asyncNoop,
      registerAnimator,
    }),
    [view, log, isAnimating, nameOf, noop, asyncNoop, registerAnimator],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
