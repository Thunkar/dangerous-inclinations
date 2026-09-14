export {
  runGame,
  setupBotGame,
  botIds,
  formatFailure,
  type GameConfig,
  type GameRunResult,
  type InvalidTurn,
} from "./runGame.ts";
export {
  computePerGameStats,
  aggregateStats,
  distribution,
  type PerGameStats,
  type PerPlayerStats,
  type AggregateStats,
  type Distribution,
} from "./stats.ts";
export { runBatch, type BatchConfig, type BatchResult } from "./batch.ts";
