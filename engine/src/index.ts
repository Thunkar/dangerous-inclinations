// Models
export * from "./models/appearance.ts";
export * from "./models/game.ts";
export * from "./models/subsystems.ts";
export * from "./models/missions.ts";
export * from "./models/events.ts";
export * from "./models/weapons.ts";
export * from "./models/rings.ts";
export * from "./models/gravityWells.ts";

// The words printed on the mission cards
export * from "./text/missionCards.ts";

// Game logic
export * from "./game/index.ts";

// Determinism / RNG
export {
  Rng,
  rollD10,
  pickIndex,
  nextEntityId,
  freshSeed,
  createDeterminismFields,
} from "./utils/rng.ts";

// Recording / Replay
export * from "./recording/types.ts";
export { reconstructStateAtTurn } from "./recording/replay.ts";

// Headless bot game. The batch runner and the CLI stay out of this barrel
// (they use worker threads); `runGame` itself is pure and runs in a browser,
// so a page can build a canned game with it.
export { runGame, setupBotGame, formatFailure } from "./sim/runGame.ts";
export type { GameConfig, GameRunResult, InvalidTurn } from "./sim/runGame.ts";

// AI Bot
// The bots' entry points and the few types callers name (`ai/index.ts`); the
// rest of the bots' types stay internal.
export * from "./ai/index.ts";
export * from "./agent/index.ts";
