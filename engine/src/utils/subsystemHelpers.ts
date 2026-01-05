import type {
  Subsystem,
  SubsystemType,
  ReactorState,
  HeatState,
} from "../models/subsystems";
import type { ShipState, ShipLoadout } from "../models/game";
import { getMissileStats } from "../models/subsystems";
import { DEFAULT_LOADOUT } from "../models/game";
import {
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
} from "../game/loadout";

// Constants for ship initialization
export const DEFAULT_HIT_POINTS = 10;

/**
 * Initialize a ship's subsystems with default state
 * Missiles subsystem gets ammo initialized from config
 *
 * @deprecated Use createSubsystemsFromLoadout instead for loadout-based ships
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
 * Loadout determines which subsystems are installed and affects ship stats.
 * All other fields use sensible defaults that can be overridden.
 */
export function createInitialShipState(
  position: {
    wellId: string;
    ring: number;
    sector: number;
    facing: "prograde" | "retrograde";
  },
  loadout: ShipLoadout = DEFAULT_LOADOUT,
  overrides: Partial<ShipState> = {}
): ShipState {
  // Calculate ship stats from loadout (dissipation, reaction mass, crit chance)
  const stats = calculateShipStatsFromLoadout(loadout);

  return {
    wellId: position.wellId,
    ring: position.ring,
    sector: position.sector,
    facing: position.facing,
    reactionMass: stats.reactionMass,
    hitPoints: DEFAULT_HIT_POINTS,
    maxHitPoints: DEFAULT_HIT_POINTS,
    transferState: null,
    subsystems: createSubsystemsFromLoadout(loadout),
    reactor: createInitialReactorState(),
    heat: createInitialHeatState(),
    dissipationCapacity: stats.dissipationCapacity,
    loadout,
    criticalChance: stats.criticalChance,
    ...overrides,
  };
}
