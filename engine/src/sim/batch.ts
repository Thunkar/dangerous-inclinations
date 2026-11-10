/**
 * Run many games (sequentially or on worker threads) and aggregate stats.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import type { GameRecording } from '../recording/types.ts'
import {
  runGame,
  DEFAULT_BOT_COUNT,
  DEFAULT_MAX_TURNS,
  type GameRunResult,
  type InvalidTurn,
} from './runGame.ts'
import { freshSeed } from '../utils/rng.ts'
import type { RuleOverrides } from './ruleOverrides.ts'
import type { SeatHands, SeatLoadouts } from './loadoutOverrides.ts'
import { applyOverrides, type ProcessOverrides } from './overrides.ts'
import {
  computePerGameStats,
  aggregateStats,
  type PerGameStats,
  type AggregateStats,
} from './stats.ts'

export interface BatchConfig {
  games: number
  botCount?: number
  maxTurns?: number
  /** Each game uses baseSeed + index. Omit for fresh seeds. */
  baseSeed?: number
  /** Worker threads; 1 = run in-process. */
  workers?: number
  /** Keep recordings (memory heavy). Default false in batches. */
  record?: boolean
  label?: string
  tiebreak?: boolean
  rules?: RuleOverrides
  /**
   * The channels that mutate the process: applied here for an in-process
   * batch and by each worker for its jobs. The caller applies them in its own
   * process too when it reads the configuration (a page's stamp).
   */
  overrides?: ProcessOverrides
  seatLoadouts?: SeatLoadouts
  seatHands?: SeatHands
  onProgress?: (done: number, total: number, last: PerGameStats) => void
}

export interface BatchResult {
  perGame: PerGameStats[]
  aggregate: AggregateStats
  recordings: GameRecording[]
  failures: Array<{ seed: number; failure: InvalidTurn }>
}

/** Message shapes for the worker protocol. */
export interface WorkerJob {
  seed: number
  botCount: number
  maxTurns: number
  record: boolean
  label?: string
  tiebreak?: boolean
  rules?: RuleOverrides
  /** Applied by the worker before it plays the job (sim/worker.ts). */
  overrides?: ProcessOverrides
  seatLoadouts?: SeatLoadouts
  seatHands?: SeatHands
}
export interface WorkerReply {
  seed: number
  stats: PerGameStats
  recording?: GameRecording
  failure?: InvalidTurn
}

export function summarizeRun(run: GameRunResult): WorkerReply {
  return {
    seed: run.seed,
    stats: computePerGameStats(run),
    recording: run.recording,
    failure: run.failure,
  }
}

export async function runBatch(config: BatchConfig): Promise<BatchResult> {
  const jobs: WorkerJob[] = Array.from({ length: config.games }, (_, i) => ({
    seed: config.baseSeed !== undefined ? config.baseSeed + i : freshSeed(),
    botCount: config.botCount ?? DEFAULT_BOT_COUNT,
    maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
    record: config.record ?? false,
    label: config.label,
    tiebreak: config.tiebreak,
    rules: config.rules,
    overrides: config.overrides,
    seatLoadouts: config.seatLoadouts,
    seatHands: config.seatHands,
  }))

  const replies =
    (config.workers ?? 1) <= 1
      ? runSequential(jobs, config)
      : await runParallel(jobs, config.workers!, config)

  const perGame = replies.map(r => r.stats)
  return {
    perGame,
    aggregate: aggregateStats(perGame),
    recordings: replies.flatMap(r => (r.recording ? [r.recording] : [])),
    failures: replies.flatMap(r => (r.failure ? [{ seed: r.seed, failure: r.failure }] : [])),
  }
}

function runSequential(jobs: WorkerJob[], config: BatchConfig): WorkerReply[] {
  applyOverrides(config.overrides)
  const out: WorkerReply[] = []
  for (const job of jobs) {
    const reply = summarizeRun(runGame(job))
    out.push(reply)
    config.onProgress?.(out.length, jobs.length, reply.stats)
  }
  return out
}

async function runParallel(
  jobs: WorkerJob[],
  workerCount: number,
  config: BatchConfig
): Promise<WorkerReply[]> {
  const workerPath = fileURLToPath(new URL('./worker.ts', import.meta.url))
  const results: WorkerReply[] = new Array(jobs.length)
  let next = 0
  let done = 0

  await Promise.all(
    Array.from({ length: Math.min(workerCount, jobs.length) }, () => {
      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          execArgv: ['--experimental-transform-types', '--no-warnings'],
        })
        const feed = () => {
          if (next >= jobs.length) {
            worker.terminate().then(() => resolve(), reject)
            return
          }
          const index = next++
          worker.once('message', (reply: WorkerReply) => {
            results[index] = reply
            done++
            config.onProgress?.(done, jobs.length, reply.stats)
            feed()
          })
          worker.postMessage(jobs[index])
        }
        worker.on('error', reject)
        feed()
      })
    })
  )

  return results
}
