/**
 * AnimationContext — the table in motion.
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
import type {
  Facing,
  GameEvent,
  GameView,
  Missile,
  Position,
  Station,
  WeaponType,
} from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'
import { positionPoint, type Point } from '../components/board/geometry'

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type FloatTone = 'damage' | 'shield' | 'heat' | 'miss' | 'crit' | 'good'

export type TableEffect =
  | {
      id: string
      kind: 'beam'
      weapon: WeaponType | 'pdc'
      from: Point
      to: Point
      color: string
      start: number
      duration: number
    }
  | {
      id: string
      kind: 'float'
      at: Point
      text: string
      tone: FloatTone
      start: number
      duration: number
    }
  | {
      id: string
      kind: 'burst'
      at: Point
      color: string
      radius: number
      start: number
      duration: number
    }
  /** Nothing drawn: keeps the clock ticking while a ship token slides to its new sector. */
  | { id: string; kind: 'tween'; start: number; duration: number }

/** An effect before its timestamp is stamped on it (distributes over the union). */
type EffectDraft = TableEffect extends infer T
  ? T extends TableEffect
    ? Omit<T, 'start'>
    : never
  : never

export interface DieRoll {
  id: string
  roll: number
  /** 10, or 8 when the attacker is visibly running a sensor array. */
  critThreshold: number
  outcome: 'miss' | 'hit' | 'critical' | 'destroyed' | 'leaked'
  attackerId: string
  targetId: string
  label: string
}

/** What the board draws while a turn plays out. */
export interface ShipMotion {
  from: Position
  start: number
  duration: number
}

export interface BoardOverlay {
  ships: Record<string, { position: Position; facing: Facing; alive: boolean; motion?: ShipMotion }>
  missiles: Missile[]
  stations: Station[]
}

interface AnimationContextValue {
  /** Non-null while a turn is being played; the board renders this instead of the view. */
  overlay: BoardOverlay | null
  effects: TableEffect[]
  /** Dice rolled during the turn just played, newest last. */
  dice: DieRoll[]
  /** Mat ids that should flash (broken tiles, reveals). */
  pulses: Record<string, number>
  now: number
  /** Skip the rest of the current animation. */
  skip: () => void
}

const AnimationContext = createContext<AnimationContextValue | null>(null)

const BEAM_COLORS: Record<WeaponType | 'pdc', string> = {
  railgun: '#ffb445',
  laser: '#ff6b5e',
  missiles: '#ff9a63',
  ballistic_rack: '#49c3ff',
  pdc: '#49c3ff',
}

/** How long each event holds the table, in ms. */
const BEAT = {
  move: 420,
  jump: 480,
  fire: 240,
  resolve: 760,
  missile: 260,
  intercept: 600,
  small: 240,
  destroy: 620,
} as const

let effectSeq = 0
const nextId = (prefix: string) => `${prefix}-${++effectSeq}`

function snapshotOf(view: GameView): BoardOverlay {
  const ships: BoardOverlay['ships'] = {}
  for (const player of view.players) {
    if (!player.ship) continue
    ships[player.id] = {
      position: { wellId: player.ship.wellId, ring: player.ship.ring, sector: player.ship.sector },
      facing: player.ship.facing,
      alive: !player.ship.isDestroyed,
    }
  }
  return { ships, missiles: view.missiles, stations: view.stations }
}

/**
 * Where the critical band starts for a shot by `attackerId`, as far as this
 * seat can tell. The bonus is real only for a sensor array that is powered
 * (RULES: criticals on 8–10 *while powered*) and unbroken — and we may only
 * draw it when the tile is face-up at the table, or is our own. A tile we
 * learned through a scan is face-down to everyone else, so it never widens
 * the band we print for the table to read.
 */
