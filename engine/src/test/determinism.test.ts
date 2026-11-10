/**
 * Determinism: the same seed and the same actions always produce the same
 * game. Fingerprints use canonicalJson (keys sorted at every depth); the old
 * `JSON.stringify(state, Object.keys(state).sort())` dropped every nested key.
 */
import { describe, it, expect } from 'vitest'
import { Rng, nextEntityId, pickIndex, rollD10, withRng } from '../utils/rng.ts'
import { executeTurn } from '../game/turns.ts'
import { runGame } from '../sim/runGame.ts'
import {
  canonicalJson,
  coast,
  deepFreeze,
  eventsOf,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getShip,
  makeTwoPlayerGame,
  playScripted,
  rolling,
  scriptedGameStart,
  withPower,
} from './testUtils.ts'

const TURNS = 30

describe('determinism: scripted games', () => {
  it('the same seed replays to identical states and events at every turn', () => {
    const a = playScripted(scriptedGameStart(0x1234abcd), TURNS)
    const b = playScripted(scriptedGameStart(0x1234abcd), TURNS)
    expect(a).toHaveLength(TURNS)
    // The game replayed has a death and a respawn in it.
    const types = a.flatMap(t => t.events.map(e => e.type))
    expect(types).toContain('ship_destroyed')
    expect(types).toContain('respawned')
    for (let i = 0; i < TURNS; i++) {
      expect(canonicalJson(a[i].state)).toBe(canonicalJson(b[i].state))
      expect(a[i].events).toEqual(b[i].events)
      expect(a[i].actions).toEqual(b[i].actions)
    }
  })

  it('the seed decides the dice: a d10 that varies within a game and between seeds', () => {
    const rolls = (seed: number) =>
      playScripted(scriptedGameStart(seed), TURNS).flatMap(t =>
        eventsOf(t.events, 'attack_resolved').map(e => e.roll)
      )
    const game = rolls(0x1234abcd)
    expect(game.length).toBeGreaterThanOrEqual(4)
    expect(new Set(game).size).toBeGreaterThan(1)
    expect(game.every(r => r >= 1 && r <= 10)).toBe(true)
    expect(rolls(0x0001)).not.toEqual(rolls(0x0002))
  })
})

describe('determinism: the RNG on the state', () => {
  const duel = withPower(
    makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 0 }),
    'p1',
    'side-0',
    2
  )

  it('a shot advances rngState; a coast does not', () => {
    const shot = executeTurnAs(duel, fire(1, 'side-0', 'p2'))
    expect(shot.errors).toBeUndefined()
    expect(shot.gameState.rngState).not.toBe(duel.rngState)
    const drift = executeTurnAs(duel, coast(1))
    expect(drift.gameState.rngState).toBe(duel.rngState)
  })

  it.each([1, 7, 10])('a test pins the die by where the RNG starts: %i', roll => {
    const pinned = { ...duel, ...rolling(roll) }
    const result = executeTurnAs(pinned, fire(1, 'side-0', 'p2'))
    expect(eventsOf(result.events, 'attack_resolved')[0].roll).toBe(roll)
    expect(result.gameState.rngState).not.toBe(pinned.rngState)
  })

  it('the helpers hand back a new state and leave theirs alone', () => {
    const state = deepFreeze(structuredClone(duel))
    const [roll, rolled] = rollD10(state)
    expect(roll).toBe(new Rng(duel.rngState).rollD10())
    expect(rolled.rngState).not.toBe(duel.rngState)
    const [index, picked] = pickIndex(rolled, ['a', 'b', 'c'])
    expect(index).toBeGreaterThanOrEqual(0)
    expect(picked.rngState).not.toBe(rolled.rngState)
    const [id, counted] = nextEntityId(state, 'wreck')
    expect(id).toBe(`wreck-${duel.nextEntityId}`)
    expect(counted.nextEntityId).toBe(duel.nextEntityId + 1)
    const [none, untouched] = withRng(state, () => 0)
    expect(none).toBe(0)
    expect(untouched).toBe(state)
  })
})

describe('determinism: executeTurn is pure', () => {
  it('does not mutate its input on success', () => {
    const state = scriptedGameStart(1)
    const before = canonicalJson(state)
    const result = executeTurnAs(state, fire(1, 'forward-0', 'p2', 'side-2', true))
    expect(result.errors).toBeUndefined()
    expect(canonicalJson(state)).toBe(before)
    expect(getShip(state, 'p2').hitPoints).toBe(10)
    expect(getShip(result.gameState, 'p2').hitPoints).toBeLessThan(10)
  })

  it('returns the very same object, rng included, when the turn is rejected', () => {
    const state = scriptedGameStart(1)
    const rngBefore = state.rngState
    const result = executeTurnAs(
      state,
      fire(1, 'forward-0', 'p2', 'side-2', true),
      fire(2, 'forward-0', 'p2')
    )
    expectRefused(result, state)
    // The first shot on its own is taken: the second firing of the gun is the reason.
    expectRefusedUnless(result, executeTurnAs(state, fire(1, 'forward-0', 'p2', 'side-2', true)))
    expect(result.events).toEqual([])
    // The first shot rolled a die before the second was rejected; the roll must not stick.
    expect(state.rngState).toBe(rngBefore)
    expect(getShip(state, 'p2').hitPoints).toBe(10)
  })
})

describe('determinism: executeTurn never writes to the state it is given', () => {
  // Every turn of a bot game replayed from a deep-frozen state: a write
  // anywhere in the input throws, and the replay must still end where the
  // game did, event for event.
  it.each([
    [3, 1],
    [6, 2],
  ])('%i bots, seed %i', (botCount, seed) => {
    const game = runGame({ seed, botCount, record: true })
    expect(game.failure).toBeUndefined()
    const recording = game.recording!
    let state = recording.initialState
    for (const turn of recording.turns) {
      const result = executeTurn(deepFreeze(state), deepFreeze(turn.actions))
      expect(result.errors, `turn ${turn.turnNumber}`).toBeUndefined()
      expect(result.events).toEqual(turn.events)
      state = result.gameState
    }
    expect(canonicalJson(state)).toBe(canonicalJson(game.finalState))
  })
})

describe('determinism: canonicalJson', () => {
  it('ignores key order at every depth', () => {
    expect(canonicalJson({ b: { y: 1, x: [{ q: 1, p: 2 }] }, a: 1 })).toBe(
      canonicalJson({ a: 1, b: { x: [{ p: 2, q: 1 }], y: 1 } })
    )
  })
})
