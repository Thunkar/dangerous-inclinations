/**
 * AnimationContext: the table in motion.
 *
 * Everything here is driven by the turn's `GameEvent[]`: nothing is inferred
 * by diffing states. When a turn arrives, GameContext hands us the previous
 * view, the next view and the events; we replay the events one at a time over
 * an overlay snapshot of the board (tokens move, beams flash, dice land) and
 * only then let the next view be committed.
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
import type { GameEvent, GameView, Position } from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'
import { getPlayerColor } from '../utils/playerColors'
import {
  beatStart,
  eventToBeat,
  shotFor,
  shotKey,
  type BoardOverlay,
  type CameraShot,
  type DieRoll,
  type EffectDraft,
  type TableEffect,
} from '../animation/beats'

interface AnimationContextValue {
  /** Non-null while a turn is being played; the board renders this instead of the view. */
  overlay: BoardOverlay | null
  effects: TableEffect[]
  /** Dice rolled during the turn just played, newest last. */
  dice: DieRoll[]
  /** Loadout ids that should flash (broken tiles, reveals). */
  pulses: Record<string, number>
  /** Skip the rest of the current animation. */
  skip: () => void
  /**
   * Find a ship: rings expand off it and its name floats up. Nothing about
   * the game changes. A ping is one player asking their own table where
   * somebody is, and only they see it.
   */
  ping: (playerId: string) => void
  /** The ping in progress, for renderers that answer it (the 3D camera flies there). */
  pinged: Ping | null
  /** Divides every beat and every mark's life: 1x is the pace turns are written at. */
  speed: PlaybackSpeed
  setSpeed: (speed: PlaybackSpeed) => void
  /** The moment the auto camera should frame, while a turn plays; null otherwise. */
  shot: CameraShot | null
  /**
   * Set by the 3D board while its auto camera is on: every turn plays slower
   * and each new shot gets a lead-in, so the camera has time to get there.
   */
  setCinematic: (on: boolean) => void
}

/** A ping: who was asked for, where they were, and which ping this is. */
export interface Ping {
  id: string
  playerId: string
  position: Position
}

const AnimationContext = createContext<AnimationContextValue | null>(null)

/**
 * The verbs, the speed and nothing that moves.
 *
 * The full context changes on every beat of a turn (the overlay and the
 * effects are rewritten dozens of times a playback), and everything that read
 * it re-rendered with it: the whole table, its log of every event so far and
 * its row of every turn so far, seventy-odd times a turn and a little more
 * every turn. Only the board needs the beats. The rest of the table reads
 * these three narrow contexts, which change when the speed does, when a die
 * lands and when a tile breaks.
 */
export type AnimationControls = Pick<
  AnimationContextValue,
  'skip' | 'ping' | 'speed' | 'setSpeed' | 'setCinematic'
>
const ControlsContext = createContext<AnimationControls | null>(null)
const DiceContext = createContext<DieRoll[]>([])
const PulsesContext = createContext<Record<string, number>>({})

/** Whose turn is playing over the board, and which playback this is. */
export interface Playback {
  id: string
  actorId: string
}
const PlaybackContext = createContext<Playback | null>(null)

/**
 * A ping: rings that expand off the hull, one after another, the way a
 * locator sweeps. Three is enough to catch an eye that is looking elsewhere
 * on the board; the whole thing is over in a second and a half.
 */
const PING = { rings: 3, stagger: 260, life: 900, radius: 52 } as const

/** Winds the whole table forward: every beat and every mark divides by it. */
export type PlaybackSpeed = 1 | 2 | 4
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4]
const SPEED_KEY = 'di.playbackSpeed'

function storedSpeed(): PlaybackSpeed {
  try {
    const raw = Number(localStorage.getItem(SPEED_KEY))
    if (PLAYBACK_SPEEDS.includes(raw as PlaybackSpeed)) return raw as PlaybackSpeed
  } catch {
    /* private window, blocked storage: 1x is the default anyway */
  }
  return 1
}

/**
 * The cinematic pace. `slow` divides the playback speed while the auto camera
 * is on, and `lead` is how long the table waits, at 1x, for the camera to fly
 * to a new shot before the event it frames plays out. The first shot of a
 * turn waits `firstLead`, long enough to read the banner naming whose turn it
 * is, and the last one is held `tail` after the turn's final event, so the
 * outcome is on screen for a moment before the camera cuts to the next ship.
 */
const CINEMA = { slow: 1.6, lead: 750, firstLead: 1300, tail: 1200 } as const

let effectSeq = 0
const nextId = (prefix: string) => `${prefix}-${++effectSeq}`

