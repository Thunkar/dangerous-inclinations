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
import { HOME_RING, getSubsystemConfig } from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type FloatTone = 'damage' | 'shield' | 'heat' | 'miss' | 'crit' | 'good'

export type TableEffect =
  | {
      id: string
      kind: 'beam'
      weapon: WeaponType | 'pdc'
      from: Position
      to: Position
      color: string
      start: number
      duration: number
    }
  | {
      id: string
      kind: 'float'
      at: Position
      /**
       * Who the mark is about. Every float and burst the animator pushes has a
       * subject — the ship being hit, docking, breaking or coming back — and a
       * sector is not enough to find them: two ships can share one, and a shot
       * can push its target out of the sector its own numbers were anchored to.
       */
      playerId: string
      /** Board-unit nudge off the anchor, so two floats on one ship do not stack. */
      offset?: { x: number; y: number }
      text: string
      tone: FloatTone
      start: number
      duration: number
    }
  | {
      id: string
      kind: 'burst'
      at: Position
      /** Who the mark is about; see the float above. */
      playerId: string
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
  /**
   * What set the ship moving. A jump can be read off the wells, but a burn
   * and a coast end up in the same sector by different means: the 3D board
   * flares an engine for one and not the other.
   */
  kind: 'coast' | 'burn' | 'jump' | 'recoil'
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

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef<(() => void) | null>(null)
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
  const pushEffect = useCallback((effect: EffectDraft) => {
    const started = { ...effect, start: performance.now() } as TableEffect
    setEffects(prev => [...prev, started])
    const timer = setTimeout(() => {
      expiryRef.current.delete(timer)
      setEffects(prev => prev.filter(e => e !== started))
    }, effect.duration)
    expiryRef.current.add(timer)
  }, [])

  const animate = useCallback(
    (prev: GameView, next: GameView, events: GameEvent[], done: () => void) => {
      const snap = snapshotOf(prev)
      setDice([])
      setOverlay({ ...snap })

      /**
       * Where to hang an effect for a player: the board as it stands mid-turn
       * first, then where the ship ends up. A player with a ship in neither is
       * only possible for an event about somebody who was never on the table,
       * which the engine does not emit — their Home (or the ring everyone
       * deploys on) keeps the effect on the board rather than nowhere.
       */
      const positionOf = (playerId: string): Position => {
        const ship = snap.ships[playerId]
        if (ship) return ship.position
        const player = next.players.find(p => p.id === playerId)
        const fromNext = player?.ship
        if (fromNext)
          return { wellId: fromNext.wellId, ring: fromNext.ring, sector: fromNext.sector }
        return player?.home ?? { wellId: 'blackhole', ring: HOME_RING, sector: 0 }
      }

      /**
       * Move a token; it slides from where it was over `duration` ms. `kind`
       * is null for a placement: a respawn or a deployment puts a ship on the
       * board rather than moving it across, and a token that was not already
       * alive there has nothing to slide from.
       */
      const moveShip = (
        playerId: string,
        to: Position,
        kind: ShipMotion['kind'] | null,
        facing?: Facing,
        duration: number = BEAT.move
      ) => {
        const current = snap.ships[playerId]
        const motion: ShipMotion | undefined =
          kind !== null && current && current.alive
            ? { from: current.position, kind, start: performance.now(), duration }
            : undefined
        snap.ships[playerId] = {
          position: to,
          facing: facing ?? current?.facing ?? 'prograde',
          alive: true,
          motion,
        }
        if (motion) pushEffect({ id: nextId('tween'), kind: 'tween', duration })
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
            moveShip(event.playerId, event.to, 'coast')
            movedThisTurn.add(event.playerId)
            return BEAT.move
          case 'burned':
            moveShip(event.playerId, event.to, 'burn')
            movedThisTurn.add(event.playerId)
            return BEAT.move
          case 'jumped':
            moveShip(event.playerId, event.to, 'jump', undefined, BEAT.jump)
            movedThisTurn.add(event.playerId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: event.to,
              playerId: event.playerId,
              color: '#ffb445',
              radius: 30,
              duration: 600,
            })
            return BEAT.jump
          case 'recoil':
            if (event.to) moveShip(event.playerId, event.to, 'recoil', undefined, BEAT.small)
            return event.to ? BEAT.small : 0
          case 'respawned':
          case 'deployed': {
            const position = event.position
            moveShip(event.playerId, position, null)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: position,
              playerId: event.playerId,
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
              from: positionOf(event.attackerId),
              to: positionOf(event.targetId),
              color: BEAM_COLORS[event.weaponType],
              duration: 520,
            })
            return BEAT.fire
          }
          case 'attack_resolved': {
            const at = positionOf(event.targetId)
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
                playerId: event.targetId,
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
                  playerId: event.targetId,
                  text: 'CRIT!',
                  tone: 'crit',
                  duration: 1400,
                })
                pushEffect({
                  id: nextId('burst'),
                  kind: 'burst',
                  at,
                  playerId: event.targetId,
                  color: '#ffb445',
                  radius: 34,
                  duration: 700,
                })
              }
              if (event.toHull > 0) {
                pushEffect({
                  id: nextId('f'),
                  kind: 'float',
                  at,
                  playerId: event.targetId,
                  offset: { x: 0, y: 14 },
                  text: `-${event.toHull}`,
                  tone: 'damage',
                  duration: 1200,
                })
              }
              if (event.toHeat > 0) {
                pushEffect({
                  id: nextId('f'),
                  kind: 'float',
                  at,
                  playerId: event.targetId,
                  offset: { x: 26, y: 0 },
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
            const at = positionOf(event.targetId)
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
              to: (() => {
                const missile = snap.missiles.find(m => m.id === event.missileId)
                return missile
                  ? { wellId: missile.wellId, ring: missile.ring, sector: missile.sector }
                  : { wellId: 'blackhole' as const, ring: 1, sector: 0 }
              })(),
              color: BEAM_COLORS.pdc,
              duration: 400,
            })
            if (hit) {
              snap.missiles = snap.missiles.filter(m => m.id !== event.missileId)
              pushEffect({
                id: nextId('f'),
                kind: 'float',
                at,
                playerId: event.targetId,
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
            const at = positionOf(event.playerId)
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              playerId: event.playerId,
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
              at: positionOf(event.playerId),
              playerId: event.playerId,
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
              from: positionOf(event.scannerId),
              to: positionOf(event.targetId),
              color: '#49c3ff',
              duration: 700,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at: positionOf(event.targetId),
              playerId: event.targetId,
              text: 'SCANNED',
              tone: 'good',
              duration: 1200,
            })
            return BEAT.resolve
          }
          case 'ship_destroyed': {
            const at = positionOf(event.victimId)
            if (snap.ships[event.victimId]) snap.ships[event.victimId].alive = false
            snap.missiles = snap.missiles.filter(m => m.targetId !== event.victimId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at,
              playerId: event.victimId,
              color: '#ff5a72',
              radius: 46,
              duration: 900,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              playerId: event.victimId,
              text: 'DESTROYED',
              tone: 'damage',
              duration: 1400,
            })
            return BEAT.destroy
          }
          case 'docked': {
            const at = positionOf(event.playerId)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at,
              playerId: event.playerId,
              color: '#46d191',
              radius: 28,
              duration: 700,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              playerId: event.playerId,
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
            const at = positionOf(event.playerId)
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at,
              playerId: event.playerId,
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
              at: positionOf(event.playerId),
              playerId: event.playerId,
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
        clearExpiries()
        setOverlay(null)
        setEffects([])
        setDice([])
      }
    },
    [pushEffect, clearExpiries]
  )

  useEffect(() => {
    registerAnimator(animate)
    return () => registerAnimator(null)
  }, [registerAnimator, animate])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      clearExpiries()
    },
    [clearExpiries]
  )

  const skip = useCallback(() => skipRef.current?.(), [])

  const value = useMemo<AnimationContextValue>(
    () => ({ overlay, effects, dice, pulses, skip }),
    [overlay, effects, dice, pulses, skip]
  )

  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>
}

const EMPTY: AnimationContextValue = {
  overlay: null,
  effects: [],
  dice: [],
  pulses: {},
  skip: () => {},
}

export function useAnimation(): AnimationContextValue {
  return useContext(AnimationContext) ?? EMPTY
}
