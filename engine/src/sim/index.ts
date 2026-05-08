export {
  runSimulation,
  type SimConfig,
  type SimResult,
} from "./runSimulation.ts";

export {
  computePerGameStats,
  aggregateStats,
  type PerGameStats,
  type PerPlayerStats,
  type AggregateStats,
  type Distribution,
} from "./stats.ts";

export {
  runBatch,
  type BatchConfig,
  type BatchResult,
} from "./batch.ts";
