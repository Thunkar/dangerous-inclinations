/**
 * Game Logic Library
 *
 * Pure functions for managing game state, ship mechanics, and turn resolution.
 * All functions are immutable - they return new state objects rather than modifying existing ones.
 */

// Energy management
export {
  allocateEnergy,
  deallocateEnergy,
  canAllocateEnergy,
  markSubsystemUsed,
} from './energy'

// Heat management
export {
  calculateHeatDamage,
  resetHeat,
  addHeat,
  generateHeatFromSubsystemUse,
  calculateProjectedHeat,
} from './heat'

// Movement and orbital mechanics
export { applyOrbitalMovement } from './movement'

// Damage and hit resolution
export {
  applyDirectDamage,
  applyHeatDamageToShip,
  getWeaponDamage,
  isShipDestroyed,
  applyDamageWithShields,
  applyCriticalHit,
  rollD10,
  rollToResult,
} from './damage'

// Subsystems
export { resetSubsystemUsage, getSubsystem } from './subsystems'

// Turn management
export { executeTurn, type TurnResult } from './turns'

// Configuration (for testing)
export {
  getGameConfig,
  setGameConfig,
  resetGameConfig,
  enableDeterministicMode,
  disableDeterministicMode,
  type GameConfig,
} from './config'

// Mission system
export * from './missions'

// Lobby system
export * from './lobby'

// Station system
export {
  STATION_CONSTANTS,
  createInitialStations,
  updateStationPositions,
  getStationAtPosition,
  getStationForPlanet,
  isShipAtStation,
  getStationsAtShipPosition,
} from './stations'

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
} from './cargo'

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
} from './respawn'

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
} from './deployment'
