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
