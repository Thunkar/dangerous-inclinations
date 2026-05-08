/**
 * Deterministic seeded PRNG for replayable game state.
 *
 * Uses mulberry32: small, fast, no external deps, well-distributed.
 * The state is a single 32-bit integer that we keep on GameState so it
 * round-trips through JSON cleanly.
 *
 * The `Rng` class is a thin handle; the canonical state lives on GameState.
 * Prefer the helper functions (rollD10, pickIndex, shuffle) which take a
 * GameState and mutate its rngState in place — matching the snapshot-mutate
 * style the engine already uses.
 */

import type { GameState } from "../models/game.ts";

/**
 * Default seed used when no explicit seed is provided. Arbitrary constant.
 */
export const DEFAULT_RNG_SEED = 0xcafebabe | 0;

export class Rng {
  state: number;
  /**
   * Test-only override: when set, rollD10 returns this value instead of
   * consuming the PRNG. Has no effect on non-D10 helpers (shuffle/pickIndex).
   * Lives on the instance, not in a global, so it's per-game and replay-safe.
   */
  forcedRollValue?: number;

  constructor(seed: number = DEFAULT_RNG_SEED, forcedRollValue?: number) {
    this.state = seed | 0;
    this.forcedRollValue = forcedRollValue;
  }

  /** Step the PRNG and return a float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  rollInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** d10 roll, returns 1..10. Honors forcedRollValue when set. */
  rollD10(): number {
    if (this.forcedRollValue !== undefined) return this.forcedRollValue;
    return this.rollInt(10) + 1;
  }

  /** Random index into a non-empty array. */
  pickIndex<T>(arr: readonly T[]): number {
    return this.rollInt(arr.length);
  }

  /** Pick one element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.pickIndex(arr)];
  }

  /** Returns a new array, Fisher-Yates shuffled. */
  shuffle<T>(arr: readonly T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.rollInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  clone(): Rng {
    return new Rng(this.state, this.forcedRollValue);
  }
}

/**
 * Read GameState's PRNG into an Rng handle.
 * Engine code that consumes randomness should prefer the helpers below.
 */
export function getRng(state: GameState): Rng {
  return new Rng(state.rngState, state.forcedRollValue);
}

/**
 * Write the PRNG state back to GameState.
 */
export function commitRng(state: GameState, rng: Rng): void {
  state.rngState = rng.state;
}

/**
 * Roll a d10 against GameState's RNG, advancing it.
 * Mutates state.rngState in place.
 */
export function rollD10(state: GameState): number {
  if (state.forcedRollValue !== undefined) return state.forcedRollValue;
  const rng = getRng(state);
  const v = rng.rollD10();
  commitRng(state, rng);
  return v;
}

/**
 * Pick a random index against GameState's RNG, advancing it.
 */
export function pickIndex<T>(state: GameState, arr: readonly T[]): number {
  const rng = getRng(state);
  const i = rng.pickIndex(arr);
  commitRng(state, rng);
  return i;
}

/**
 * Allocate the next monotonic entity ID and bump GameState's counter.
 * Use for missile/cargo/scan IDs — anything that needs to be deterministic
 * and unique across a single game.
 */
export function nextEntityId(state: GameState, prefix: string): string {
  const id = state.nextEntityId;
  state.nextEntityId = id + 1;
  return `${prefix}-${id}`;
}

/**
 * Generate a fresh seed when one isn't supplied. Uses Math.random; this is the
 * only place we touch unseeded randomness, and only when the caller hasn't
 * pinned a seed (e.g. live games). The chosen seed is then captured on
 * GameState so the run is reproducible from there.
 */
export function freshSeed(): number {
  return (Math.random() * 0x100000000) | 0;
}

/**
 * Determinism fields to spread onto a fresh GameState.
 * If `seed` is omitted, a random seed is generated and captured on the state.
 */
export function createDeterminismFields(seed?: number): {
  rngSeed: number;
  rngState: number;
  nextEntityId: number;
} {
  const finalSeed = seed ?? freshSeed();
  return {
    rngSeed: finalSeed,
    rngState: finalSeed,
    nextEntityId: 0,
  };
}
