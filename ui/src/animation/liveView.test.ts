/**
 * The cards, folded event by event, end every turn on the view the turn ends on.
 *
 * Real bot games are replayed from one seat and from the spectator's chair,
 * each with the events that viewer is sent. Folding a turn's events from
 * `liveStart(prev)` must leave every card field `next` shows (hull, heat,
 * fuel, the cubes and the state of every tile, what the viewer knows of each
 * slot, ammo, points and completed cards) where `next` has it; otherwise a
 * card would jump when the view is committed.
 *
 * Allowed to snap at the commit, and so not compared: positions and facing
 * (the board's overlay carries them), the hold and cargo counts, stations
 * sold at, Escort markers, `recovering` and `isActive` (no event states the
 * hold's item ids, and the last two change with no event at the end of a
 * turn), and the order of completed cards (a rival's hand order is private).
 */
import { describe, expect, it } from 'vitest'
import type {
  GameConfig,
  GameEvent,
  GameView,
  Player,
  PlayerView,
} from '@dangerous-inclinations/engine'
import { filterEventsFor, runGame, viewFor } from '@dangerous-inclinations/engine'
import { LOADOUTS } from '../../../engine/src/test/testUtils.ts'
import { foldEvent, liveStart } from './liveView'

interface Played {
  viewer: string | null
  turn: number
  prev: GameView
  next: GameView
  events: GameEvent[]
}

function playedTurns(config: GameConfig, viewers: (string | null)[]): Played[] {
  const recording = runGame({ ...config, maxTurns: 120, record: true }).recording!
  return viewers.flatMap(viewer => {
    let state = recording.initialState
    return recording.turns.map(turn => {
      const played = {
        viewer,
        turn: turn.turnNumber,
        prev: viewFor(state, viewer),
        next: viewFor(turn.resultingStateSnapshot, viewer),
        events: filterEventsFor(turn.events, viewer),
      }
      state = turn.resultingStateSnapshot
      return played
    })
  })
}

const VIEWERS = ['bot-1', 'bot-2', null]

/** Natural games, and one with a missile boat dealt Destroy so salvos fly and racks answer them. */
const TURNS = [
  { seed: 11, botCount: 3 },
  { seed: 12, botCount: 5 },
  {
    seed: 14,
    botCount: 3,
    seatLoadouts: { 'bot-2': LOADOUTS.missileBoat },
    seatHands: { 'bot-2': 'destroy_ship' },
  } satisfies GameConfig,
].flatMap(config => playedTurns(config, VIEWERS))

const fold = ({ prev, next, events }: Played): GameView =>
  events.reduce((live, event) => foldEvent(live, event, next), liveStart(prev))

/** What a rival's card shows, without what may snap. */
function card(p: PlayerView) {
  return {
    hull: p.ship?.hitPoints ?? null,
    destroyed: p.ship?.isDestroyed ?? null,
    heat: p.ship?.heat ?? null,
    fuel: p.ship?.fuel ?? null,
    points: p.points,
    completed: p.completedMissions.map(m => m.id).sort(),
    slots: p.slots.map(s => [s.id, s.type, s.knownVia, s.isBroken, s.allocatedEnergy, s.ammo]),
    fixed: p.fixed.map(f => [f.id, f.isBroken, f.allocatedEnergy]),
  }
}

/** What the viewer's own status block and loadout show. */
function own(me: Player | null) {
  if (!me) return null
  return {
    hull: me.ship.hitPoints,
    heat: me.ship.heat.currentHeat,
    fuel: me.ship.reactionMass,
    points: me.points,
    completed: me.missions.filter(m => m.isCompleted).map(m => m.id),
    tiles: me.ship.subsystems.map(t => [t.id, t.allocatedEnergy, t.isBroken, t.isRevealed, t.ammo]),
  }
}

const shown = (view: GameView) => ({
  players: Object.fromEntries(view.players.map(p => [p.id, card(p)])),
  me: own(view.me),
})

const count = (events: GameEvent[], type: GameEvent['type']) =>
  events.filter(e => e.type === type).length

describe('the cards during a turn', () => {
  it('end every turn on the cards the next view shows', () => {
    // The games hold everything the fold reads.
    const all = TURNS.flatMap(t => t.events)
    for (const type of [
      'subsystem_powered',
      'weapon_fired',
      'attack_resolved',
      'missile_intercepted',
      'subsystem_broken',
      'subsystem_revealed',
      'scan_result',
      'ship_destroyed',
      'respawned',
      'docked',
      'fuel_scooped',
      'mission_completed',
      'heat_check',
    ] as const)
      expect(count(all, type), type).toBeGreaterThan(0)

    const drifted = TURNS.flatMap(played => {
      const expected = shown(played.next)
      const actual = shown(fold(played))
      return JSON.stringify(actual) === JSON.stringify(expected)
        ? []
        : [
            {
              viewer: played.viewer,
              turn: played.turn,
              events: played.events.map(e => e.type),
              actual,
              expected,
            },
          ]
    })
    expect(drifted.slice(0, 3)).toEqual([])
  })

  it('starts from the turn before, the acting loadout cleared', () => {
    let cleared = 0
    for (const { prev } of TURNS) {
      const live = liveStart(prev)
      const active = live.players.find(p => p.id === prev.activePlayerId)
      if (prev.phase !== 'active' || !active?.ship || active.ship.isDestroyed) {
        expect(live).toBe(prev)
        continue
      }
      expect([...active.slots, ...active.fixed].every(t => t.allocatedEnergy === 0)).toBe(true)
      if (live !== prev) cleared++
    }
    expect(cleared).toBeGreaterThan(0)
  })

  it('keeps the view itself for an event no card shows', () => {
    for (const played of TURNS) {
      let live = liveStart(played.prev)
      for (const event of played.events) {
        const folded = foldEvent(live, event, played.next)
        if (
          event.type === 'missile_moved' ||
          event.type === 'stations_moved' ||
          event.type === 'wreck_left'
        )
          expect(folded).toBe(live)
        live = folded
      }
    }
  })

  it('shows a rival slot face-down until an event turns it over', () => {
    const turning: GameEvent['type'][] = ['subsystem_revealed', 'subsystem_broken', 'scan_result']
    for (const played of TURNS) {
      let live = liveStart(played.prev)
      for (const event of played.events) {
        const before = live
        live = foldEvent(live, event, played.next)
        if (turning.includes(event.type) || event.type === 'respawned' || event.type === 'deployed')
          continue
        for (const p of live.players) {
          const was = before.players.find(b => b.id === p.id)!
          p.slots.forEach((s, i) =>
            expect(s.type, `${event.type} ${p.id}:${s.id}`).toBe(was.slots[i].type)
          )
        }
      }
    }
  })
})
