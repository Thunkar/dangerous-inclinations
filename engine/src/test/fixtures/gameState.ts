import {
  STARTING_REACTION_MASS,
  type GameState,
  type Player,
} from "../../models/game.ts";
import {
  createInitialShipState,
  DEFAULT_HIT_POINTS,
} from "../../utils/subsystemHelpers.ts";
import { createDeterminismFields } from "../../utils/rng.ts";

// Initial state constants for easy reference in tests
export const INITIAL_RING = 3;
export const INITIAL_SECTOR = 0;
export const INITIAL_FACING = "prograde" as const;
export const INITIAL_REACTION_MASS = STARTING_REACTION_MASS;
export const INITIAL_HIT_POINTS = DEFAULT_HIT_POINTS;
export const INITIAL_MAX_HIT_POINTS = DEFAULT_HIT_POINTS;
export const INITIAL_REACTOR_ENERGY = 10;
export const INITIAL_HEAT = 0;

export const PLAYER2_RING = 3;
export const PLAYER2_SECTOR = 12;

/**
 * Creates a standard test game state with two players
 * All players start with full resources and no active transfers
 */
export function createTestGameState(): GameState {
  const player1: Player = {
    id: "player1",
    name: "Alpha",
    ship: createInitialShipState({
      wellId: "blackhole",
      ring: INITIAL_RING,
      sector: INITIAL_SECTOR,
      facing: INITIAL_FACING,
    }),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  };

  const player2: Player = {
    id: "player2",
    name: "Beta",
    ship: createInitialShipState({
      wellId: "blackhole",
      ring: PLAYER2_RING,
      sector: PLAYER2_SECTOR,
      facing: INITIAL_FACING,
    }),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  };

  // Default test state pins d10 rolls to 5 (normal hit) so non-RNG-aware tests
  // remain stable. Tests that need a different forced value can set it on the
  // returned state, or override per call (via the explicit `roll` arg).
  return {
    turn: 1,
    activePlayerIndex: 0,
    players: [player1, player2],
    turnLog: [],
    missiles: [], // No missiles in flight initially
    phase: "active",
    stations: [],
    ...testDeterminismDefaults(),
  };
}

/**
 * Determinism defaults for inline test GameStates: stable seed + forced d10=5.
 * Spread this into any test-constructed GameState to satisfy the type and keep
 * legacy tests deterministic.
 */
export function testDeterminismDefaults(seed: number = 0xdeadbeef): {
  rngSeed: number;
  rngState: number;
  nextEntityId: number;
  forcedRollValue: number;
} {
  return { ...createDeterminismFields(seed), forcedRollValue: 5 };
}
