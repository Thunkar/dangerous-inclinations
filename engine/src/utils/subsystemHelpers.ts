import type {
  Subsystem,
  SubsystemType,
  ReactorState,
  HeatState,
} from "../models/subsystems";
import type { ShipState } from "../models/game";
import { getMissileStats } from "../models/subsystems";
import {
  STARTING_REACTION_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
} from "../models/game";

// Constants for ship initialization
export const DEFAULT_HIT_POINTS = 10;

/**
 * Initialize a ship's subsystems with default state
 * Missiles subsystem gets ammo initialized from config
 */
export function createInitialSubsystems(): Subsystem[] {
  const subsystemTypes: SubsystemType[] = [
    "engines",
    "rotation",
    "scoop",
    "laser",
    "railgun",
    "missiles",
    "shields",
  ];

  const missileStats = getMissileStats();

  return subsystemTypes.map((type) => {
    const base: Subsystem = {
      type,
      allocatedEnergy: 0,
      isPowered: false,
      usedThisTurn: false,
    };

    // Initialize ammo for missiles subsystem
    if (type === "missiles") {
      base.ammo = missileStats.maxAmmo;
    }

    return base;
  });
}

/**
 * Initialize reactor state
 */
export function createInitialReactorState(): ReactorState {
  return {
    totalCapacity: 10,
    availableEnergy: 10, // Start with full reactor
  };
}

/**
 * Initialize heat state
 */
export function createInitialHeatState(): HeatState {
  return {
    currentHeat: 0,
  };
}

/**
 * Create an initial ship state with all default values.
 * Position fields (wellId, ring, sector, facing) must be provided.
 * All other fields use sensible defaults that can be overridden.
 */
export function createInitialShipState(
  position: {
    wellId: string;
    ring: number;
    sector: number;
    facing: "prograde" | "retrograde";
  },
  overrides: Partial<ShipState> = {}
): ShipState {
  return {
    wellId: position.wellId,
    ring: position.ring,
    sector: position.sector,
    facing: position.facing,
    reactionMass: STARTING_REACTION_MASS,
    hitPoints: DEFAULT_HIT_POINTS,
    maxHitPoints: DEFAULT_HIT_POINTS,
    transferState: null,
    subsystems: createInitialSubsystems(),
    reactor: createInitialReactorState(),
    heat: createInitialHeatState(),
    dissipationCapacity: DEFAULT_DISSIPATION_CAPACITY,
    ...overrides,
  };
}
