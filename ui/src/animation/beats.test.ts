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
import type {
  GameConfig,
  GameEvent,
  GameView,
  Position,
  WeaponType,
} from '@dangerous-inclinations/engine'
import { filterEventsFor, runGame, viewFor } from '@dangerous-inclinations/engine'
import { LOADOUTS, makeGameState, makePlayer } from '../../../engine/src/test/testUtils.ts'
import {
  EFFECT_COLORS,
  PLASMA_GREEN,
  beatStart,
  eventToBeat,
  floatStack,
  shotFor,
  snapshotOf,
  type Beat,
  type BoardOverlay,
  type EffectDraft,
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
    seed: 14,
    botCount: 3,
    seatLoadouts: { 'bot-2': LOADOUTS.missileBoat },
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
  it('ends every turn on the board the next view shows', () => {
    // The games hold fighting, missiles, deaths, docks and stations moving.
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

    const drifted = TURNS.flatMap(played => {
      const expected = resting(snapshotOf(played.next))
      const actual = resting(replay(played).board)
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

  it.each<[string, 'dice' | 'pulses', GameEvent['type'][]]>([
    [
      'rolls a die for every attack and every interception',
      'dice',
      ['attack_resolved', 'missile_intercepted'],
    ],
    [
      'flashes a slot for every break and every reveal',
      'pulses',
      ['subsystem_broken', 'subsystem_revealed'],
    ],
  ])('%s, and for nothing else', (_label, field, types) => {
    for (const played of TURNS) {
      const raised = replay(played).beats.reduce((n, b) => n + b[field].length, 0)
      expect(raised).toBe(count(played.events, ...types))
    }
  })

  it('slides a ship from where it stood', () => {
    let slides = 0
    for (const played of TURNS) {
      let state = beatStart(played.prev)
      for (const event of played.events) {
        const before = state.board
        state = eventToBeat(state, played.next, event, CLOCK).state
        if (event.type !== 'coasted' && event.type !== 'burned' && event.type !== 'jumped') continue
        expect(state.board.ships[event.playerId].motion?.from).toEqual(
          before.ships[event.playerId].position
        )
        slides++
      }
    }
    expect(slides).toBeGreaterThan(0)
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

describe('the guns with shapes of their own', () => {
  /** Two ships a ring apart on the black hole: Warden fires, Aurora is fired at. */
  const WARDEN: Position = { wellId: 'blackhole', ring: 3, sector: 6 }
  const AURORA: Position = { wellId: 'blackhole', ring: 4, sector: 5 }

  const table = (): GameView =>
    viewFor(makeGameState([makePlayer('warden', WARDEN), makePlayer('aurora', AURORA)]), 'warden')

  const fired = (weaponType: WeaponType): GameEvent => ({
    type: 'weapon_fired',
    turn: 3,
    attackerId: 'warden',
    targetId: 'aurora',
    subsystemId: 'side-0',
    weaponType,
    heat: 3,
  })

  const resolved = (
    weaponType: WeaponType,
    outcome: Partial<Extract<GameEvent, { type: 'attack_resolved' }>>
  ): GameEvent => ({
    type: 'attack_resolved',
    turn: 3,
    attackerId: 'warden',
    targetId: 'aurora',
    weaponType,
    roll: 6,
    result: 'hit',
    damage: 0,
    toHull: 0,
    absorbed: 0,
    targetHullAfter: 10,
    ...outcome,
  })

  const play = (event: GameEvent) => {
    const view = table()
    return eventToBeat(beatStart(view), view, event, CLOCK)
  }

  it('floods the disruptor box the engine gives it, its own ring and sector included', () => {
    const beat = play(fired('disruptor'))
    const rays = beat.effects.filter(e => e.kind === 'ray')
    expect(rays).toHaveLength(1)
    const ray = rays[0] as Extract<EffectDraft, { kind: 'ray' }>
    const box = [2, 3, 4].flatMap(ring =>
      [5, 6, 7].map(sector => ({ wellId: 'blackhole', ring, sector }))
    )
    expect(ray.cells).toHaveLength(box.length)
    expect(ray.cells).toEqual(expect.arrayContaining(box))
    expect(ray.from).toEqual(WARDEN)
    expect(ray.to).toEqual(AURORA)
  })

  it('throws plasma as bolts in its own green, not as a beam', () => {
    const beat = play(fired('plasma_cannon'))
    expect(beat.effects.map(e => e.kind)).toEqual(['plasma'])
    expect(beat.effects[0]).toMatchObject({ color: PLASMA_GREEN, from: WARDEN, to: AURORA })
  })

  it.each([
    {
      shot: 'a disruptor a shield stopped',
      event: resolved('disruptor', { blocked: true }),
      flares: ['shield'],
      tones: ['shield'],
    },
    {
      shot: 'a disruptor that got through',
      event: resolved('disruptor', {}),
      flares: ['emp'],
      tones: [],
    },
    {
      shot: 'a disruptor that missed',
      event: resolved('disruptor', { result: 'miss', roll: 1 }),
      flares: [],
      tones: ['miss'],
    },
    {
      shot: 'plasma partly through a shield',
      event: resolved('plasma_cannon', { damage: 4, toHull: 2, absorbed: 2 }),
      flares: ['shield', 'plasma'],
      tones: ['damage', 'shield'],
    },
    {
      shot: 'plasma a full wall stopped',
      event: resolved('plasma_cannon', { damage: 4, toHull: 0, absorbed: 4 }),
      flares: ['shield'],
      tones: ['shield'],
    },
    {
      shot: 'a laser on the hull',
      event: resolved('laser', { damage: 2, toHull: 2 }),
      flares: [],
      tones: ['damage'],
    },
  ])('marks $shot', ({ event, flares, tones }) => {
    const { effects } = play(event)
    const marks = effects.filter(e => e.kind === 'flare')
    expect(marks.map(f => f.flare)).toEqual(flares)
    expect(effects.flatMap(e => (e.kind === 'float' ? [e.tone] : []))).toEqual(tones)
    expect(effects.some(e => e.kind === 'burst')).toBe(false)
  })

  it.each<{ weapon: WeaponType; toHull: number; absorbed: number; strength: number | null }>([
    { weapon: 'railgun', toHull: 0, absorbed: 3, strength: 1 },
    { weapon: 'railgun', toHull: 1, absorbed: 3, strength: 0.75 },
    { weapon: 'railgun', toHull: 3, absorbed: 0, strength: null },
    { weapon: 'ballistic_rack', toHull: 1, absorbed: 1, strength: 0.5 },
    { weapon: 'missiles', toHull: 1, absorbed: 1, strength: 0.5 },
    { weapon: 'plasma_cannon', toHull: 2, absorbed: 2, strength: 0.5 },
  ])(
    'flares the shield for a $weapon shot it soaked $absorbed of',
    ({ weapon, toHull, absorbed, strength }) => {
      const { effects } = play(resolved(weapon, { damage: toHull + absorbed, toHull, absorbed }))
      const shields = effects.filter(e => e.kind === 'flare' && e.flare === 'shield')
      if (strength === null) {
        expect(shields).toEqual([])
        return
      }
      expect(shields).toHaveLength(1)
      // In the shot's own colour, as hard as it was soaked.
      expect(shields[0]).toMatchObject({
        accent: EFFECT_COLORS[weapon],
        strength,
      })
    }
  )

  it('flares the shield on the side a missile came in from', () => {
    const view = table()
    const state = beatStart(view)
    const approach: Position = { wellId: 'blackhole', ring: 4, sector: 4 }
    state.board.missiles = [
      {
        id: 'm1',
        ownerId: 'warden',
        targetId: 'aurora',
        ...approach,
        movesMade: 1,
        criticalTarget: 'side-0',
      },
    ]
    const event = resolved('missiles', { missileId: 'm1', damage: 2, toHull: 0, absorbed: 2 })
    const { effects } = eventToBeat(state, view, event, CLOCK)
    expect(effects.find(e => e.kind === 'flare')).toMatchObject({ from: approach })
  })
})
