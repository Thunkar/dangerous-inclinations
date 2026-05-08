// Game Logic (main entry point exports everything)
export * from "./game/index.ts";

// Additional game logic modules not exported by index
export * from "./game/actionProcessors.ts";
export * from "./game/cargo.ts";
export * from "./game/damage.ts";
export * from "./game/deployment.ts";
export * from "./game/energy.ts";
export * from "./game/heat.ts";
export * from "./game/loadout.ts";
export * from "./game/missiles.ts";
export * from "./game/movement.ts";
export * from "./game/respawn.ts";
export * from "./game/stations.ts";

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
export {
  reconstructStateAtTurn,
  replayRecording,
} from "./recording/replay.ts";

// Headless simulation
export * from "./sim/index.ts";

// AI Bot
export * from "./ai/index.ts";
export * from "./ai/types.ts";

// Types
export * from "./models/game.ts";
export * from "./models/subsystems.ts";

// Constants
export * from "./models/gravityWells.ts";
export * from "./models/rings.ts";
export * from "./models/weapons.ts";
// Utils
export * from "./models/transferPoints.ts";
export * from "./utils/weaponRange.ts";
export {
  createInitialShipState,
  getSubsystemSide,
  getSideFiringDirection,
  isRingDirectionValid,
} from "./utils/subsystemHelpers.ts";
export type { ShipSide, RingDirection } from "./utils/subsystemHelpers.ts";
