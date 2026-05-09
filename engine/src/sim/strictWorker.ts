/**
 * Worker entry for parallel strict-mode game runs.
 *
 * The main thread sends one {@link StrictGameConfig} per message; this
 * worker runs the game and posts back the outcome. Workers are reused
 * across many games via the pool in strictBatch.ts — no per-game spawn
 * cost.
 */

import { parentPort } from "node:worker_threads";
import {
  runStrictGame,
  type StrictGameConfig,
  type StrictGameOutcome,
} from "./strictGame.ts";

if (!parentPort) {
  throw new Error("strictWorker.ts must be loaded as a Worker");
}

parentPort.on("message", (msg: StrictGameConfig | { type: "shutdown" }) => {
  if ("type" in msg && msg.type === "shutdown") {
    parentPort!.close();
    return;
  }
  const outcome: StrictGameOutcome = runStrictGame(msg as StrictGameConfig);
  parentPort!.postMessage(outcome);
});
