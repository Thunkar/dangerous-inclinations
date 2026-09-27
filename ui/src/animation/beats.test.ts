/**
 * A turn played beat by beat ends on the board the next view shows.
 *
 * Real games are replayed through `eventToBeat` from one seat, with the
 * events that seat is sent: every token, missile, wreck and Escort marker
 * the animator leaves on the board when the last event has played must be
 * where the view the turn ends on puts it, or the table would jump when the
 * view is committed. The dice and the marks are checked against the events
 * that raise them.
 */
import { describe, expect, it } from 'vitest'
import type { GameConfig, GameEvent, GameView } from '@dangerous-inclinations/engine'
import { filterEventsFor, runGame, viewFor } from '@dangerous-inclinations/engine'
import {
  beatStart,
  eventToBeat,
  floatStack,
  shotFor,
  snapshotOf,
  type Beat,
  type BoardOverlay,
  type TableEffect,
} from './beats'

const SEAT = 'bot-1'
const CLOCK = { now: 0, tempo: 1 }

interface Played {
  turn: number
  prev: GameView
  next: GameView
  events: GameEvent[]
}

function playedTurns(config: GameConfig): Played[] {
  const recording = runGame({ ...config, maxTurns: 120, record: true }).recording!
  let state = recording.initialState
  return recording.turns.map(turn => {
    const played = {
      turn: turn.turnNumber,
      prev: viewFor(state, SEAT),
      next: viewFor(turn.resultingStateSnapshot, SEAT),
      events: filterEventsFor(turn.events, SEAT),
    }
    state = turn.resultingStateSnapshot
    return played
  })
}

/** Natural games, and one with a missile boat dealt Destroy so salvos fly and racks answer them. */
const TURNS = [
  { seed: 11, botCount: 3 },
  { seed: 12, botCount: 5 },
  {
    seed: 13,
    botCount: 3,
    seatLoadouts: {
      'bot-2': {
        forwardSlots: ['missiles'],
        sideSlots: ['missiles', 'missiles', 'radiator', 'shields'],
      },
    },
    seatHands: { 'bot-2': 'destroy_ship' },
  } satisfies GameConfig,
].flatMap(playedTurns)

function replay({ prev, next, events }: Played): { board: BoardOverlay; beats: Beat[] } {
  let state = beatStart(prev)
  const beats: Beat[] = []
  for (const event of events) {
    shotFor(state, next, event)
    const beat = eventToBeat(state, next, event, CLOCK)
    beats.push(beat)
    state = beat.state
  }
  return { board: state.board, beats }
}

/** What a board shows, without the slides that got it there. */
function resting(board: BoardOverlay) {
  return {
    ships: Object.fromEntries(
      Object.entries(board.ships).map(([id, ship]) => [
        id,
        ship.alive
          ? { alive: true, position: ship.position, facing: ship.facing }
          : { alive: false },
      ])
    ),
    missiles: board.missiles.map(m => [m.id, m.wellId, m.ring, m.sector]).sort(),
    wrecks: board.wrecks.map(w => [w.id, w.position]).sort(),
    escorts: Object.fromEntries(
      Object.entries(board.escorts).map(([id, on]) => [id, [...on].sort()])
    ),
    stations: board.stations,
  }
}

const count = (events: GameEvent[], ...types: GameEvent['type'][]) =>
  events.filter(e => types.includes(e.type)).length

describe('a turn beat by beat', () => {
  it('has turns with fighting, missiles and deaths to replay', () => {
    const all = TURNS.flatMap(t => t.events)
    for (const type of [
      'attack_resolved',
      'missile_launched',
      'missile_moved',
      'ship_destroyed',
      'stations_moved',
      'docked',
    ] as const)
      expect(count(all, type), type).toBeGreaterThan(0)
  })

  it('ends every turn on the board the next view shows', () => {
    const drifted = TURNS.flatMap(played => {
      const expected = resting(snapshotOf(played.next))
      const actual = resting(replay(played).board)
      // A missile that hits is not named by the attack it makes (the engine's
      // attack_resolved carries no missileId), so the board cannot tell which
      // token to take off and keeps it until the view is committed.
      if (played.events.some(e => e.type === 'attack_resolved' && e.weaponType === 'missiles')) {
        delete (actual as Partial<typeof actual>).missiles
        delete (expected as Partial<typeof expected>).missiles
      }
      const keys = Object.keys(expected) as Array<keyof typeof expected>
      const off = keys.flatMap(key => {
        const a = actual[key] as Record<string, unknown>
        const e = expected[key] as Record<string, unknown>
        const ids = [...new Set([...Object.keys(a), ...Object.keys(e)])]
        return ids
          .filter(id => JSON.stringify(a[id]) !== JSON.stringify(e[id]))
          .map(id => ({ key, id, actual: a[id], expected: e[id] }))
      })
      return off.length === 0
        ? []
        : [{ turn: played.turn, events: played.events.map(e => e.type), off }]
    })
    expect(drifted).toEqual([])
  })

  it('rolls a die for every attack and every interception, and no other', () => {
    for (const played of TURNS) {
      const dice = replay(played).beats.flatMap(b => b.dice)
      expect(dice).toHaveLength(count(played.events, 'attack_resolved', 'missile_intercepted'))
    }
  })

  it('flashes a slot for every break and every reveal', () => {
    for (const played of TURNS) {
      const pulses = replay(played).beats.flatMap(b => b.pulses)
      expect(pulses).toHaveLength(count(played.events, 'subsystem_broken', 'subsystem_revealed'))
    }
  })

  it('hangs every mark on a player at the table, and every mark and beat lasts', () => {
    for (const played of TURNS) {
      const seats = new Set(played.next.players.map(p => p.id))
      for (const beat of replay(played).beats) {
        expect(beat.hold).toBeGreaterThanOrEqual(0)
        for (const effect of beat.effects) {
          expect(effect.duration).toBeGreaterThan(0)
          if (effect.kind === 'float' || effect.kind === 'burst')
            expect(seats.has(effect.playerId)).toBe(true)
        }
      }
    }
  })

  it('slides a ship from where it stood', () => {
    for (const played of TURNS) {
      let state = beatStart(played.prev)
      for (const event of played.events) {
        const before = state.board
        state = eventToBeat(state, played.next, event, CLOCK).state
        if (event.type !== 'coasted' && event.type !== 'burned' && event.type !== 'jumped') continue
        const ship = state.board.ships[event.playerId]
        expect(ship.position).toEqual(event.to)
        if (ship.motion) expect(ship.motion.from).toEqual(before.ships[event.playerId].position)
      }
    }
  })

  it('stacks a float on the lowest step its sector has free', () => {
    const here = { wellId: 'blackhole', ring: 3, sector: 4 }
    const there = { wellId: 'blackhole', ring: 3, sector: 5 }
    const float = (id: string, at: typeof here, stack: number): TableEffect => ({
      id,
      kind: 'float',
      at,
      playerId: 'bot-1',
      text: '-2',
      tone: 'damage',
      stack,
      start: 0,
      duration: 1,
    })
    expect(floatStack([], here)).toBe(0)
    expect(floatStack([float('a', here, 0), float('b', there, 1)], here)).toBe(1)
    // The float under a climbing one has gone: its step is the one handed out.
    expect(floatStack([float('b', here, 1), float('c', here, 2)], here)).toBe(0)
    expect(floatStack([float('a', here, 0), float('b', here, 1)], here)).toBe(2)
  })
})
