/**
 * A canned game for the showcase page, built in the browser.
 *
 * `runGame` is the simulator's own entry point — the same setup the server
 * uses (createGame, submitLoadout, deployShip) with bots deciding from
 * `viewFor` — so a showcase board is a real game, not a hand-made fixture.
 * It is seeded, so the same URL always produces the same table: what the 3D
 * renderer is tuned against never moves under it.
 *
 * No I/O: the page needs no server, no recording store and no seat.
 */
import { runGame, type GameRecording } from '@dangerous-inclinations/engine'

export interface ShowcaseOptions {
  seed: number
  /** Cap on player-turns; the recording has one step per turn played. */
  turns: number
  bots: number
}

/**
 * Seed 6 played 40 turns: at step 23 the three ships sit in three different
 * wells, every Home is on the board — the
 * busiest table the first forty turns of a three-bot game offer.
 */
export const SHOWCASE_DEFAULTS = {
  seed: 6,
  turns: 40,
  bots: 3,
  /** Where the transport opens, so the page shows a full board at once. */
  turnIndex: 23,
} as const

export function buildShowcaseRecording({ seed, turns, bots }: ShowcaseOptions): GameRecording {
  const result = runGame({
    seed,
    botCount: bots,
    maxTurns: turns,
    record: true,
    label: `showcase seed ${seed}`,
  })
  if (!result.recording) throw new Error('The showcase game was run without a recording')
  if (result.failure) throw new Error(`The showcase game stopped: ${result.failure.errors[0]}`)
  return result.recording
}
