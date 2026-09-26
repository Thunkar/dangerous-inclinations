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
import type {
  Facing,
  GameEvent,
  GameView,
  Missile,
  Position,
  Station,
  WeaponType,
} from '@dangerous-inclinations/engine'
import { HOME_RING } from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'
import { getPlayerColor } from '../utils/playerColors'
import { TABLE } from '../design/tokens'

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type FloatTone = 'damage' | 'shield' | 'heat' | 'miss' | 'crit' | 'good'

export type TableEffect =
  | {
      id: string
      kind: 'beam'
      /** `pdc` is a rack shooting at a missile; `scan` is a sensor sweep, not a shot. */
      weapon: WeaponType | 'pdc' | 'scan'
      from: Position
      to: Position
      /**
       * The ships at either end, where there is one. A sector is a cell and
       * two hulls standing in it are drawn side by side, so a shot aimed at the
       * sector lands beside the ship it hit: a renderer that can find the hull
       * puts the end of the beam on it, and falls back to `from`/`to` for an
       * end that is a place rather than a ship (a missile a rack shoots down).
       */
      fromId?: string
      toId?: string
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
       * subject (the ship being hit, docking, breaking or coming back) and a
       * sector is not enough to find them: two ships can share one, and a shot
       * can push its target out of the sector its own numbers were anchored to.
       * It is also where the mark is drawn: a board that stands two hulls side
       * by side in one sector hangs the mark off the hull, and only falls back
       * to `at` when the ship is no longer on the table.
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

/**
 * What the auto camera should be looking at while a turn plays. The animator
 * names the moment (a ship moving, one ship shooting at another, missiles
 * closing, a ship blowing up) and the 3D board decides where to stand for it.
 * Every ship carries a fallback position, because a ship that has just been
 * destroyed has already left the table by the time the camera frames it.
 */
export type CameraShot = { id: string; start: number } & (
  | { kind: 'move'; move: ShipMotion['kind']; playerId: string; from: Position; to: Position }
  | { kind: 'duel'; attackerId: string; targetId: string; from: Position; to: Position }
  | { kind: 'missiles'; targetId: string; at: Position }
  | { kind: 'ship'; mood: 'destroyed' | 'docked' | 'arrived'; playerId: string; at: Position }
)

type ShotDraft = CameraShot extends infer T
  ? T extends CameraShot
    ? Omit<T, 'id' | 'start'>
    : never
  : never

/** Two cues are the same shot when they film the same thing: no lead-in between them. */
function shotKey(shot: ShotDraft): string {
  switch (shot.kind) {
    case 'move':
      return `move:${shot.playerId}:${shot.move}`
    case 'duel':
      return `duel:${shot.attackerId}:${shot.targetId}`
    case 'missiles':
      return `missiles:${shot.targetId}`
    case 'ship':
      return `ship:${shot.playerId}:${shot.mood}`
  }
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
 * The table's inks, not a second palette: a railgun slug is violet, a laser
 * the red, a missile the heat red, and point defence the teal.
 */
const BEAM_COLORS: Record<WeaponType | 'pdc', string> = {
  railgun: TABLE.violet,
  laser: TABLE.accent,
  missiles: TABLE.heat,
  ballistic_rack: TABLE.teal,
  pdc: TABLE.teal,
}

/**
 * A ping: rings that expand off the hull, one after another, the way a
 * locator sweeps. Three is enough to catch an eye that is looking elsewhere
 * on the board; the whole thing is over in a second and a half.
 */
const PING = { rings: 3, stagger: 260, life: 900, radius: 52 } as const

/**
 * How long each event holds the table, in ms, at 1x.
 *
 * These are the pace of a bot's turn, and a bot's turn is the one nobody is
 * expecting: your own turn you planned, so you already know what it will do.
 * Slow enough to follow a volley you did not see coming, with {@link PlaybackSpeed}
 * to wind it forward when you already have.
 */
const BEAT = {
  move: 700,
  jump: 800,
  fire: 380,
  resolve: 1100,
  missile: 400,
  intercept: 850,
  small: 450,
  destroy: 950,
} as const

/**
 * How long a mark stays up at 1x. A number over a ship is the only record of
 * what a shot did until the log line scrolls, so it outlives its own beat:
 * the damage is still readable while the next event is resolving.
 */
const FLOAT = { short: 2200, normal: 2800, long: 3600 } as const

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
/** Ring counts in RULES §Movement, used to name a burn by what it actually did. */
const BURN_RINGS = { soft: 1, medium: 2, hard: 3 } as const
/** Fuel a burn costs before phasing, so the rest of what was spent is the phase. */
const BURN_MASS = { soft: 1, medium: 2, hard: 3 } as const
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
 * seat can tell. The bonus is real only for a sensor array with energy on it
 * (RULES: a sensor with energy on it widens your critical range) and
 * unbroken, and only from the moment it got that energy: powered, or scanned
 * with, earlier in the same turn (`sensing`). A shot fired before the scan
 * had the plain range, though the sensor holds its energy by the end of the
 * turn. We may only draw it when the tile is face-up at the table, or is our
 * own. A tile we learned through a scan is face-down to everyone else, so it
 * never widens the band we print for the table to read.
 */
function critThresholdFor(view: GameView, attackerId: string, sensing: boolean): number {
  if (!sensing) return 10
  const attacker = view.players.find(p => p.id === attackerId)
  if (!attacker) return 10
  const visiblySensing = attacker.slots.some(
    slot =>
      slot.type === 'sensor_array' &&
      (attacker.isMe ? slot.knownVia === 'own' : slot.knownVia === 'revealed') &&
      slot.isBroken !== true
  )
  return visiblySensing ? 8 : 10
}

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
      const started = { ...effect, duration: life, start: performance.now() } as TableEffect
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
    const started = { ...effect, start: performance.now() } as TableEffect
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
        id: nextId('f'),
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
            id: nextId('ping-ring'),
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
      const snap = snapshotOf(prev)
      setDice([])
      setOverlay({ ...snap })
      setPlayback({ id: nextId('playback'), actorId: prev.activePlayerId })

      /**
       * Where to hang an effect for a player: the board as it stands mid-turn
       * first, then where the ship ends up. A player with a ship in neither is
       * only possible for an event about somebody who was never on the table,
       * which the engine does not emit. Their Home (or the ring everyone
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
       * A short mark over a ship, for the things it just did. The board was
       * only ever labelling outcomes (hits, breaks, docks), so a turn's worth
       * of flying went past with nothing written on it, which is what made a
       * turn hard to follow at the speed it plays.
       */
      const mark = (
        playerId: string,
        text: string,
        tone: FloatTone,
        opts: { at?: Position; offset?: { x: number; y: number }; duration?: number } = {}
      ) => {
        pushEffect({
          id: nextId('f'),
          kind: 'float',
          at: opts.at ?? positionOf(playerId),
          playerId,
          offset: opts.offset ?? { x: 0, y: -26 },
          text,
          tone,
          duration: opts.duration ?? FLOAT.normal,
        })
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
        const slide = duration / tempo()
        const motion: ShipMotion | undefined =
          kind !== null && current && current.alive
            ? { from: current.position, kind, start: performance.now(), duration: slide }
            : undefined
        snap.ships[playerId] = {
          position: to,
          facing: facing ?? current?.facing ?? 'prograde',
          alive: true,
          motion,
        }
        if (motion) pushEffect({ id: nextId('tween'), kind: 'tween', duration })
      }

      const queue = [...events]
      let cancelled = false
      /**
       * Whose sensor has energy on it so far this turn, keyed by turn and
       * player: the active loadout is cleared when the turn starts, so only a
       * power or a scan earlier in the same turn widens a shot's range.
       */
      const sensing = new Set<string>()
      const sensorKey = (turn: number, playerId: string) => `${turn}:${playerId}`

      const apply = (event: GameEvent): number => {
        switch (event.type) {
          case 'rotated':
            if (snap.ships[event.playerId]) snap.ships[event.playerId].facing = event.facing
            mark(event.playerId, event.facing === 'prograde' ? 'ROTATE ↗' : 'ROTATE ↙', 'good', {
              at: snap.ships[event.playerId]?.position,
            })
            return BEAT.small
          case 'coasted':
            moveShip(event.playerId, event.to, 'coast')
            if (!event.recovering)
              mark(event.playerId, event.moored ? 'MOORED' : 'COAST', 'good', { at: event.to })
            return BEAT.move
          case 'burned': {
            moveShip(event.playerId, event.to, 'burn')
            const phase = event.massSpent - BURN_MASS[event.intensity]
            mark(
              event.playerId,
              `BURN ${BURN_RINGS[event.intensity]}${phase > 0 ? ` · PHASE ${phase}` : ''} · −${event.massSpent} fuel`,
              'good',
              { at: event.to }
            )
            return BEAT.move
          }
          case 'jumped':
            moveShip(event.playerId, event.to, 'jump', undefined, BEAT.jump)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: event.to,
              playerId: event.playerId,
              color: TABLE.ink,
              radius: 30,
              duration: 600,
            })
            mark(
              event.playerId,
              `JUMP${event.sectorAdjustment !== 0 ? ` · PHASE ${Math.abs(event.sectorAdjustment)}` : ''} · −${event.massSpent} fuel${event.compressed ? ' (compressor)' : ''}`,
              'good',
              { at: event.to }
            )
            return BEAT.jump
          case 'fuel_scooped':
            mark(event.playerId, `SCOOP +${event.amount} fuel`, 'good', {
              offset: { x: 0, y: -14 },
            })
            return BEAT.small
          case 'recoil':
            if (event.to) moveShip(event.playerId, event.to, 'recoil', undefined, BEAT.small)
            mark(
              event.playerId,
              event.compensated ? `RECOIL HELD · −${event.massSpent} fuel` : 'RECOIL',
              'heat',
              { at: event.to }
            )
            return BEAT.small
          case 'respawned':
          case 'deployed': {
            const position = event.position
            moveShip(event.playerId, position, null)
            pushEffect({
              id: nextId('burst'),
              kind: 'burst',
              at: position,
              playerId: event.playerId,
              color: TABLE.success,
              radius: 26,
              duration: 600,
            })
            return BEAT.small
          }
          case 'heat_check': {
            if (event.damage > 0) return 0 // heat_damage marks it below
            if (event.carried > 0) mark(event.playerId, `HEAT +${event.carried}`, 'heat')
            return event.carried > 0 ? BEAT.small : 0
          }
          case 'weapon_fired': {
            pushEffect({
              id: nextId('beam'),
              kind: 'beam',
              weapon: event.weaponType,
              from: positionOf(event.attackerId),
              to: positionOf(event.targetId),
              fromId: event.attackerId,
              toId: event.targetId,
              color: BEAM_COLORS[event.weaponType],
              duration: 520,
            })
            return BEAT.fire
          }
          case 'attack_resolved': {
            const at = positionOf(event.targetId)
            const threshold = critThresholdFor(
              next,
              event.attackerId,
              sensing.has(sensorKey(event.turn, event.attackerId))
            )
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
                duration: FLOAT.normal,
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
                  duration: FLOAT.long,
                })
                pushEffect({
                  id: nextId('burst'),
                  kind: 'burst',
                  at,
                  playerId: event.targetId,
                  color: TABLE.ink,
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
                  duration: FLOAT.normal,
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
                  duration: FLOAT.normal,
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
                    movesMade: m.movesMade + 1,
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
              // The rack is the ship being shot at; the other end is a missile
              // in flight, which is a place and not a hull.
              fromId: event.targetId,
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
                duration: FLOAT.normal,
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
              duration: FLOAT.normal,
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
              duration: FLOAT.long,
            })
            return BEAT.small
          }
          case 'subsystem_revealed':
            setPulses(p => ({
              ...p,
              [`${event.playerId}:${event.subsystemId}`]: performance.now(),
            }))
            return 0
          case 'subsystem_powered': {
            // Powering reveals nothing, so only a sensor this seat can already
            // see counts: our own, or one face-up at the table.
            const slot = next.players
              .find(p => p.id === event.playerId)
              ?.slots.find(s => s.id === event.subsystemId)
            if ((event.subsystemType ?? slot?.type) === 'sensor_array')
              sensing.add(sensorKey(event.turn, event.playerId))
            return 0
          }
          case 'scanned': {
            // The scan leaves the sensor's energy on it: every shot after it
            // has the wider range.
            sensing.add(sensorKey(event.turn, event.scannerId))
            pushEffect({
              id: nextId('beam'),
              kind: 'beam',
              weapon: 'scan',
              from: positionOf(event.scannerId),
              to: positionOf(event.targetId),
              fromId: event.scannerId,
              toId: event.targetId,
              color: TABLE.teal,
              duration: 700,
            })
            pushEffect({
              id: nextId('f'),
              kind: 'float',
              at: positionOf(event.targetId),
              playerId: event.targetId,
              text: 'SCANNED',
              tone: 'good',
              duration: FLOAT.normal,
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
              color: TABLE.danger,
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
              duration: FLOAT.long,
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
              color: TABLE.success,
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
              duration: FLOAT.normal,
            })
            return BEAT.resolve
          }
          case 'cargo_picked_up':
          case 'cargo_delivered':
            return BEAT.small
          case 'cargo_seized':
            mark(event.victimId, event.kind === 'data' ? 'DATA SEIZED' : 'CRATE SEIZED', 'heat', {
              at: event.at,
            })
            mark(event.pirateId, '+LOOT', 'good', { at: event.at })
            return BEAT.resolve
          case 'fuel_sold':
            mark(event.playerId, `SOLD ${event.amount} FUEL`, 'good')
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
              duration: FLOAT.long,
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
              duration: FLOAT.short,
            })
            return BEAT.small
          }
          case 'stations_moved': {
            snap.stations = next.stations
            // Moored ships ride their station round (RULES §Moored): slide them
            // along with it rather than letting them snap at the end.
            for (const riderId of event.riders) {
              const rider = next.players.find(p => p.id === riderId)?.ship
              if (rider)
                moveShip(
                  riderId,
                  { wellId: rider.wellId, ring: rider.ring, sector: rider.sector },
                  'coast'
                )
            }
            return event.riders.length > 0 ? BEAT.move : BEAT.small
          }
          default:
            // Unknown event types are ignored, never thrown on: an engine that
            // adds an event must not break a client that has not learned it yet.
            return 0
        }
      }

      /**
       * The shot an event deserves, or null when it deserves none and the
       * camera should stay on whatever it is already filming (a rotation, a
       * die being read, a heat check).
       */
      const shotFor = (event: GameEvent): ShotDraft | null => {
        switch (event.type) {
          case 'coasted':
          case 'burned':
          case 'jumped': {
            const move =
              event.type === 'coasted' ? 'coast' : event.type === 'burned' ? 'burn' : 'jump'
            return {
              kind: 'move',
              move,
              playerId: event.playerId,
              from: positionOf(event.playerId),
              to: event.to,
            }
          }
          case 'weapon_fired':
          case 'attack_resolved':
            return {
              kind: 'duel',
              attackerId: event.attackerId,
              targetId: event.targetId,
              from: positionOf(event.attackerId),
              to: positionOf(event.targetId),
            }
          case 'scanned':
            return {
              kind: 'duel',
              attackerId: event.scannerId,
              targetId: event.targetId,
              from: positionOf(event.scannerId),
              to: positionOf(event.targetId),
            }
          case 'missile_launched':
            return {
              kind: 'duel',
              attackerId: event.ownerId,
              targetId: event.targetId,
              from: positionOf(event.ownerId),
              to: positionOf(event.targetId),
            }
          case 'cargo_seized':
            return {
              kind: 'duel',
              attackerId: event.pirateId,
              targetId: event.victimId,
              from: positionOf(event.pirateId),
              to: positionOf(event.victimId),
            }
          case 'missile_moved': {
            const missile = snap.missiles.find(m => m.id === event.missileId)
            return missile
              ? { kind: 'missiles', targetId: missile.targetId, at: positionOf(missile.targetId) }
              : null
          }
          case 'missile_intercepted':
            return { kind: 'missiles', targetId: event.targetId, at: positionOf(event.targetId) }
          case 'ship_destroyed':
            return {
              kind: 'ship',
              mood: 'destroyed',
              playerId: event.victimId,
              at: positionOf(event.victimId),
            }
          case 'docked':
            return {
              kind: 'ship',
              mood: 'docked',
              playerId: event.playerId,
              at: positionOf(event.playerId),
            }
          case 'respawned':
            return { kind: 'ship', mood: 'arrived', playerId: event.playerId, at: event.position }
          default:
            return null
        }
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
        setOverlay({ ...snap, ships: { ...snap.ships } })
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
        const cue = cinematicRef.current ? shotFor(event) : null
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
