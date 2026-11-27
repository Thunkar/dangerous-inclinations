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
import { Vector3 } from 'three'
import type {
  GameConfig,
  GameEvent,
  GameView,
  Position,
  WeaponType,
} from '@dangerous-inclinations/engine'
import { executeTurn, filterEventsFor, runGame, viewFor } from '@dangerous-inclinations/engine'
import {
  ALPHA,
  LOADOUTS,
  fold,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
} from '../../../engine/src/test/testUtils.ts'
import {
  WORMHOLE,
  foldFlight,
  foldLanded,
  foldThrust,
  mouthsOpen,
} from '../components/board/wormhole'
import { mooringSpot } from '../ships/station'
import {
  LAYER,
  berthAlong,
  berthRide,
  berthWorld,
  elevationAt,
  positionWorld,
  slideWorld,
  stationYaw,
  toWorld,
} from '../components/board/three/world'
import { crowdOffset, radialPoint } from '../components/board/geometry'
import {
  BURST_IMPACT,
  clearImpacts,
  reportImpact,
  sampleImpact,
} from '../components/board/three/scene/effects/impacts'
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

  it('starts no slide for a ship that does not move on the beat', () => {
    // A slide the renderer has already played must not be handed back to it
    // restarted, or replaced, on a beat that is somebody else's.
    let checked = 0
    for (const played of TURNS) {
      let state = beatStart(played.prev)
      for (const event of played.events) {
        const before = state.board
        state = eventToBeat(state, played.next, event, CLOCK).state
        const movers = new Set<string>(
          event.type === 'stations_moved'
            ? event.riders
            : 'playerId' in event &&
                [
                  'coasted',
                  'burned',
                  'jumped',
                  'folded',
                  'recoil',
                  'respawned',
                  'deployed',
                ].includes(event.type)
              ? [event.playerId]
              : []
        )
        for (const [id, ship] of Object.entries(before.ships)) {
          if (movers.has(id)) continue
          const after = state.board.ships[id]
          expect(after.motion).toBe(ship.motion)
          expect(after.position).toEqual(ship.position)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('shakes the hull for a critical and never for a jump', () => {
    // A jump's burst is drawn in a critical's cream: the hull reads its cause.
    const shakes = { jumped: [] as number[], critical: [] as number[] }
    for (const played of TURNS) {
      let state = beatStart(played.prev)
      for (const event of played.events) {
        const beat = eventToBeat(state, played.next, event, CLOCK)
        state = beat.state
        const key =
          event.type === 'jumped'
            ? 'jumped'
            : event.type === 'attack_resolved' && event.result === 'critical'
              ? 'critical'
              : null
        if (!key) continue
        for (const burst of beat.effects) {
          if (burst.kind !== 'burst') continue
          clearImpacts()
          const kind = BURST_IMPACT[burst.cause]
          if (kind) reportImpact(burst.playerId, kind, 0)
          shakes[key].push(sampleImpact(burst.playerId, 44).shake)
        }
      }
    }
    clearImpacts()
    expect(shakes.jumped.length).toBeGreaterThan(0)
    expect(shakes.critical.length).toBeGreaterThan(0)
    expect(shakes.jumped.every(shake => shake === 0)).toBe(true)
    expect(shakes.critical.every(shake => shake > 0)).toBe(true)
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
    const box = [1, 2, 3, 4, 5].flatMap(ring =>
      [4, 5, 6, 7, 8].map(sector => ({ wellId: 'blackhole', ring, sector }))
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

describe('a fold goes through a wormhole', () => {
  const from: Position = { wellId: 'blackhole', ring: 3, sector: 0 }
  const to: Position = { wellId: ALPHA, ring: 3, sector: 10 }
  const state = makeTwoPlayerGame({ ...from, facing: 'retrograde', loadout: LOADOUTS.jumpDrive })
  const result = executeTurn(state, [{ ...fold(1, to), playerId: 'p1' }])
  const folded = result.events.find(e => e.type === 'folded')!
  const beat = eventToBeat(
    beatStart(viewFor(state, 'p1')),
    viewFor(result.gameState, 'p1'),
    folded,
    CLOCK
  )

  it('opens a mouth where the ship was and one where it lands, and flies it through', () => {
    const wormholes = beat.effects.filter(e => e.kind === 'wormhole')
    expect(wormholes).toEqual([
      expect.objectContaining({ playerId: 'p1', from, to, facing: 'retrograde' }),
    ])
    expect(beat.state.board.ships.p1).toMatchObject({
      position: to,
      facing: 'retrograde',
      motion: { kind: 'fold', from },
    })
    // Not a jump: no slide across the board and no arrival flash.
    expect(beat.effects.some(e => e.kind === 'burst')).toBe(false)
    expect(
      shotFor(beatStart(viewFor(state, 'p1')), viewFor(result.gameState, 'p1'), folded)
    ).toEqual({ kind: 'fold', playerId: 'p1', from, to })
  })

  it.each<[number, 'entry' | 'exit', boolean, { entry: boolean; exit: boolean }]>([
    [0, 'entry', true, { entry: false, exit: false }],
    [0.3, 'entry', true, { entry: true, exit: false }],
    [0.5, 'exit', false, { entry: true, exit: true }],
    [0.75, 'exit', true, { entry: false, exit: true }],
    [1, 'exit', true, { entry: false, exit: false }],
  ])('at %s of the beat the hull is at the %s mouth', (raw, end, drawn, open) => {
    const flight = foldFlight(raw)
    expect(flight.end).toBe(end)
    expect(flight.scale > 0.01).toBe(drawn)
    const mouths = mouthsOpen(raw)
    expect(mouths.entry > 0.01).toBe(open.entry)
    expect(mouths.exit > 0.01).toBe(open.exit)
  })

  it('burns the engines while the hull flies into one mouth and out of the other', () => {
    // From a standing start, the engines light as the entry mouth opens.
    expect(foldThrust(0)).toBe(0)
    for (let raw = 0; raw <= 1; raw += 0.01) {
      const { scale } = foldFlight(raw)
      const throughAMouth =
        (raw >= WORMHOLE.enter[0] && raw < WORMHOLE.enter[1]) ||
        (raw >= WORMHOLE.emerge[0] && raw < WORMHOLE.emerge[1])
      if (throughAMouth && scale > 0) expect(foldThrust(raw), `at ${raw}`).toBeGreaterThan(0.3)
    }
    // Full as it comes out of the exit mouth, and down to its arrival as it stops.
    expect(foldThrust(WORMHOLE.emerge[0])).toBe(1)
    expect(foldThrust(WORMHOLE.emerge[1])).toBeCloseTo(0.3)
  })

  it('lands the hull as it comes out of the exit mouth, not when the mouth has closed', () => {
    expect(foldLanded(WORMHOLE.emerge[1] - 0.01)).toBe(false)
    expect(foldLanded(WORMHOLE.emerge[1])).toBe(true)
    expect(foldFlight(WORMHOLE.emerge[1]).scale).toBe(1)
  })
})

describe('a moored ship rides its station', () => {
  // A berth a sector ahead of the station, carried four sectors on Alpha's station ring.
  const berth = mooringSpot(1, 0)
  const from: Position = { wellId: ALPHA, ring: 2, sector: 5 }
  const to: Position = { wellId: ALPHA, ring: 2, sector: 9 }
  const before = berthWorld(from, berth, 'prograde')
  const after = berthWorld(to, berth, 'prograde')
  const ride = berthRide(from, to, berth, after.at)
  const stationAt = (t: number) => {
    const point = new Vector3()
    berthAlong({ ...ride, offset: new Vector3() }, t, point)
    return point
  }

  it.each([
    [0, before],
    [1, after],
  ])('stands on its berth, turned with the station, at %s of the step', (t, berthed) => {
    const point = new Vector3()
    const turn = berthAlong(ride, t, point)
    expect(point.distanceTo(berthed.at)).toBeCloseTo(0)
    expect(Math.cos(after.yaw + turn - berthed.yaw)).toBeCloseTo(1)
  })

  it('keeps its place on the station in between', () => {
    const point = new Vector3()
    berthAlong(ride, 0.5, point)
    expect(point.distanceTo(stationAt(0.5))).toBeCloseTo(ride.offset.length())
    expect(ride.yaw).toBeCloseTo(stationYaw({ ...to, sector: to.sector - berth.sector }))
  })
})

describe('a ship sets off from where it was drawn', () => {
  // Leaving Alpha's ring 2 for ring 3, two sectors on: second of three in a
  // crowd, or moored a sector behind the station's centre.
  const from: Position = { wellId: ALPHA, ring: 2, sector: 5 }
  const to: Position = { wellId: ALPHA, ring: 3, sector: 7 }
  const crowded = toWorld(
    radialPoint(from, crowdOffset({ index: 2, count: 3 })),
    elevationAt(from) + LAYER.token
  )
  const moored = berthWorld(from, mooringSpot(-1, 0), 'prograde').at
  const resting = toWorld(
    radialPoint(to, crowdOffset({ index: 0, count: 2 })),
    elevationAt(to) + LAYER.token
  )
  const slot = new Vector3().subVectors(resting, positionWorld(to))

  it.each([
    ['a crowded sector', crowded],
    ['a berth', moored],
  ])('slides out of %s from the hull, into its own place', (_, drawn) => {
    const start = new Vector3().subVectors(drawn, positionWorld(from))
    expect(start.length()).toBeGreaterThan(1)
    const point = new Vector3()
    expect(slideWorld(from, to, 0, start, slot, point).distanceTo(drawn)).toBeCloseTo(0)
    expect(slideWorld(from, to, 1, start, slot, point).distanceTo(resting)).toBeCloseTo(0)
    // No jump on the first frame: a hundredth of the slide is a hundredth of the way.
    const first = slideWorld(from, to, 0.01, start, slot, point).distanceTo(drawn)
    expect(first).toBeLessThan(0.02 * drawn.distanceTo(resting))
  })
})
