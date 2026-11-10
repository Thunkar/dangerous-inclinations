/**
 * Worker thread: receives a job, applies the job's process overrides to this
 * thread's configuration, runs one game and posts the summary back.
 */
import { parentPort } from 'node:worker_threads'
import { runGame } from './runGame.ts'
import { summarizeRun, type WorkerJob } from './batch.ts'
import { applyOverrides } from './overrides.ts'

parentPort?.on('message', (job: WorkerJob) => {
  // Every job of a batch carries the same overrides, so applying them again is a no-op.
  applyOverrides(job.overrides)
  parentPort?.postMessage(summarizeRun(runGame(job)))
})
