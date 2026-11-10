/**
 * Deterministic seeded PRNG for replayable game state.
 *
 * Uses mulberry32: small, fast, no external deps, well-distributed.
 * The state is a single 32-bit integer that we keep on GameState so it
 * round-trips through JSON cleanly.
 *
 * The `Rng` class is a thin, mutable handle; the canonical state lives on
 * GameState. The helpers (rollD10, pickIndex, nextEntityId, withRng) never
 * touch the state they are given: each returns its value and a new state with
 * the RNG (or the ID counter) advanced, which the caller carries on with. The
 * deal shuffles with an `Rng` directly.
 */

import { D10_FACES, type GameState } from '../models/game.ts'

export class Rng {
  state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  /** Step the PRNG and return a float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [0, max). */
  rollInt(max: number): number {
    return Math.floor(this.next() * max)
  }

  /** d10 roll, returns 1..D10_FACES. */
  rollD10(): number {
    return this.rollInt(D10_FACES) + 1
  }

  /** Random index into a non-empty array. */
  pickIndex<T>(arr: readonly T[]): number {
    return this.rollInt(arr.length)
  }

  /** Returns a new array, Fisher-Yates shuffled. */
  shuffle<T>(arr: readonly T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.rollInt(i + 1)
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
}

/**
 * Run `draw` with an RNG handle read off the state, and fold what it drew back:
 * the result and a new state whose `rngState` has advanced. The state passed in
 * is never touched. For a caller that hands a seeded pick to code that may draw
 * any number of times (a bot choosing a hand or a sector).
 */
export function withRng<T>(state: GameState, draw: (rng: Rng) => T): [T, GameState] {
  const rng = new Rng(state.rngState)
  const value = draw(rng)
  // Nothing drawn, nothing to fold back (the handle keeps the seed as a 32-bit int).
  if (rng.state === (state.rngState | 0)) return [value, state]
  return [value, { ...state, rngState: rng.state }]
}

/** Roll a d10 against the state's RNG: the roll and the state with the RNG advanced. */
export function rollD10(state: GameState): [number, GameState] {
  return withRng(state, rng => rng.rollD10())
}

/** A random index into `arr` against the state's RNG, and the state with the RNG advanced. */
export function pickIndex<T>(state: GameState, arr: readonly T[]): [number, GameState] {
  return withRng(state, rng => rng.pickIndex(arr))
}

/**
 * The next monotonic entity ID, and the state with its counter bumped.
 * Use for missile/wreck IDs: anything that needs to be deterministic
 * and unique across a single game.
 */
export function nextEntityId(state: GameState, prefix: string): [string, GameState] {
  const id = state.nextEntityId
  return [`${prefix}-${id}`, { ...state, nextEntityId: id + 1 }]
}

/**
 * Generate a fresh seed when one isn't supplied. Uses Math.random; this is the
 * only place we touch unseeded randomness, and only when the caller hasn't
 * pinned a seed (e.g. live games). The chosen seed is then captured on
 * GameState so the run is reproducible from there.
 */
export function freshSeed(): number {
  return (Math.random() * 0x100000000) | 0
}

/**
 * Determinism fields to spread onto a fresh GameState.
 * If `seed` is omitted, a random seed is generated and captured on the state.
 */
export function createDeterminismFields(seed?: number): {
  rngSeed: number
  rngState: number
  nextEntityId: number
} {
  const finalSeed = seed ?? freshSeed()
  return {
    rngSeed: finalSeed,
    rngState: finalSeed,
    nextEntityId: 0,
  }
}
