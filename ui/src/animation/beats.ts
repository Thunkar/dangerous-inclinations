/**
 * What a turn's events do to the table, one event at a time, with no React
 * in it.
 *
 * The animator (`context/AnimationContext.tsx`) replays a turn's
 * `GameEvent[]` over a snapshot of the board: tokens move, beams flash, dice
 * land, and only then is the next view committed. This module is the part of
 * that which is about the game: given the board as it stands and one event,
 * the board after it, how long the event holds the table, and the marks,
 * dice and flashes it puts up. The animator owns the clock, the timers and
 * the ids. Pure, so it can be checked against a recorded game's events
 * (`beats.test.ts`), the way `table/eventLogModel.ts` is for the log.
 */
import type {
  Facing,
  GameEvent,
  GameView,
  Missile,
  Position,
  Station,
  Subsystem,
  WeaponType,
} from '@dangerous-inclinations/engine'
import { BURN_COSTS, HOME_RING, positionOf, samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../design/tokens'
import { BASE_CRIT, SENSOR_CRIT } from '../site/numbers'
import { weaponReach } from '../components/board/reach'

// ---------------------------------------------------------------------------
// What the board draws
// ---------------------------------------------------------------------------

export type FloatTone = 'damage' | 'shield' | 'heat' | 'miss' | 'crit' | 'good'

export type FlareKind = 'shield' | 'emp' | 'plasma'

/** The guns drawn as a beam; plasma and the disruptor have shapes of their own. */
export type BeamWeapon = Exclude<WeaponType, 'plasma_cannon' | 'disruptor'> | 'pdc' | 'scan'

export type TableEffect =
  | {
      id: string
      kind: 'beam'
      /** `pdc` is a rack shooting at a missile; `scan` is a sensor sweep, not a shot. */
      weapon: BeamWeapon
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
      /**
       * Its step in the pile over its sector, taken when it went up: the
       * lowest step no live float on the sector holds (see {@link floatStack}).
       * A turn can put four of these on one sector at once (a critical, the
       * damage, what the shield soaked and the tile it broke), and the nudge
       * only separates two, so both boards draw a pile-up as a list.
       */
      stack?: number
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
  /**
   * A plasma cannon's shot: a short burst of fat bolts thrown from one hull at
   * another. The ends are found as a beam's are.
   */
  | {
      id: string
      kind: 'plasma'
      from: Position
      to: Position
      fromId?: string
      toId?: string
      color: string
      start: number
      duration: number
    }
  /**
   * A disruptor's pulse: it floods the weapon's whole firing box and its rays
   * close on the target. `cells` is the box, asked of the engine when the shot
   * went off ({@link weaponReach}), so neither board works out a range of its
   * own; the rays stop `stopAt` board units short of the target's hull, where
   * a shield would stand.
   */
  | {
      id: string
      kind: 'ray'
      from: Position
      to: Position
      fromId?: string
      toId?: string
      cells: Position[]
      stopAt: number
      color: string
      start: number
      duration: number
    }
  /**
   * Something flaring round a hull: a shield taking a shot (`shield`), the
   * crackle of an EMP getting through it (`emp`), or plasma bursting on the
   * hull it reached (`plasma`). `fromId` is who it came from, so a board can
   * light the side of the shield the shot struck.
   */
  | {
      id: string
      kind: 'flare'
      flare: FlareKind
      at: Position
      /** Who the mark is about; see the float above. */
      playerId: string
      fromId?: string
      /**
       * Where the shot came in from when that is a place and not a hull: a
       * missile's last sector before it struck. Wins over `fromId`.
       */
      from?: Position
      color: string
      /**
       * A shield only: the colour of what struck it, rippling out across the
       * bubble from where it hit (the weapon's own ink).
       */
      accent?: string
      /**
       * A shield only: how much of the shot it took, 0 to 1. A wall that
       * soaked everything flares in full; one that let damage through, less.
       */
      strength?: number
      radius: number
      start: number
      duration: number
    }
  /** Nothing drawn: keeps the clock ticking while a ship token slides to its new sector. */
  | { id: string; kind: 'tween'; start: number; duration: number }

/**
 * An effect before the animator stamps it: no id and no start, and its
 * duration at 1x (distributes over the union).
 */
export type EffectDraft = TableEffect extends infer T
  ? T extends TableEffect
    ? Omit<T, 'id' | 'start'>
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

export type DieDraft = Omit<DieRoll, 'id'>

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

/** A wreck drifting with the stations' step: it slides along its ring from `from`. */
export interface WreckMotion {
  from: Position
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

export type ShotDraft = CameraShot extends infer T
  ? T extends CameraShot
    ? Omit<T, 'id' | 'start'>
    : never
  : never

export interface BoardOverlay {
  ships: Record<string, { position: Position; facing: Facing; alive: boolean; motion?: ShipMotion }>
  missiles: Missile[]
  stations: Station[]
  wrecks: { id: string; position: Position; motion?: WreckMotion }[]
  /** Carrier id to the ids of the players whose Escort markers sit on it. */
  escorts: Record<string, string[]>
}

/**
 * The step a new float over `at` takes: the lowest one no live float on the
 * same sector holds. Asked once, when the float goes up, so a number keeps its
 * place while it climbs even after the one under it has gone.
 */
export function floatStack(live: readonly TableEffect[], at: Position): number {
  const taken = new Set<number>()
  for (const effect of live)
    if (effect.kind === 'float' && samePosition(effect.at, at)) taken.add(effect.stack ?? 0)
  let step = 0
  while (taken.has(step)) step++
  return step
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

/**
 * How long each event holds the table, in ms, at 1x.
 *
 * These are the pace of a bot's turn, and a bot's turn is the one nobody is
 * expecting: your own turn you planned, so you already know what it will do.
 * Slow enough to follow a volley you did not see coming, with the playback
 * speed to wind it forward when you already have.
 */
export const BEAT = {
  move: 700,
  jump: 800,
  fire: 380,
  /** Long enough for the last bolt of a plasma burst to land before the die is read. */
  plasma: 560,
  /** Long enough for a disruptor's rays to close on the target before the die is read. */
  ray: 640,
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

/**
 * The one ink the table has only for an effect: plasma's green. It is not the
 * table's `success` green, which means a good thing happened to you; this is
 * hot gas, lit and loud, and nothing else on the board is drawn in it.
 */
export const PLASMA_GREEN = '#8cf25e'
/** The white-yellow at the heart of a plasma bolt, hotter than the green around it. */
export const PLASMA_CORE = '#f6ffc6'

/**
 * The table's inks, not a second palette: a railgun slug is violet, a laser
 * the red, a missile the heat red, and point defence the teal. Plasma is the
 * one green, and the disruptor's EMP the violet, which is never a slug's
 * shape.
 */
export const EFFECT_COLORS: Record<WeaponType | 'pdc', string> = {
  railgun: TABLE.violet,
  laser: TABLE.accent,
  missiles: TABLE.heat,
  ballistic_rack: TABLE.teal,
  plasma_cannon: PLASMA_GREEN,
  disruptor: TABLE.violet,
  pdc: TABLE.teal,
}

/**
 * How far from a hull a shield stands, in board units: where a disruptor's
 * rays stop and where a shield flares. Both boards draw a hull well inside it.
 */
export const SHIELD_RADIUS = 34

/** How long the pulses live, at 1x. They outlive their beat, so the flare lands while they fade. */
const PULSE = { plasma: 820, ray: 1150, flare: 900, fireball: 1300 } as const

// ---------------------------------------------------------------------------
// The board as a turn plays
// ---------------------------------------------------------------------------

export function snapshotOf(view: GameView): BoardOverlay {
  const ships: BoardOverlay['ships'] = {}
  for (const player of view.players) {
    if (!player.ship) continue
    ships[player.id] = {
      position: positionOf(player.ship),
      facing: player.ship.facing,
      alive: !player.ship.isDestroyed,
    }
  }
  const escorts: BoardOverlay['escorts'] = {}
  for (const player of view.players) escorts[player.id] = player.escortedBy
  return {
    ships,
    missiles: view.missiles,
    stations: view.stations,
    wrecks: view.wrecks.map(w => ({
      id: w.id,
      position: positionOf(w),
    })),
    escorts,
  }
}

/** The board mid-turn, and whose sensor has energy on it so far this turn. */
export interface BeatState {
  board: BoardOverlay
  /**
   * Keyed by turn and player: the active loadout is cleared when the turn
   * starts, so only a power or a scan earlier in the same turn widens a
   * shot's range.
   */
  sensing: ReadonlySet<string>
}

export function beatStart(view: GameView): BeatState {
  return { board: snapshotOf(view), sensing: new Set() }
}

/** The animator's clock: when the beat plays, and what every duration divides by. */
export interface BeatClock {
  now: number
  tempo: number
}

export interface Beat {
  state: BeatState
  /** How long the event holds the table at 1x; 0 moves straight on. */
  hold: number
  effects: EffectDraft[]
  dice: DieDraft[]
  /** Loadout slots to flash, as `playerId:subsystemId`. */
  pulses: string[]
}

const sensorKey = (turn: number, playerId: string) => `${turn}:${playerId}`

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
  if (!sensing) return BASE_CRIT
  const attacker = view.players.find(p => p.id === attackerId)
  if (!attacker) return BASE_CRIT
  const visiblySensing = attacker.slots.some(
    slot =>
      slot.type === 'sensor_array' &&
      (attacker.isMe ? slot.knownVia === 'own' : slot.knownVia === 'revealed') &&
      slot.isBroken !== true
  )
  return visiblySensing ? SENSOR_CRIT : BASE_CRIT
}

/**
 * Where to hang an effect for a player: the board as it stands mid-turn
 * first, then where the ship ends up. A player with a ship in neither is only
 * possible for an event about somebody who was never on the table, which the
 * engine does not emit. Their Home (or the ring everyone deploys on) keeps the
 * effect on the board rather than nowhere.
 */
function effectPosition(board: BoardOverlay, next: GameView, playerId: string): Position {
  const ship = board.ships[playerId]
  if (ship) return ship.position
  const player = next.players.find(p => p.id === playerId)
  const fromNext = player?.ship
  if (fromNext) return positionOf(fromNext)
  return player?.home ?? { wellId: 'blackhole', ring: HOME_RING, sector: 0 }
}

/**
 * The weapon a shot was fired with, as the engine's range rule wants it: its
 * type and the slot it sits in, read off the public slots (a slot's place on
 * the hull is public even while the tile in it is face-down).
 */
function firedFrom(view: GameView, event: Extract<GameEvent, { type: 'weapon_fired' }>): Subsystem {
  const slot = view.players
    .find(p => p.id === event.attackerId)
    ?.slots.find(s => s.id === event.subsystemId)
  return {
    id: event.subsystemId,
    type: event.weaponType,
    allocatedEnergy: 0,
    usedThisTurn: true,
    rollsThisTurn: 0,
    isBroken: false,
    isRevealed: true,
    ...(slot ? { slotGroup: slot.group, slotIndex: slot.index } : {}),
  }
}

/** The way a ship faces in a view, if it is on the board there. */
function facingIn(view: GameView, playerId: string): Facing | undefined {
  return view.players.find(p => p.id === playerId)?.ship?.facing
}

/**
 * One event played over the board. `next` is the view the turn ends on: it
 * names players and says where a ship ended up when the board has lost it.
 */
export function eventToBeat(
  state: BeatState,
  next: GameView,
  event: GameEvent,
  clock: BeatClock
): Beat {
  let board: BoardOverlay = { ...state.board, ships: { ...state.board.ships } }
  let sensing = state.sensing
  const effects: EffectDraft[] = []
  const dice: DieDraft[] = []
  const pulses: string[] = []
  const at = (playerId: string) => effectPosition(board, next, playerId)

  /**
   * A short mark over a ship, for the things it just did. The board was only
   * ever labelling outcomes (hits, breaks, docks), so a turn's worth of flying
   * went past with nothing written on it, which is what made a turn hard to
   * follow at the speed it plays.
   */
  const mark = (
    playerId: string,
    text: string,
    tone: FloatTone,
    opts: { at?: Position; offset?: { x: number; y: number }; duration?: number } = {}
  ) => {
    effects.push({
      kind: 'float',
      at: opts.at ?? at(playerId),
      playerId,
      offset: opts.offset ?? { x: 0, y: -26 },
      text,
      tone,
      duration: opts.duration ?? FLOAT.normal,
    })
  }

  const float = (
    playerId: string,
    text: string,
    tone: FloatTone,
    duration: number,
    offset?: { x: number; y: number }
  ) => {
    effects.push({
      kind: 'float',
      at: at(playerId),
      playerId,
      ...(offset ? { offset } : {}),
      text,
      tone,
      duration,
    })
  }

  const burst = (
    playerId: string,
    color: string,
    radius: number,
    duration: number,
    where?: Position
  ) => {
    effects.push({ kind: 'burst', at: where ?? at(playerId), playerId, color, radius, duration })
  }

  const flare = (
    playerId: string,
    fromId: string,
    kind: FlareKind,
    color: string,
    radius: number,
    extra: { accent?: string; strength?: number; from?: Position } = {}
  ) => {
    effects.push({
      kind: 'flare',
      flare: kind,
      at: at(playerId),
      playerId,
      fromId,
      ...(extra.from ? { from: extra.from } : {}),
      color,
      ...(extra.accent ? { accent: extra.accent } : {}),
      ...(extra.strength !== undefined ? { strength: extra.strength } : {}),
      radius,
      duration: kind === 'plasma' ? PULSE.fireball : PULSE.flare,
    })
  }

  /**
   * Move a token; it slides from where it was over `duration` ms at 1x.
   * `kind` is null for a placement: a respawn or a deployment puts a ship on
   * the board rather than moving it across, and a token that was not already
   * alive there has nothing to slide from.
   */
  const moveShip = (
    playerId: string,
    to: Position,
    kind: ShipMotion['kind'] | null,
    facing?: Facing,
    duration: number = BEAT.move
  ) => {
    const current = board.ships[playerId]
    const motion: ShipMotion | undefined =
      kind !== null && current && current.alive
        ? { from: current.position, kind, start: clock.now, duration: duration / clock.tempo }
        : undefined
    board.ships[playerId] = {
      position: to,
      facing: facing ?? current?.facing ?? 'prograde',
      alive: true,
      motion,
    }
    if (motion) effects.push({ kind: 'tween', duration })
  }

  const updateShip = (playerId: string, patch: Partial<BoardOverlay['ships'][string]>) => {
    const ship = board.ships[playerId]
    if (ship) board.ships[playerId] = { ...ship, ...patch }
  }

  /** Put a marker on a carrier, or take one off: the board draws a badge per marker. */
  const setEscort = (carrierId: string, escortId: string, on: boolean) => {
    const held = (board.escorts[carrierId] ?? []).filter(id => id !== escortId)
    board = {
      ...board,
      escorts: { ...board.escorts, [carrierId]: on ? [...held, escortId] : held },
    }
  }

  const sense = (turn: number, playerId: string) => {
    sensing = new Set(sensing).add(sensorKey(turn, playerId))
  }

  const hold = ((): number => {
    switch (event.type) {
      case 'rotated':
        updateShip(event.playerId, { facing: event.facing })
        mark(event.playerId, event.facing === 'prograde' ? 'ROTATE ↗' : 'ROTATE ↙', 'good', {
          at: board.ships[event.playerId]?.position,
        })
        return BEAT.small
      case 'coasted':
        moveShip(event.playerId, event.to, 'coast')
        if (!event.recovering)
          mark(event.playerId, event.moored ? 'MOORED' : 'COAST', 'good', { at: event.to })
        return BEAT.move
      case 'burned': {
        moveShip(event.playerId, event.to, 'burn')
        // Fuel a burn costs before phasing, so the rest of what was spent is the phase.
        const phase = event.massSpent - BURN_COSTS[event.intensity].mass
        mark(
          event.playerId,
          `BURN ${BURN_COSTS[event.intensity].rings}${phase > 0 ? ` · PHASE ${phase}` : ''} · −${event.massSpent} fuel`,
          'good',
          { at: event.to }
        )
        return BEAT.move
      }
      case 'jumped':
        moveShip(event.playerId, event.to, 'jump', undefined, BEAT.jump)
        burst(event.playerId, TABLE.ink, 30, 600, event.to)
        mark(
          event.playerId,
          `JUMP${event.sectorAdjustment !== 0 ? ` · PHASE ${Math.abs(event.sectorAdjustment)}` : ''} · −${event.massSpent} fuel${event.compressed ? ' (compressor)' : ''}`,
          'good',
          { at: event.to }
        )
        return BEAT.jump
      case 'fuel_scooped':
        mark(event.playerId, `SCOOP +${event.amount} fuel`, 'good', { offset: { x: 0, y: -14 } })
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
      case 'deployed':
        // The event names the sector, not the facing: the ship is placed the
        // way the view the turn ends on has it.
        moveShip(event.playerId, event.position, null, facingIn(next, event.playerId))
        burst(event.playerId, TABLE.success, 26, 600, event.position)
        return BEAT.small
      case 'heat_check':
        if (event.damage > 0) {
          float(event.playerId, `${event.damage} heat`, 'heat', FLOAT.normal)
          return BEAT.small
        }
        if (event.carried > 0) mark(event.playerId, `HEAT +${event.carried}`, 'heat')
        return event.carried > 0 ? BEAT.small : 0
      case 'weapon_fired': {
        const ends = {
          from: at(event.attackerId),
          to: at(event.targetId),
          fromId: event.attackerId,
          toId: event.targetId,
          color: EFFECT_COLORS[event.weaponType],
        }
        if (event.weaponType === 'plasma_cannon') {
          effects.push({ kind: 'plasma', ...ends, duration: PULSE.plasma })
          return BEAT.plasma
        }
        if (event.weaponType === 'disruptor') {
          const facing =
            board.ships[event.attackerId]?.facing ?? facingIn(next, event.attackerId) ?? 'prograde'
          effects.push({
            kind: 'ray',
            ...ends,
            cells: weaponReach(firedFrom(next, event), ends.from, facing),
            stopAt: SHIELD_RADIUS,
            duration: PULSE.ray,
          })
          return BEAT.ray
        }
        effects.push({ kind: 'beam', weapon: event.weaponType, ...ends, duration: 520 })
        return BEAT.fire
      }
      case 'attack_resolved': {
        dice.push({
          roll: event.roll,
          critThreshold: critThresholdFor(
            next,
            event.attackerId,
            sensing.has(sensorKey(event.turn, event.attackerId))
          ),
          outcome: event.result,
          attackerId: event.attackerId,
          targetId: event.targetId,
          label: event.weaponType,
        })
        // A missile is spent by its attack, hit or miss. Where it was is the
        // side it came in from, unless it had already reached the target's sector.
        const missile = event.missileId
          ? board.missiles.find(m => m.id === event.missileId)
          : undefined
        const missileAt: Position | undefined = missile ? positionOf(missile) : undefined
        const approach =
          missileAt && !samePosition(missileAt, at(event.targetId)) ? missileAt : undefined
        if (event.missileId) board.missiles = board.missiles.filter(m => m.id !== event.missileId)
        if (event.result === 'miss') {
          float(event.targetId, 'MISS', 'miss', FLOAT.normal)
          return BEAT.resolve
        }
        if (event.result === 'critical') {
          float(event.targetId, 'CRIT!', 'crit', FLOAT.long)
          burst(event.targetId, TABLE.ink, 34, 700)
        }
        // A disruptor does no damage: a powered shield stops it at the shield,
        // and otherwise the EMP gets into the hull and the named slot breaks
        // (its own `subsystem_broken` follows, and is marked as any break is).
        if (event.weaponType === 'disruptor') {
          if (event.blocked) {
            flare(event.targetId, event.attackerId, 'shield', TABLE.teal, SHIELD_RADIUS, {
              accent: EFFECT_COLORS.disruptor,
            })
            float(event.targetId, 'BLOCKED', 'shield', FLOAT.normal)
          } else {
            flare(event.targetId, event.attackerId, 'emp', EFFECT_COLORS.disruptor, 30)
          }
          return BEAT.resolve
        }
        // Whatever a shield soaks, it flares on the side the shot came from,
        // with the shot's own colour splashing across it: in full when it took
        // everything, weaker when some of it got through to the hull.
        if (event.absorbed > 0)
          flare(event.targetId, event.attackerId, 'shield', TABLE.teal, SHIELD_RADIUS, {
            accent: EFFECT_COLORS[event.weaponType],
            strength: event.absorbed / (event.absorbed + event.toHull),
            from: approach,
          })
        // Plasma that reached the hull bursts on it.
        if (event.weaponType === 'plasma_cannon' && event.toHull > 0)
          flare(event.targetId, event.attackerId, 'plasma', PLASMA_GREEN, 40)
        if (event.toHull > 0)
          float(event.targetId, `-${event.toHull}`, 'damage', FLOAT.normal, { x: 0, y: 14 })
        if (event.absorbed > 0)
          float(event.targetId, `${event.absorbed} shielded`, 'shield', FLOAT.normal, {
            x: 26,
            y: 0,
          })
        return BEAT.resolve
      }
      case 'missile_launched':
        board.missiles = [
          ...board.missiles,
          {
            id: event.missileId,
            ownerId: event.ownerId,
            targetId: event.targetId,
            wellId: event.at.wellId,
            ring: event.at.ring,
            sector: event.at.sector,
            movesMade: 0,
            criticalTarget: event.criticalTarget,
          },
        ]
        return BEAT.small
      case 'missile_moved':
        board.missiles = board.missiles.map(m =>
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
      case 'missile_intercepted': {
        const hit = event.destroyed
        dice.push({
          roll: event.roll,
          critThreshold: BASE_CRIT,
          outcome: hit ? 'destroyed' : 'leaked',
          attackerId: event.targetId,
          targetId: event.ownerId,
          label: 'point defence',
        })
        const missile = board.missiles.find(m => m.id === event.missileId)
        effects.push({
          kind: 'beam',
          weapon: 'pdc',
          from: at(event.targetId),
          // The rack is the ship being shot at; the other end is a missile in
          // flight, which is a place and not a hull.
          fromId: event.targetId,
          to: missile ? positionOf(missile) : { wellId: 'blackhole', ring: 1, sector: 0 },
          color: EFFECT_COLORS.pdc,
          duration: 400,
        })
        if (hit) {
          board.missiles = board.missiles.filter(m => m.id !== event.missileId)
          float(event.targetId, 'INTERCEPTED', 'good', FLOAT.normal)
        }
        return BEAT.intercept
      }
      case 'missile_expired':
        board.missiles = board.missiles.filter(m => m.id !== event.missileId)
        return BEAT.small
      case 'subsystem_broken': {
        pulses.push(`${event.playerId}:${event.subsystemId}`)
        // A critical that breaks a tile is worth naming: everyone at the table
        // saw whose shot did it.
        const attacker = event.by ? next.players.find(p => p.id === event.by)?.name : undefined
        float(event.playerId, attacker ? `BROKEN by ${attacker}` : 'BROKEN', 'crit', FLOAT.long)
        return BEAT.small
      }
      case 'subsystem_revealed':
        pulses.push(`${event.playerId}:${event.subsystemId}`)
        return 0
      case 'subsystem_powered': {
        // Powering reveals nothing, so only a sensor this seat can already
        // see counts: our own, or one face-up at the table.
        const slot = next.players
          .find(p => p.id === event.playerId)
          ?.slots.find(s => s.id === event.subsystemId)
        if ((event.subsystemType ?? slot?.type) === 'sensor_array')
          sense(event.turn, event.playerId)
        return 0
      }
      case 'scanned':
        // The scan leaves the sensor's energy on it: every shot after it has
        // the wider range.
        sense(event.turn, event.scannerId)
        effects.push({
          kind: 'beam',
          weapon: 'scan',
          from: at(event.scannerId),
          to: at(event.targetId),
          fromId: event.scannerId,
          toId: event.targetId,
          color: TABLE.teal,
          duration: 700,
        })
        float(event.targetId, 'SCANNED', 'good', FLOAT.normal)
        return BEAT.resolve
      case 'ship_destroyed': {
        const where = at(event.victimId)
        // Missiles aimed at it fly on; its own go out with their own
        // `missile_expired` events.
        updateShip(event.victimId, { alive: false })
        burst(event.victimId, TABLE.danger, 46, 900, where)
        float(event.victimId, 'DESTROYED', 'damage', FLOAT.long)
        return BEAT.destroy
      }
      case 'docked':
        burst(event.playerId, TABLE.success, 28, 700)
        float(event.playerId, 'DOCKED', 'good', FLOAT.normal)
        return BEAT.resolve
      case 'cargo_picked_up':
      case 'cargo_delivered':
        return BEAT.small
      case 'cargo_seized':
        mark(event.victimId, event.kind === 'data' ? 'DATA SEIZED' : 'CRATE SEIZED', 'heat', {
          at: event.at,
        })
        mark(event.pirateId, '+LOOT', 'good', { at: event.at })
        return BEAT.resolve
      case 'fuel_pumped':
        mark(event.playerId, `SOLD ${event.amount} FUEL`, 'good')
        return BEAT.small
      case 'wreck_left':
        // The DESTROYED burst is already on the sector; the wreck just appears
        // where the ship died.
        board.wrecks = [...board.wrecks, { id: event.wreckId, position: event.at }]
        return BEAT.small
      case 'wreck_salvaged':
        board.wrecks = board.wrecks.filter(w => w.id !== event.wreckId)
        mark(event.playerId, 'SALVAGED · BLACK BOX', 'good', { at: event.at })
        return BEAT.resolve
      case 'escort_marked': {
        setEscort(event.carrierId, event.escortId, true)
        const carrier = next.players.find(p => p.id === event.carrierId)?.name ?? 'carrier'
        mark(event.escortId, `ESCORTING ${carrier.toUpperCase()}`, 'good')
        return BEAT.resolve
      }
      case 'escort_released':
        // One of the two ships was destroyed: the marker comes off the carrier.
        setEscort(event.carrierId, event.escortId, false)
        mark(event.escortId, 'ESCORT MARKER BACK', 'miss')
        return BEAT.small
      case 'mission_completed':
        // Anybody's card can pay on anybody's turn: an Escort pays when the
        // ship it marks sells, and its marker comes off with it.
        if (event.mission.type === 'escort' && event.mission.markedPlayerId)
          setEscort(event.mission.markedPlayerId, event.playerId, false)
        float(event.playerId, 'MISSION', 'good', FLOAT.long)
        return BEAT.resolve
      case 'action_skipped':
        // The target was already destroyed: the shot is simply not taken.
        float(event.playerId, event.action === 'scan' ? 'NO SCAN' : 'NO SHOT', 'miss', FLOAT.short)
        return BEAT.small
      case 'stations_moved': {
        board.stations = next.stations
        // Wrecks drift in the same step, each by its own ring's speed: they
        // slide along the ring to where the event says they are.
        const drifted = new Map(event.wrecks.map(w => [w.id, w]))
        let drifting = false
        board.wrecks = board.wrecks.map(wreck => {
          const to = drifted.get(wreck.id)
          if (!to) return wreck
          const position: Position = positionOf(to)
          if (position.sector === wreck.position.sector) return { id: wreck.id, position }
          drifting = true
          return {
            id: wreck.id,
            position,
            motion: { from: wreck.position, start: clock.now, duration: BEAT.move / clock.tempo },
          }
        })
        if (drifting) effects.push({ kind: 'tween', duration: BEAT.move })
        // Moored ships ride their station round (RULES §Stations, Moored): slide them
        // along with it rather than letting them snap at the end.
        for (const riderId of event.riders) {
          const rider = next.players.find(p => p.id === riderId)?.ship
          if (rider) moveShip(riderId, positionOf(rider), 'coast')
        }
        return event.riders.length > 0 || drifting ? BEAT.move : BEAT.small
      }
      default:
        // Unknown event types are ignored, never thrown on: an engine that adds
        // an event must not break a client that has not learned it yet.
        return 0
    }
  })()

  return { state: { board, sensing }, hold, effects, dice, pulses }
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/** Two cues are the same shot when they film the same thing: no lead-in between them. */
export function shotKey(shot: ShotDraft): string {
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

/**
 * The shot an event deserves, asked of the board before the event plays, or
 * null when it deserves none and the camera should stay on whatever it is
 * already filming (a rotation, a die being read, a heat check).
 */
export function shotFor(state: BeatState, next: GameView, event: GameEvent): ShotDraft | null {
  const at = (playerId: string) => effectPosition(state.board, next, playerId)
  const duel = (attackerId: string, targetId: string): ShotDraft => ({
    kind: 'duel',
    attackerId,
    targetId,
    from: at(attackerId),
    to: at(targetId),
  })
  switch (event.type) {
    case 'coasted':
    case 'burned':
    case 'jumped':
      return {
        kind: 'move',
        move: event.type === 'coasted' ? 'coast' : event.type === 'burned' ? 'burn' : 'jump',
        playerId: event.playerId,
        from: at(event.playerId),
        to: event.to,
      }
    case 'weapon_fired':
    case 'attack_resolved':
      return duel(event.attackerId, event.targetId)
    case 'scanned':
      return duel(event.scannerId, event.targetId)
    case 'missile_launched':
      return duel(event.ownerId, event.targetId)
    case 'cargo_seized':
      return duel(event.pirateId, event.victimId)
    case 'missile_moved': {
      const missile = state.board.missiles.find(m => m.id === event.missileId)
      return missile
        ? { kind: 'missiles', targetId: missile.targetId, at: at(missile.targetId) }
        : null
    }
    case 'missile_intercepted':
      return { kind: 'missiles', targetId: event.targetId, at: at(event.targetId) }
    case 'ship_destroyed':
      return { kind: 'ship', mood: 'destroyed', playerId: event.victimId, at: at(event.victimId) }
    case 'docked':
      return { kind: 'ship', mood: 'docked', playerId: event.playerId, at: at(event.playerId) }
    case 'respawned':
      return { kind: 'ship', mood: 'arrived', playerId: event.playerId, at: event.position }
    default:
      return null
  }
}
