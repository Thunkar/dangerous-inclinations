/**
 * Worker thread: receives a job, runs one game, posts the summary back.
 */
import { parentPort } from "node:worker_threads";
import { runGame } from "./runGame.ts";
import { summarizeRun, type WorkerJob } from "./batch.ts";

parentPort?.on("message", (job: WorkerJob) => {
  parentPort?.postMessage(summarizeRun(runGame(job)));
});
