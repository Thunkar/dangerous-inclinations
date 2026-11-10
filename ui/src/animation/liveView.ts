/**
 * The cards in step with the board.
 *
 * While a turn plays, the board moves beat by beat but every card used to
 * read the committed view, so hull, heat, fuel and cubes sat on the turn's
 * start and jumped when the view was committed. This folds the turn's events
 * into a copy of the view the turn started from, one at a time, the way the
 * board's overlay is folded (`beats.ts`), so a card can show what the table
 * has seen so far.
 *
 * Only results an event states are folded: nothing is diffed against the
 * view the turn ends on. The one exception is a ship coming back (or going
 * down on the board for the first time), which is copied from `next` whole:
 * the turn holds nothing else. A rival is patched only from public events
 * and the private ones this seat was sent, so a face-down slot shows its
 * type at the moment it is revealed, broken or scanned, never earlier.
 *
 * What this leaves to the commit: positions and facing (the board has them),
 * the hold, the stations sold at, Escort markers, `recovering`, `isActive`
 * and the view's own `turn`.
 */
import type {
  GameEvent,
  GameView,
  Mission,
  Player,
  PlayerView,
  SubsystemId,
  SubsystemType,
} from '@dangerous-inclinations/engine'
import { getMissileStats } from '@dangerous-inclinations/engine'

type SlotView = PlayerView['slots'][number]
type FixedView = PlayerView['fixed'][number]
type Tile = Player['ship']['subsystems'][number]

/** `items.map(f)`, but the same array when `f` changed nothing. */
function mapSame<T>(items: T[], f: (item: T) => T): T[] {
  let changed = false
  const out = items.map(item => {
    const next = f(item)
    if (next !== item) changed = true
    return next
  })
  return changed ? out : items
}

interface PlayerPatch {
  /** The public card. */
  view?: (player: PlayerView) => PlayerView
  /** The viewer's own record, when the player is the viewer. */
  me?: (me: Player) => Player
}

function patchPlayer(live: GameView, playerId: string, patch: PlayerPatch): GameView {
  const players = patch.view
    ? mapSame(live.players, p => (p.id === playerId ? patch.view!(p) : p))
    : live.players
  const me = live.me && live.me.id === playerId && patch.me ? patch.me(live.me) : live.me
  if (players === live.players && me === live.me) return live
  return { ...live, players, me }
}

function patchShip(
  live: GameView,
  playerId: string,
  view: (ship: NonNullable<PlayerView['ship']>) => NonNullable<PlayerView['ship']>,
  me: (ship: Player['ship']) => Player['ship']
): GameView {
  return patchPlayer(live, playerId, {
    view: p => {
      if (!p.ship) return p
      const ship = view(p.ship)
      return ship === p.ship ? p : { ...p, ship }
    },
    me: m => {
      const ship = me(m.ship)
      return ship === m.ship ? m : { ...m, ship }
    },
  })
}

function setHull(live: GameView, playerId: string, hull: number): GameView {
  return patchShip(
    live,
    playerId,
    s => (s.hitPoints === hull ? s : { ...s, hitPoints: hull, isDestroyed: hull <= 0 }),
    s => (s.hitPoints === hull ? s : { ...s, hitPoints: hull })
  )
}

function hullOf(live: GameView, playerId: string): number | null {
  return live.players.find(p => p.id === playerId)?.ship?.hitPoints ?? null
}

function changeHull(live: GameView, playerId: string, by: number): GameView {
  const hull = hullOf(live, playerId)
  return hull === null || by === 0 ? live : setHull(live, playerId, Math.max(0, hull + by))
}

function setHeat(live: GameView, playerId: string, heat: number): GameView {
  return patchShip(
    live,
    playerId,
    s => (s.heat === heat ? s : { ...s, heat }),
    s => (s.heat.currentHeat === heat ? s : { ...s, heat: { currentHeat: heat } })
  )
}

function addHeat(live: GameView, playerId: string, amount: number): GameView {
  const heat = live.players.find(p => p.id === playerId)?.ship?.heat
  return heat === undefined || amount === 0 ? live : setHeat(live, playerId, heat + amount)
}

function addFuel(live: GameView, playerId: string, amount: number): GameView {
  if (amount === 0) return live
  return patchShip(
    live,
    playerId,
    s => ({ ...s, fuel: s.fuel + amount }),
    s => ({ ...s, reactionMass: s.reactionMass + amount })
  )
}

