/**
 * Game Logic Library
 *
 * Pure functions for managing game state, ship mechanics, and turn resolution.
 * All functions are immutable - they return new state objects rather than modifying existing ones.
 */

// Energy management
export {
  allocateEnergyByIndex,
  deallocateEnergyByIndex,
  canAllocateEnergyByIndex,
  markSubsystemUsed,
  getSubsystem,
  resetSubsystemUsage,
} from "./energy.ts";

// Heat management
export {
  calculateHeatDamage,
  resetHeat,
  addHeat,
  generateHeatFromSubsystemUse,
  calculateProjectedHeat,
} from "./heat.ts";

// Movement and orbital mechanics
export { applyOrbitalMovement } from "./movement.ts";

// Damage and hit resolution
export {
  applyDirectDamage,
  applyHeatDamageToShip,
  getWeaponDamage,
  isShipDestroyed,
  applyDamageWithShields,
  applyCriticalHit,
  rollToResult,
} from "./damage.ts";

// Turn management
export { executeTurn, type TurnResult } from "./turns.ts";

// Mission system
export * from "./missions/index.ts";

// Station system
export {
  STATION_CONSTANTS,
  createInitialStations,
  updateStationPositions,
  getStationAtPosition,
  getStationForPlanet,
  isShipAtStation,
  getStationsAtShipPosition,
} from "./stations.ts";

// Cargo system
export {
  getPickupableCargo,
  getDeliverableCargo,
  pickupCargo,
  processCargoAtStation,
  processAllCargoAtStations,
  getCargoStatus,
  getNextStationForCargo,
  getCargoMissionStatus,
  type CargoProcessResult,
} from "./cargo.ts";

// Respawn system
export {
  RESPAWN_CONSTANTS,
  findAvailableRespawnSector,
  createRespawnedShip,
  needsRespawn,
  respawnPlayer,
  processRespawn,
  getRespawnInfo,
  type RespawnInfo,
} from "./respawn.ts";

// Deployment system
export {
  DEPLOYMENT_CONSTANTS,
  getAvailableDeploymentSectors,
  isSectorAvailable,
  deployShip,
  processDeployAction,
  checkAllDeployed,
  getNextDeploymentPlayer,
  transitionToActivePhase,
  getDeploymentStatus,
  type DeploymentResult,
} from "./deployment.ts";
