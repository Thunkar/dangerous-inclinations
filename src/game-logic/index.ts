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
  processEnergyReturn,
  canAllocateEnergy,
  markSubsystemUsed,
} from './energy'

// Heat management
export {
  calculateHeatGeneration,
  applyHeatGeneration,
  setHeatVenting,
  processHeatVenting,
  calculateHeatDamage,
  canVentHeat,
} from './heat'

// Movement and orbital mechanics
export { completeTransfer } from './movement'

// Actions
export {
  applyAction,
  applyRotation,
  applyBurn,
  applyScoopFuel,
  applyOrbitalMovement,
  applyTransferCompletion,
  applyWeaponFiring,
  deriveActionContext,
  type ActionResult,
  type ActionContext,
} from './actions'

// Damage
export {
  applyWeaponDamage,
  applyHeatDamageToShip,
  getWeaponDamage,
  isShipDestroyed,
} from './damage'

// Subsystems
export { resetSubsystemUsage, getSubsystem } from './subsystems'

// Turn management
export {
  executeTurn,
  type TurnResult,
} from './turns'