function critThresholdFor(view: GameView, attackerId: string): number {
  const attacker = view.players.find(p => p.id === attackerId)
  if (!attacker) return 10
  const minEnergy = getSubsystemConfig('sensor_array').minEnergy
  const visiblySensing = attacker.slots.some(
    slot =>
      slot.type === 'sensor_array' &&
      (attacker.isMe ? slot.knownVia === 'own' : slot.knownVia === 'revealed') &&
      slot.isBroken !== true &&
      slot.allocatedEnergy >= minEnergy
  )
  return visiblySensing ? 8 : 10
}

export function AnimationProvider({ children }: { children: ReactNode }) {
  const { registerAnimator } = useGame()
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null)
  const [effects, setEffects] = useState<TableEffect[]>([])
  const [dice, setDice] = useState<DieRoll[]>([])
  const [pulses, setPulses] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => performance.now())

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef<(() => void) | null>(null)

  // Clock: only runs while something is on screen.
  useEffect(() => {
    if (effects.length === 0) return
    let frame = 0
    const tick = () => {
      const t = performance.now()
      setNow(t)
      setEffects(prev => {
        const alive = prev.filter(e => t - e.start < e.duration)
        return alive.length === prev.length ? prev : alive
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [effects.length])

  const pushEffect = useCallback((effect: EffectDraft) => {
    setEffects(prev => [...prev, { ...effect, start: performance.now() } as TableEffect])
  }, [])

  const animate = useCallback(
    (prev: GameView, next: GameView, events: GameEvent[], done: () => void) => {
      const snap = snapshotOf(prev)
      setDice([])
      setOverlay({ ...snap })

      const pointOf = (playerId: string): Point => {
        const ship = snap.ships[playerId]
        if (ship) return positionPoint(ship.position)
        const fromNext = next.players.find(p => p.id === playerId)?.ship
        if (fromNext)
          return positionPoint({
            wellId: fromNext.wellId,
            ring: fromNext.ring,
            sector: fromNext.sector,
          })
        return { x: 0, y: 0 }
      }

      /** Move a token; it slides from where it was over `duration` ms. */
      const moveShip = (
        playerId: string,
        to: Position,
        facing?: Facing,
        duration: number = BEAT.move
      ) => {
        const current = snap.ships[playerId]
        snap.ships[playerId] = {
          position: to,
          facing: facing ?? current?.facing ?? 'prograde',
          alive: true,
          motion:
            current && current.alive
              ? { from: current.position, start: performance.now(), duration }
              : undefined,
        }
        if (current && current.alive) pushEffect({ id: nextId('tween'), kind: 'tween', duration })
      }

      // Ships that have already taken their move this turn: a missile launched
      // after its owner moved rode along with the ship, so it does not drift
      // again at the end of the turn (RULES §Weapons → Missiles).
      const movedThisTurn = new Set<string>()

      const queue = [...events]
      let cancelled = false

      const apply = (event: GameEvent): number => {
        switch (event.type) {
          case 'rotated':
            if (snap.ships[event.playerId]) snap.ships[event.playerId].facing = event.facing
            return BEAT.small
          case 'coasted':
            moveShip(event.playerId, event.to)
            movedThisTurn.add(event.playerId)
            return BEAT.move
          case 'burned':
            moveShip(event.playerId, event.to)
            movedThisTurn.add(event.playerId)
            return BEAT.move
          case 'jumped':
            moveShip(event.playerId, event.to, undefined, BEAT.jump)
            movedThisTurn.add(event.playerId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: positionPoint(event.to),
              color: '#ffb445',
              radius: 30,
              duration: 600,
            })
            return BEAT.jump
          case 'recoil':
            if (event.to) moveShip(event.playerId, event.to, undefined, BEAT.small)
            return event.to ? BEAT.small : 0
          case 'respawned':
          case 'deployed': {
            const position = event.position
            moveShip(event.playerId, position)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: positionPoint(position),
              color: '#46d191',
              radius: 26,
              duration: 600,
            })
            return BEAT.small
          }
          case 'weapon_fired': {
            pushEffect({
              id: nextId('beam'),
              kind: 'beam',
              weapon: event.weaponType,
              from: pointOf(event.attackerId),
              to: pointOf(event.targetId),
              color: BEAM_COLORS[event.weaponType],
              duration: 520,
            })
            return BEAT.fire
          }
          case 'attack_resolved': {
            const at = pointOf(event.targetId)
            const threshold = critThresholdFor(next, event.attackerId)
            setDice(d => [
              ...d,
              {
                id: nextId('die'),
                roll: event.roll,
                critThreshold: threshold,
                outcome: event.result === 'critical' ? 'critical' : event.result,
                attackerId: event.attackerId,
                targetId: event.targetId,
                label: event.weaponType,
              },
            ])
            if (event.result === 'miss') {
              pushEffect({
                id: nextId('f'),
                kind: 'float',
                at,
                text: 'MISS',
                tone: 'miss',
                duration: 1200,
              })
            } else {
              if (event.result === 'critical') {
                pushEffect({
                  id: nextId('f'),
                  kind: 'float',
                  at,
                  text: 'CRIT!',
                  tone: 'crit',
                  duration: 1400,
                })
                pushEffect({
                  id: nextId('burst'),
                  kind: 'burst',
                  at,
                  color: '#ffb445',
                  radius: 34,
                  duration: 700,
                })
              }
              if (event.toHull > 0) {
                pushEffect({
                  id: nextId('f'),
                  kind: 'float',
                  at: { x: at.x, y: at.y + 14 },
                  text: `-${event.toHull}`,
                  tone: 'damage',
                  duration: 1200,
                })
              }
              if (event.toHeat > 0) {
                pushEffect({
                  id: nextId('f'),
                  kind: 'float',
                  at: { x: at.x + 26, y: at.y },
                  text: `${event.toHeat} shielded`,
                  tone: 'shield',
                  duration: 1200,
                })
              }
            }
            return BEAT.resolve
          }
          case 'missile_launched': {
            snap.missiles = [
              ...snap.missiles,
              {
                id: event.missileId,
                ownerId: event.ownerId,
                targetId: event.targetId,
                wellId: event.at.wellId,
                ring: event.at.ring,
                sector: event.at.sector,
                turnFired: event.turn,
                movesMade: 0,
                criticalTarget: event.criticalTarget,
                launchedAfterMove: movedThisTurn.has(event.ownerId),
              },
            ]
            return BEAT.small
          }
          case 'missile_moved': {
            snap.missiles = snap.missiles.map(m =>
              m.id === event.missileId
                ? {
                    ...m,
                    wellId: event.to.wellId,
                    ring: event.to.ring,
                    sector: event.to.sector,
                    launchedAfterMove: false,
                  }
                : m
            )
            return BEAT.missile
          }
          case 'missile_intercepted': {
            const at = pointOf(event.targetId)
            const hit = event.roll >= 2
            setDice(d => [
              ...d,
              {
                id: nextId('die'),
                roll: event.roll,
                critThreshold: 10,
                outcome: hit ? 'destroyed' : 'leaked',
                attackerId: event.targetId,
                targetId: event.ownerId,
                label: 'point defence',
              },
            ])
            pushEffect({
              id: nextId('beam'),
              kind: 'beam',
              weapon: 'pdc',
              from: at,
              to: positionPoint(
                snap.missiles.find(m => m.id === event.missileId) ?? {
                  wellId: 'blackhole',
                  ring: 1,
                  sector: 0,
                }
              ),
              color: BEAM_COLORS.pdc,
              duration: 400,
            })
            if (hit) {
              snap.missiles = snap.missiles.filter(m => m.id !== event.missileId)
              pushEffect({
                id: nextId('f'),
                kind: 'float',
                at,
                text: 'INTERCEPTED',
                tone: 'good',
                duration: 1200,
              })
            }
            return BEAT.intercept
          }
          case 'missile_expired':
            snap.missiles = snap.missiles.filter(m => m.id !== event.missileId)
            return BEAT.small
          case 'heat_damage': {
            const at = pointOf(event.playerId)
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              text: `${event.damage} heat`,
              tone: 'heat',
              duration: 1200,
            })
            return BEAT.small
          }
          case 'subsystem_broken': {
            setPulses(p => ({
              ...p,
              [`${event.playerId}:${event.subsystemId}`]: performance.now(),
            }))
            // A critical that breaks a tile is worth naming: everyone at the
            // table saw whose shot did it.
            const attacker = event.by ? next.players.find(p => p.id === event.by)?.name : undefined
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at: pointOf(event.playerId),
              text: attacker ? `BROKEN by ${attacker}` : 'BROKEN',
              tone: 'crit',
              duration: 1400,
            })
            return BEAT.small
          }
          case 'subsystem_revealed':
            setPulses(p => ({
              ...p,
              [`${event.playerId}:${event.subsystemId}`]: performance.now(),
            }))
            return 0
          case 'scanned': {
            pushEffect({
              id: nextId('beam'),
              kind: 'beam',
              weapon: 'pdc',
              from: pointOf(event.scannerId),
              to: pointOf(event.targetId),
              color: '#49c3ff',
              duration: 700,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at: pointOf(event.targetId),
              text: 'SCANNED',
              tone: 'good',
              duration: 1200,
            })
            return BEAT.resolve
          }
          case 'ship_destroyed': {
            const at = pointOf(event.victimId)
            if (snap.ships[event.victimId]) snap.ships[event.victimId].alive = false
            snap.missiles = snap.missiles.filter(m => m.targetId !== event.victimId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at,
              color: '#ff5a72',
              radius: 46,
              duration: 900,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              text: 'DESTROYED',
              tone: 'damage',
              duration: 1400,
            })
            return BEAT.destroy
          }
          case 'docked': {
            const at = pointOf(event.playerId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at,
              color: '#46d191',
              radius: 28,
              duration: 700,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              text: 'DOCKED',
              tone: 'good',
              duration: 1200,
            })
            return BEAT.resolve
          }
          case 'cargo_picked_up':
          case 'cargo_delivered':
            return BEAT.small
          case 'mission_completed': {
            const at = pointOf(event.playerId)
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              text: 'MISSION',
              tone: 'good',
              duration: 1400,
            })
            return BEAT.resolve
          }
          case 'action_skipped': {
            // The target was already destroyed: the shot is simply not taken.
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at: pointOf(event.playerId),
              text: event.action === 'scan' ? 'NO SCAN' : 'NO SHOT',
              tone: 'miss',
              duration: 1100,
            })
            return BEAT.small
          }
          case 'stations_moved':
            snap.stations = next.stations
            return BEAT.small
          default:
            // Unknown event types are ignored, never thrown on: an engine that
            // adds an event must not break a client that has not learned it yet.
            return 0
        }
      }

      const finish = () => {
        if (cancelled) return
        cancelled = true
        skipRef.current = null
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
        setOverlay(null)
        done()
      }

      const step = () => {
        if (cancelled) return
        const event = queue.shift()
        if (!event) {
          finish()
          return
        }
        const hold = apply(event)
        setOverlay({ ...snap, ships: { ...snap.ships } })
        if (hold <= 0) {
          step()
          return
        }
        timerRef.current = setTimeout(step, hold)
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
        setOverlay(null)
        setEffects([])
        setDice([])
      }
    },
    [pushEffect]
  )

  useEffect(() => {
    registerAnimator(animate)
    return () => registerAnimator(null)
  }, [registerAnimator, animate])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const skip = useCallback(() => skipRef.current?.(), [])

  const value = useMemo<AnimationContextValue>(
    () => ({ overlay, effects, dice, pulses, now, skip }),
    [overlay, effects, dice, pulses, now, skip]
  )

  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>
}

const EMPTY: AnimationContextValue = {
  overlay: null,
  effects: [],
  dice: [],
  pulses: {},
  now: 0,
  skip: () => {},
}

export function useAnimation(): AnimationContextValue {
  return useContext(AnimationContext) ?? EMPTY
}