export function AnimationProvider({ children }: { children: ReactNode }) {
  const { registerAnimator, view } = useGame()
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null)
  const [effects, setEffects] = useState<TableEffect[]>([])
  const [dice, setDice] = useState<DieRoll[]>([])
  const [pulses, setPulses] = useState<Record<string, number>>({})

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef<(() => void) | null>(null)
  const [speed, setSpeedState] = useState<PlaybackSpeed>(storedSpeed)
  /**
   * The running animation reads the speed off a ref, not off the closure it
   * started in: winding forward mid-volley has to shorten the beats that are
   * still to come, not the next turn's.
   */
  const speedRef = useRef<PlaybackSpeed>(speed)
  const setSpeed = useCallback((next: PlaybackSpeed) => {
    speedRef.current = next
    setSpeedState(next)
    try {
      localStorage.setItem(SPEED_KEY, String(next))
    } catch {
      /* the speed just does not survive a reload */
    }
  }, [])
  const [shot, setShot] = useState<CameraShot | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)
  const cinematicRef = useRef(false)
  const setCinematic = useCallback((on: boolean) => {
    cinematicRef.current = on
  }, [])
  /** What every beat divides by: the chosen speed, slowed while the camera is directing. */
  const tempo = useCallback(() => speedRef.current / (cinematicRef.current ? CINEMA.slow : 1), [])
  /** One expiry timer per effect: the board's clock is no longer this context's business. */
  const expiryRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  const clearExpiries = useCallback(() => {
    for (const timer of expiryRef.current) clearTimeout(timer)
    expiryRef.current.clear()
  }, [])

  /**
   * An effect knows how long it lives when it is pushed, so it takes itself
   * off the table on a timer. Nothing here ticks per frame: the renderer that
   * draws the effect runs its own clock (`useBoardClock`).
   */
  const pushEffect = useCallback(
    (effect: EffectDraft) => {
      const life = effect.duration / tempo()
      const started = {
        ...effect,
        id: nextId(effect.kind),
        duration: life,
        start: performance.now(),
      } as TableEffect
      setEffects(prev => [...prev, started])
      const timer = setTimeout(() => {
        expiryRef.current.delete(timer)
        setEffects(prev => prev.filter(e => e !== started))
      }, life)
      expiryRef.current.add(timer)
    },
    [tempo]
  )

  /**
   * Pings are kept apart from the turn's own effects. A turn's animation
   * clears the table when it ends, and a ping is not part of any turn. It is
   * one player asking where somebody is, and it should not vanish because a
   * bot two seats over finished moving.
   */
  const [pingEffects, setPingEffects] = useState<TableEffect[]>([])
  const [pinged, setPinged] = useState<Ping | null>(null)
  const pingTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  const pushPing = useCallback((effect: EffectDraft) => {
    const started = { ...effect, id: nextId('ping'), start: performance.now() } as TableEffect
    setPingEffects(prev => [...prev, started])
    const timer = setTimeout(() => {
      pingTimersRef.current.delete(timer)
      setPingEffects(prev => prev.filter(e => e !== started))
    }, effect.duration)
    pingTimersRef.current.add(timer)
  }, [])

  const ping = useCallback(
    (playerId: string) => {
      const index = view.players.findIndex(p => p.id === playerId)
      const player = view.players[index]
      const ship = player?.ship
      if (!ship || ship.isDestroyed) return
      const position: Position = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector }
      const color = getPlayerColor(index)
      setPinged({ id: nextId('ping'), playerId, position })
      pushPing({
        kind: 'float',
        at: position,
        playerId,
        text: player.name,
        tone: 'good',
        duration: PING.life + PING.stagger * PING.rings,
      })
      for (let i = 0; i < PING.rings; i++) {
        const fire = () =>
          pushPing({
            kind: 'burst',
            at: position,
            playerId,
            color,
            radius: PING.radius,
            duration: PING.life,
          })
        if (i === 0) {
          fire()
          continue
        }
        const timer = setTimeout(() => {
          pingTimersRef.current.delete(timer)
          fire()
        }, i * PING.stagger)
        pingTimersRef.current.add(timer)
      }
    },
    [view.players, pushPing]
  )

  const animate = useCallback(
    (prev: GameView, next: GameView, events: GameEvent[], done: () => void) => {
      let state = beatStart(prev)
      setDice([])
      setOverlay(state.board)
      setPlayback({ id: nextId('playback'), actorId: prev.activePlayerId })

      const queue = [...events]
      let cancelled = false

      /** One event over the board: its marks, dice and flashes go up, and the board moves on. */
      const apply = (event: GameEvent): number => {
        const beat = eventToBeat(state, next, event, { now: performance.now(), tempo: tempo() })
        state = beat.state
        for (const effect of beat.effects) pushEffect(effect)
        if (beat.dice.length > 0)
          setDice(d => [...d, ...beat.dice.map(die => ({ ...die, id: nextId('die') }))])
        if (beat.pulses.length > 0) {
          const now = performance.now()
          setPulses(p => ({ ...p, ...Object.fromEntries(beat.pulses.map(key => [key, now])) }))
        }
        return beat.hold
      }

      let filming: string | null = null
      let held = false

      const finish = () => {
        if (cancelled) return
        cancelled = true
        skipRef.current = null
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
        setOverlay(null)
        setShot(null)
        setPlayback(null)
        done()
      }

      const play = () => {
        if (cancelled) return
        const event = queue.shift()
        if (!event) {
          finish()
          return
        }
        const hold = apply(event)
        setOverlay(state.board)
        if (hold <= 0) {
          step()
          return
        }
        timerRef.current = setTimeout(step, hold / tempo())
      }

      /**
       * Look at the next event before playing it: while the camera is
       * directing, a new shot is cued first and the event waits for the
       * camera to arrive.
       */
      const step = () => {
        if (cancelled) return
        const event = queue[0]
        if (!event) {
          // Hold the last shot on the outcome before letting the next turn in.
          if (cinematicRef.current && filming !== null && !held) {
            held = true
            timerRef.current = setTimeout(step, CINEMA.tail / speedRef.current)
            return
          }
          finish()
          return
        }
        const cue = cinematicRef.current ? shotFor(state, next, event) : null
        if (cue && shotKey(cue) !== filming) {
          const lead = filming === null ? CINEMA.firstLead : CINEMA.lead
          filming = shotKey(cue)
          setShot({ ...cue, id: nextId('shot'), start: performance.now() } as CameraShot)
          timerRef.current = setTimeout(play, lead / speedRef.current)
          return
        }
        play()
      }

      skipRef.current = () => {
        queue.length = 0
        finish()
      }
      step()

      // Handed to the view queue: a replay seek (or a change of seat) stops the
      // turn where it stands instead of letting it finish over the new view.
      return () => {
        if (cancelled) return
        cancelled = true
        skipRef.current = null
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
        clearExpiries()
        setOverlay(null)
        setShot(null)
        setPlayback(null)
        setEffects([])
        setDice([])
      }
    },
    [pushEffect, clearExpiries, tempo]
  )

  useEffect(() => {
    registerAnimator(animate)
    return () => registerAnimator(null)
  }, [registerAnimator, animate])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      clearExpiries()
      for (const timer of pingTimersRef.current) clearTimeout(timer)
      pingTimersRef.current.clear()
    },
    [clearExpiries]
  )

  const skip = useCallback(() => skipRef.current?.(), [])

  const onTable = useMemo(
    () => (pingEffects.length === 0 ? effects : [...effects, ...pingEffects]),
    [effects, pingEffects]
  )

  const value = useMemo<AnimationContextValue>(
    () => ({
      overlay,
      effects: onTable,
      dice,
      pulses,
      skip,
      ping,
      pinged,
      speed,
      setSpeed,
      shot,
      setCinematic,
    }),
    [overlay, onTable, dice, pulses, skip, ping, pinged, speed, setSpeed, shot, setCinematic]
  )

  const controls = useMemo<AnimationControls>(
    () => ({ skip, ping, speed, setSpeed, setCinematic }),
    [skip, ping, speed, setSpeed, setCinematic]
  )

  return (
    <AnimationContext.Provider value={value}>
      <ControlsContext.Provider value={controls}>
        <DiceContext.Provider value={dice}>
          <PulsesContext.Provider value={pulses}>
            <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>
          </PulsesContext.Provider>
        </DiceContext.Provider>
      </ControlsContext.Provider>
    </AnimationContext.Provider>
  )
}

const EMPTY: AnimationContextValue = {
  overlay: null,
  effects: [],
  dice: [],
  pulses: {},
  skip: () => {},
  ping: () => {},
  pinged: null,
  speed: 1,
  setSpeed: () => {},
  shot: null,
  setCinematic: () => {},
}

/** Everything, beat by beat. For the board model; the rest of the table wants a narrower hook. */
export function useAnimation(): AnimationContextValue {
  return useContext(AnimationContext) ?? EMPTY
}

export function useAnimationControls(): AnimationControls {
  return useContext(ControlsContext) ?? EMPTY
}

/** Dice rolled during the turn just played, newest last. */
export function useDice(): DieRoll[] {
  return useContext(DiceContext)
}

/** Loadout ids that should flash, stamped with when. */
/** The turn playing over the board, or null between turns. Changes twice a turn. */
export function usePlayback(): Playback | null {
  return useContext(PlaybackContext)
}

export function usePulses(): Record<string, number> {
  return useContext(PulsesContext)
}