/** Change one tile wherever the viewer sees it: the card's slot or fixed badge, and their own record. */
function patchTile(
  live: GameView,
  playerId: string,
  id: SubsystemId,
  patch: {
    slot?: (slot: SlotView) => SlotView
    fixed?: (fixed: FixedView) => FixedView
    own?: (tile: Tile) => Tile
  }
): GameView {
  return patchPlayer(live, playerId, {
    view: p => {
      const slots = patch.slot ? mapSame(p.slots, s => (s.id === id ? patch.slot!(s) : s)) : p.slots
      const fixed = patch.fixed
        ? mapSame(p.fixed, f => (f.id === id ? patch.fixed!(f) : f))
        : p.fixed
      return slots === p.slots && fixed === p.fixed ? p : { ...p, slots, fixed }
    },
    me: m => {
      if (!patch.own) return m
      const subsystems = mapSame(m.ship.subsystems, t => (t.id === id ? patch.own!(t) : t))
      return subsystems === m.ship.subsystems ? m : { ...m, ship: { ...m.ship, subsystems } }
    },
  })
}

/** Cubes on a tile: `f` of what is there now. */
function tileEnergy(
  live: GameView,
  playerId: string,
  id: SubsystemId,
  f: (energy: number) => number
): GameView {
  const energy = <T extends { allocatedEnergy: number }>(t: T): T => {
    const allocatedEnergy = f(t.allocatedEnergy)
    return allocatedEnergy === t.allocatedEnergy ? t : { ...t, allocatedEnergy }
  }
  return patchTile(live, playerId, id, { slot: energy, fixed: energy, own: energy })
}

const addCubes = (live: GameView, playerId: string, id: SubsystemId, heat: number) =>
  heat === 0 ? live : tileEnergy(live, playerId, id, e => e + heat)

const MAX_AMMO = getMissileStats().maxAmmo

/**
 * A slot the viewer now sees face-up. A launcher that was face-down has never
 * fired (firing turns it over), so its magazine is full, unless this turn's
 * shot already took some off (`weapon_fired` comes before its reveal).
 */
function faceUp(slot: SlotView, type: SubsystemType, via: 'revealed' | 'scanned'): SlotView {
  const knownVia = slot.knownVia === 'own' || slot.knownVia === 'revealed' ? slot.knownVia : via
  const ammo = type === 'missiles' ? (slot.ammo ?? MAX_AMMO) : null
  const isBroken = slot.isBroken ?? false
  if (
    slot.type === type &&
    slot.knownVia === knownVia &&
    slot.ammo === ammo &&
    slot.isBroken === isBroken
  )
    return slot
  return { ...slot, type, knownVia, ammo, isBroken }
}

function addMission(list: Mission[], mission: Mission): Mission[] {
  return list.some(m => m.id === mission.id)
    ? list.map(m => (m.id === mission.id ? mission : m))
    : [...list, mission]
}

/** A player taken from the view the turn ends on: the whole ship is new. */
function fromNext(live: GameView, next: GameView, playerId: string): GameView {
  const card = next.players.find(p => p.id === playerId)
  const me = live.me?.id === playerId ? next.me : live.me
  if (!card) return live
  return {
    ...live,
    players: live.players.map(p => (p.id === playerId ? card : p)),
    me,
  }
}

/**
 * The view a turn's playback starts from: `prev` with the active player's
 * loadout cleared, as the engine clears it before the first action
 * (`clearLoadout`, which emits no event). A ship that is coming back is not
 * cleared: its respawn replaces the ship whole.
 */
export function liveStart(prev: GameView): GameView {
  if (prev.phase !== 'active') return prev
  const active = prev.players.find(p => p.id === prev.activePlayerId)
  if (!active?.ship || active.ship.isDestroyed) return prev
  const zero = <T extends { allocatedEnergy: number }>(t: T): T =>
    t.allocatedEnergy === 0 ? t : { ...t, allocatedEnergy: 0 }
  return patchPlayer(prev, active.id, {
    view: p => {
      const slots = mapSame(p.slots, zero)
      const fixed = mapSame(p.fixed, zero)
      return slots === p.slots && fixed === p.fixed ? p : { ...p, slots, fixed }
    },
    me: m => {
      const subsystems = mapSame(m.ship.subsystems, zero)
      return subsystems === m.ship.subsystems ? m : { ...m, ship: { ...m.ship, subsystems } }
    },
  })
}

/**
 * One event folded into the cards. Returns `live` itself when the event
 * changes nothing a card shows, so a consumer re-renders only on the beats
 * that move it. `next` is the view the turn ends on, read only for a ship
 * that comes back or is placed.
 */
