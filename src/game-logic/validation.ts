import type {
  PlayerAction,
  GameState,
  MovementAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  VentHeatAction,
  FireWeaponAction,
  RotateAction,
} from '../types/game'
import { WEAPONS } from '../constants/weapons'
import { BURN_COSTS } from '../constants/rings'

export interface ValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Validates a complete set of actions for a single player
 * Checks both individual action validity and set-level constraints
 */
export function validatePlayerActions(
  gameState: GameState,
  playerId: string,
  actions: PlayerAction[]
): ValidationResult {
  // All actions must belong to this player
  const invalidOwnership = actions.find(a => a.playerId !== playerId)
  if (invalidOwnership) {
    return { valid: false, reason: 'Action belongs to different player' }
  }

  // Validate movement action constraint (exactly one movement action)
  const movementActions = actions.filter(
    a => a.type === 'coast' || a.type === 'burn'
  ) as MovementAction[]

  if (movementActions.length === 0) {
    return { valid: false, reason: 'Must have exactly one movement action (coast or burn)' }
  }

  if (movementActions.length > 1) {
    return { valid: false, reason: 'Cannot have multiple movement actions' }
  }

  // Validate weapon actions (no duplicate weapon types)
  const weaponActions = actions.filter(a => a.type === 'fire_weapon') as FireWeaponAction[]
  const weaponTypes = weaponActions.map(a => a.data.weaponType)
  const uniqueWeaponTypes = new Set(weaponTypes)
  if (weaponTypes.length !== uniqueWeaponTypes.size) {
    return { valid: false, reason: 'Cannot fire the same weapon multiple times' }
  }

  // Validate energy/heat management constraint
  const deallocateActions = actions.filter(
    a => a.type === 'deallocate_energy'
  ) as DeallocateEnergyAction[]
  const ventActions = actions.filter(a => a.type === 'vent_heat') as VentHeatAction[]

  const energyValidation = validateEnergyAndHeat(gameState, playerId, deallocateActions, ventActions)
  if (!energyValidation.valid) {
    return energyValidation
  }

  // Validate each action individually
  for (const action of actions) {
    const result = validateSingleAction(gameState, action, actions)
    if (!result.valid) {
      return result
    }
  }

  return { valid: true }
}

/**
 * Validates that energy deallocation respects heat venting constraints
 * When deallocating energy, it generates heat that must be vented
 * The reactor can only return maxReturnRate energy, reduced by heat venting
 */
function validateEnergyAndHeat(
  gameState: GameState,
  playerId: string,
  deallocateActions: DeallocateEnergyAction[],
  ventActions: VentHeatAction[]
): ValidationResult {
  const player = gameState.players.find(p => p.id === playerId)
  if (!player) {
    return { valid: false, reason: 'Player not found' }
  }

  const totalVenting = ventActions.reduce((sum, a) => sum + a.data.amount, 0)
  const totalDeallocating = deallocateActions.length

  // Total deallocation + venting cannot exceed max return rate
  const maxReturnRate = player.ship.reactor.maxReturnRate
  const totalReturnLoad = totalDeallocating + totalVenting

  if (totalReturnLoad > maxReturnRate) {
    return {
      valid: false,
      reason: `Cannot deallocate ${totalDeallocating} subsystems and vent ${totalVenting} heat (total ${totalReturnLoad} exceeds max return rate: ${maxReturnRate})`,
    }
  }

  return { valid: true }
}

/**
 * Validates a single action in the context of the game state and other actions
 */
function validateSingleAction(
  gameState: GameState,
  action: PlayerAction,
  allActions: PlayerAction[]
): ValidationResult {
  const player = gameState.players.find(p => p.id === action.playerId)
  if (!player) {
    return { valid: false, reason: 'Player not found' }
  }

  switch (action.type) {
    case 'coast':
      return validateCoastAction(player.ship, action, allActions)

    case 'burn':
      return validateBurnAction(player.ship, action, allActions)

    case 'rotate':
      return validateRotateAction(player.ship, action, allActions)

    case 'allocate_energy':
      return validateAllocateEnergy(player.ship, action)

    case 'deallocate_energy':
      return validateDeallocateEnergy(player.ship, action)

    case 'vent_heat':
      return validateVentHeat(player.ship, action)

    case 'fire_weapon':
      return validateFireWeapon(gameState, player.id, action)

    default:
      const _exhaustive: never = action
      return { valid: false, reason: 'Unknown action type' }
  }
}

function validateCoastAction(
  ship: any,
  action: any,
  allActions: PlayerAction[]
): ValidationResult {
  // Fuel scoop validation would go here
  // For now, always allow coasting
  return { valid: true }
}

function validateBurnAction(
  ship: any,
  action: any,
  allActions: PlayerAction[]
): ValidationResult {
  // Calculate energy that will be available after allocations in this turn
  const allocateActions = allActions.filter(a => a.type === 'allocate_energy') as AllocateEnergyAction[]
  const engineAllocations = allocateActions.filter(a => a.data.subsystemType === 'engines')
  const additionalEngineEnergy = engineAllocations.reduce((sum, a) => sum + a.data.amount, 0)

  // Get current engine energy
  const enginesSubsystem = ship.subsystems.find((s: any) => s.type === 'engines')
  const currentEngineEnergy = enginesSubsystem?.allocatedEnergy || 0
  const totalEngineEnergy = currentEngineEnergy + additionalEngineEnergy

  // Check if we'll have enough energy after allocations
  const burnCost = BURN_COSTS[action.data.burnIntensity]
  if (totalEngineEnergy < burnCost.energy) {
    return {
      valid: false,
      reason: `Need ${burnCost.energy} energy in engines for ${action.data.burnIntensity} burn (will have ${totalEngineEnergy})`,
    }
  }

  // Check reaction mass
  if (ship.reactionMass < burnCost.mass) {
    return {
      valid: false,
      reason: `Need ${burnCost.mass} reaction mass, have ${ship.reactionMass}`,
    }
  }

  return { valid: true }
}

