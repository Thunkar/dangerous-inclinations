// Models
export * from "./models/appearance.ts";
export * from "./models/game.ts";
export * from "./models/subsystems.ts";
export * from "./models/missions.ts";
export * from "./models/events.ts";
export * from "./models/weapons.ts";
export * from "./models/rings.ts";
export * from "./models/gravityWells.ts";

// Game logic
export * from "./game/index.ts";

// Determinism / RNG
export {
  Rng,
  DEFAULT_RNG_SEED,
  rollD10,
  pickIndex,
  nextEntityId,
  freshSeed,
  createDeterminismFields,
  getRng,
  commitRng,
} from "./utils/rng.ts";

// Recording / Replay
export * from "./recording/types.ts";
export { reconstructStateAtTurn, replayRecording } from "./recording/replay.ts";

// Headless bot game. The batch runner and the CLI stay out of this barrel
// (they use worker threads); `runGame` itself is pure and runs in a browser,
// which is what the UI's showcase page builds its canned game with.
export { runGame, setupBotGame, botIds, formatFailure } from "./sim/runGame.ts";
export type {
  GameConfig,
  GameRunResult,
  InvalidTurn,
  TurnStat,
} from "./sim/runGame.ts";

// AI Bot
export * from "./ai/index.ts";
export * from "./agent/index.ts";
export * from "./ai/types.ts";