export function foldEvent(live: GameView, event: GameEvent, next: GameView): GameView {
  switch (event.type) {
    case 'respawned':
    case 'deployed':
      return fromNext(live, next, event.playerId)

    // Energy: a power action sets a tile; every other action adds the cubes
    // its event reports to the tile it used (`useSubsystem`).
    case 'subsystem_powered':
      return tileEnergy(live, event.playerId, event.subsystemId, () => event.amount)
    case 'rotated':
      return addCubes(live, event.playerId, 'rotation', event.heat)
    case 'coasted':
      return event.scooped ? addCubes(live, event.playerId, 'scoop', event.heat) : live
    case 'fuel_scooped':
      return addFuel(live, event.playerId, event.amount)
    case 'burned':
    case 'jumped':
      return addFuel(
        addCubes(live, event.playerId, 'engines', event.heat),
        event.playerId,
        -event.massSpent
      )
    case 'recoil':
      return event.compensated
        ? addFuel(
            addCubes(live, event.playerId, 'engines', event.heat),
            event.playerId,
            -event.massSpent
          )
        : live
    case 'weapon_fired': {
      const fired = addCubes(live, event.attackerId, event.subsystemId, event.heat)
      if (event.weaponType !== 'missiles') return fired
      const count = event.count ?? 1
      // A face-down launcher's magazine is full until it fires; the event is
      // public and names the weapon, and the tile stays face-down until its
      // reveal, which follows.
      return patchTile(fired, event.attackerId, event.subsystemId, {
        slot: s => ({ ...s, ammo: (s.ammo ?? MAX_AMMO) - count }),
        own: t => ({ ...t, ammo: (t.ammo ?? MAX_AMMO) - count }),
      })
    }
    case 'scanned':
      return addCubes(live, event.scannerId, event.sensorId, event.heat)

    // Hull and the heat track.
    case 'attack_resolved':
      return addHeat(
        setHull(live, event.targetId, event.targetHullAfter),
        event.targetId,
        event.absorbed
      )
    case 'missile_intercepted':
      return addHeat(live, event.targetId, event.heat)
    case 'heat_check':
      return setHeat(changeHull(live, event.playerId, -event.damage), event.playerId, event.carried)
    case 'ship_destroyed':
      return patchShip(
        live,
        event.victimId,
        s => (s.isDestroyed ? s : { ...s, isDestroyed: true }),
        s => s
      )

    // Tiles turning over, breaking and coming back.
    case 'subsystem_revealed':
      return patchTile(live, event.playerId, event.subsystemId, {
        slot: s => faceUp(s, event.subsystemType, 'revealed'),
        own: t => (t.isRevealed ? t : { ...t, isRevealed: true }),
      })
    case 'subsystem_broken': {
      const broken = patchTile(live, event.playerId, event.subsystemId, {
        slot: s => ({
          ...faceUp(s, event.subsystemType, 'revealed'),
          isBroken: true,
          allocatedEnergy: 0,
        }),
        fixed: f => ({ ...f, isBroken: true, allocatedEnergy: 0 }),
        own: t => ({ ...t, isBroken: true, isRevealed: true, allocatedEnergy: 0 }),
      })
      return addHeat(broken, event.playerId, event.energyLost)
    }
    case 'subsystem_repaired':
      return repair(live, event.playerId, [event.subsystemId])
    case 'scan_result':
      // Private to the scanner: what the peek showed is face-up for them alone.
      return patchTile(live, event.targetId, event.slot, {
        slot: s => faceUp(s, event.subsystemType, 'scanned'),
      })

    case 'docked': {
      let docked = changeHull(
        repair(live, event.playerId, event.repaired),
        event.playerId,
        event.hullRestored
      )
      if (event.missilesReloaded) docked = reload(docked, event.playerId)
      return docked
    }
    case 'fuel_pumped':
      return addFuel(live, event.playerId, -event.amount)

    case 'mission_completed':
      return patchPlayer(live, event.playerId, {
        view: p => ({
          ...p,
          points: event.points,
          completedMissions: addMission(p.completedMissions, event.mission),
        }),
        me: m => ({ ...m, points: event.points, missions: addMission(m.missions, event.mission) }),
      })

    // The board's (moves, missiles, wrecks, stations, markers) or the commit's
    // (the hold, sales, the end of the game).
    default:
      return live
  }
}

function repair(live: GameView, playerId: string, ids: SubsystemId[]): GameView {
  return ids.reduce(
    (acc, id) =>
      patchTile(acc, playerId, id, {
        slot: s => (s.isBroken ? { ...s, isBroken: false } : s),
        fixed: f => (f.isBroken ? { ...f, isBroken: false } : f),
        own: t => (t.isBroken ? { ...t, isBroken: false } : t),
      }),
    live
  )
}

/** A dock fills every launcher; one still face-down to this seat shows nothing either way. */
function reload(live: GameView, playerId: string): GameView {
  return patchPlayer(live, playerId, {
    view: p => {
      const slots = mapSame(p.slots, s =>
        s.type === 'missiles' && s.ammo !== MAX_AMMO ? { ...s, ammo: MAX_AMMO } : s
      )
      return slots === p.slots ? p : { ...p, slots }
    },
    me: m => {
      const subsystems = mapSame(m.ship.subsystems, t =>
        t.type === 'missiles' && t.ammo !== MAX_AMMO ? { ...t, ammo: MAX_AMMO } : t
      )
      return subsystems === m.ship.subsystems ? m : { ...m, ship: { ...m.ship, subsystems } }
    },
  })
}