function validateRotateAction(
  ship: any,
  action: RotateAction,
  allActions: PlayerAction[]
): ValidationResult {
  // No rotation needed if already facing that direction
  if (ship.facing === action.data.targetFacing) {
    return { valid: false, reason: 'Already facing that direction' }
  }

  // Calculate energy that will be available after allocations in this turn
  const allocateActions = allActions.filter(a => a.type === 'allocate_energy') as AllocateEnergyAction[]

  // Check if rotation subsystem will be powered after allocations
  const rotationSubsystem = ship.subsystems.find((s: any) => s.type === 'rotation')
  if (!rotationSubsystem) {
    return { valid: false, reason: 'Rotation subsystem not found' }
  }

  // Calculate rotation energy after allocations
  const rotationAllocations = allocateActions.filter(a => a.data.subsystemType === 'rotation')
  const additionalRotationEnergy = rotationAllocations.reduce((sum, a) => sum + a.data.amount, 0)
  const totalRotationEnergy = rotationSubsystem.allocatedEnergy + additionalRotationEnergy

  if (totalRotationEnergy === 0) {
    return { valid: false, reason: 'Rotation subsystem not powered' }
  }

  if (rotationSubsystem.usedThisTurn) {
    return { valid: false, reason: 'Rotation subsystem already used this turn' }
  }

  return { valid: true }
}

function validateAllocateEnergy(ship: any, action: AllocateEnergyAction): ValidationResult {
  const { subsystemType, amount } = action.data

  // Find the subsystem
  const subsystem = ship.subsystems.find((s: any) => s.type === subsystemType)
  if (!subsystem) {
    return { valid: false, reason: `Subsystem ${subsystemType} not found` }
  }

  // Check reactor has enough available energy
  if (ship.reactor.availableEnergy < amount) {
    return {
      valid: false,
      reason: `Not enough energy available (need ${amount}, have ${ship.reactor.availableEnergy})`,
    }
  }

  // Check subsystem capacity
  const newTotal = subsystem.allocatedEnergy + amount
  if (newTotal > subsystem.maxEnergy) {
    return {
      valid: false,
      reason: `Would exceed ${subsystemType} capacity (${newTotal}/${subsystem.maxEnergy})`,
    }
  }

  return { valid: true }
}

function validateDeallocateEnergy(ship: any, action: DeallocateEnergyAction): ValidationResult {
  const { subsystemType } = action.data

  // Find the subsystem
  const subsystem = ship.subsystems.find((s: any) => s.type === subsystemType)
  if (!subsystem) {
    return { valid: false, reason: `Subsystem ${subsystemType} not found` }
  }

  // Check subsystem has energy to deallocate
  if (subsystem.allocatedEnergy === 0) {
    return { valid: false, reason: `${subsystemType} has no energy to deallocate` }
  }

  return { valid: true }
}

function validateVentHeat(ship: any, action: VentHeatAction): ValidationResult {
  const { amount } = action.data

  if (amount <= 0) {
    return { valid: false, reason: 'Vent amount must be positive' }
  }

  // Check there's enough heat to vent
  if (ship.heat.currentHeat < amount) {
    return {
      valid: false,
      reason: `Not enough heat to vent (trying to vent ${amount}, have ${ship.heat.currentHeat})`,
    }
  }

  // Heat venting is always available (passive system, no subsystem required)
  return { valid: true }
}

function validateFireWeapon(
  gameState: GameState,
  playerId: string,
  action: FireWeaponAction
): ValidationResult {
  const { weaponType, targetPlayerIds } = action.data
  const player = gameState.players.find(p => p.id === playerId)
  if (!player) {
    return { valid: false, reason: 'Player not found' }
  }

  // Check weapon subsystem is powered
  const weaponSystem = player.ship.subsystems.find((s: any) => s.type === 'weapons')
  if (!weaponSystem?.isPowered) {
    return { valid: false, reason: 'Weapons system not powered' }
  }

  // Get weapon config
  const weaponConfig = WEAPONS[weaponType]
  if (!weaponConfig) {
    return { valid: false, reason: `Unknown weapon type: ${weaponType}` }
  }

  // Check target count
  if (targetPlayerIds.length === 0) {
    return { valid: false, reason: 'Must have at least one target' }
  }

  if (targetPlayerIds.length > weaponConfig.maxTargets) {
    return {
      valid: false,
      reason: `${weaponType} can only target ${weaponConfig.maxTargets} player(s), got ${targetPlayerIds.length}`,
    }
  }

  // Check all targets exist and are not the firing player
  for (const targetId of targetPlayerIds) {
    if (targetId === playerId) {
      return { valid: false, reason: 'Cannot target yourself' }
    }

    const target = gameState.players.find(p => p.id === targetId)
    if (!target) {
      return { valid: false, reason: `Target player ${targetId} not found` }
    }

    // TODO: Add range/position validation when combat system is more defined
  }

  // Check energy cost
  const totalEnergyCost = weaponConfig.energyCost * targetPlayerIds.length
  if (weaponSystem.allocatedEnergy < totalEnergyCost) {
    return {
      valid: false,
      reason: `Not enough energy (need ${totalEnergyCost}, have ${weaponSystem.allocatedEnergy})`,
    }
  }

  return { valid: true }
}
