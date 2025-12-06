import type {
  GameState,
  PlayerAction,
  TurnLogEntry,
  CoastAction,
  BurnAction,
  RotateAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  FireWeaponAction,
  WellTransferAction,
  ShipState,
} from '../types/game'
import { applyOrbitalMovement, initiateBurn, applyRotation, completeRingTransfer } from './movement'
import { applyDamageWithShields, getWeaponDamage } from './damage'
import { WEAPONS } from '../constants/weapons'
import { BURN_COSTS, WELL_TRANSFER_COSTS, getAdjustmentRange, calculateBurnMassCost, MAX_REACTION_MASS } from '../constants/rings'
import { getSubsystemConfig } from '../types/subsystems'
import { resetSubsystemUsage } from './subsystems'
import { fireMissile, getMissileAmmo } from './missiles'
import { getGravityWell, TRANSFER_POINTS } from '../constants/gravityWells'
import type { RingConfig } from '../types/game'
import { addHeat } from './heat'

export interface ProcessResult {
  success: boolean
  gameState: GameState
  logEntries: TurnLogEntry[]
  errors?: string[]
}

/**
 * Validation functions - these check if actions are valid without modifying state
 */

/**
 * Validate action sequence ordering for tactical actions
 */
function validateActionSequence(actions: PlayerAction[]): string[] {
  const errors: string[] = []

  // Filter tactical actions that should have sequences
  const tacticalActions = actions.filter(a =>
    a.type === 'rotate' || a.type === 'coast' || a.type === 'burn' || a.type === 'fire_weapon' || a.type === 'well_transfer'
  )

  if (tacticalActions.length === 0) {
    return [] // No tactical actions, no sequence validation needed
  }

  // Check all tactical actions have sequence numbers
  const missingSequence = tacticalActions.filter(a => a.sequence === undefined)
  if (missingSequence.length > 0) {
    errors.push(`Tactical actions must have sequence numbers (found ${missingSequence.length} without)`)
    return errors
  }

  // Get all sequences and sort them
  const sequences = tacticalActions.map(a => a.sequence!).sort((a, b) => a - b)

  // Check for duplicates
  const uniqueSequences = new Set(sequences)
  if (uniqueSequences.size !== sequences.length) {
    errors.push('Action sequences must be unique (no duplicates)')
  }

  // Check sequences are continuous starting from 1
  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i] !== i + 1) {
      errors.push(`Action sequences must be continuous starting from 1 (expected ${i + 1}, found ${sequences[i]})`)
      break
    }
  }

  // Well transfer specific rules
  const wellTransferAction = tacticalActions.find(a => a.type === 'well_transfer')
  const burnAction = tacticalActions.find(a => a.type === 'burn')
  const coastAction = tacticalActions.find(a => a.type === 'coast')
  const moveAction = burnAction || coastAction

  if (wellTransferAction && burnAction) {
    errors.push('Cannot burn while initiating a well transfer (burning is disallowed during well transfers)')
  }

  if (wellTransferAction && moveAction) {
    // Well transfer must happen before the move action
    if (wellTransferAction.sequence! > moveAction.sequence!) {
      errors.push('Well transfer must happen before movement (coast) action')
    }
  }

  return errors
}

/**
 * Helper to validate and process an array of actions
 */
function validateAndProcessActions<T extends PlayerAction>(
  gameState: GameState,
  actions: T[],
  validate: (state: GameState, action: T) => string[],
  process: (state: GameState, action: T) => ProcessResult
): ProcessResult {
  let currentGameState = gameState
  const logEntries: TurnLogEntry[] = []

  for (const action of actions) {
    const validationErrors = validate(currentGameState, action)
    if (validationErrors.length > 0) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: validationErrors,
      }
    }
    const result = process(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

  return {
    success: true,
    gameState: currentGameState,
    logEntries,
  }
}

function validateAllocateEnergyAction(gameState: GameState, action: AllocateEnergyAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  const subsystem = player.ship.subsystems.find(s => s.type === action.data.subsystemType)
  if (!subsystem) {
    errors.push(`Subsystem ${action.data.subsystemType} not found`)
    return errors
  }

  // Check reactor has enough available energy
  if (player.ship.reactor.availableEnergy < action.data.amount) {
    errors.push(`Not enough energy available (need ${action.data.amount}, have ${player.ship.reactor.availableEnergy})`)
  }

  // Check absolute maximum
  const config = getSubsystemConfig(action.data.subsystemType)
  const newTotal = subsystem.allocatedEnergy + action.data.amount
  if (newTotal > config.maxEnergy) {
    errors.push(`Would exceed ${action.data.subsystemType} absolute maximum capacity (${newTotal}/${config.maxEnergy})`)
  }

  return errors
}

function validateDeallocateEnergyAction(gameState: GameState, action: DeallocateEnergyAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  const subsystem = player.ship.subsystems.find(s => s.type === action.data.subsystemType)
  if (!subsystem) {
    errors.push(`Subsystem ${action.data.subsystemType} not found`)
    return errors
  }

  // Check subsystem has energy to deallocate
  if (subsystem.allocatedEnergy === 0) {
    errors.push(`${action.data.subsystemType} has no energy to deallocate`)
  }

  // Check we're not trying to deallocate more than available
  if (action.data.amount > subsystem.allocatedEnergy) {
    errors.push(`Cannot deallocate ${action.data.amount} from ${action.data.subsystemType} (only ${subsystem.allocatedEnergy} allocated)`)
  }

  return errors
}


function validateRotateAction(gameState: GameState, action: RotateAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  // No rotation needed if already facing that direction
  if (player.ship.facing === action.data.targetFacing) {
    errors.push('Already facing that direction')
    return errors
  }

  // Check if rotation subsystem is powered
  const rotationSubsystem = player.ship.subsystems.find(s => s.type === 'rotation')
  if (!rotationSubsystem) {
    errors.push('Rotation subsystem not found')
    return errors
  }

  if (rotationSubsystem.allocatedEnergy === 0) {
    errors.push('Rotation subsystem not powered')
  }

  if (rotationSubsystem.usedThisTurn) {
    errors.push('Rotation subsystem already used this turn')
  }

  return errors
}

function validateCoastAction(gameState: GameState, action: CoastAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  // Check scoop energy if scoop is activated
  if (action.data.activateScoop) {
    const scoopSubsystem = player.ship.subsystems.find(s => s.type === 'scoop')
    const currentScoopEnergy = scoopSubsystem?.allocatedEnergy || 0
    const scoopConfig = getSubsystemConfig('scoop')

    if (currentScoopEnergy < scoopConfig.minEnergy) {
      errors.push(`Need ${scoopConfig.minEnergy} energy in scoop to activate (have ${currentScoopEnergy})`)
    }
  }

  return errors
}

function validateBurnAction(gameState: GameState, action: BurnAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  const burnCost = BURN_COSTS[action.data.burnIntensity]
  const sectorAdjustment = action.data.sectorAdjustment || 0

  // Check engine energy
  const enginesSubsystem = player.ship.subsystems.find(s => s.type === 'engines')
  const currentEngineEnergy = enginesSubsystem?.allocatedEnergy || 0

  if (currentEngineEnergy < burnCost.energy) {
    errors.push(`Need ${burnCost.energy} energy in engines for ${action.data.burnIntensity} burn (have ${currentEngineEnergy})`)
  }

  // Get current ring velocity to determine allowed adjustment range
  const well = getGravityWell(player.ship.wellId)
  const ringConfig = well?.rings.find(r => r.ring === player.ship.ring)
  const velocity = ringConfig?.velocity || 1

  // Validate sector adjustment range
  const { min, max } = getAdjustmentRange(velocity)
  if (sectorAdjustment < min || sectorAdjustment > max) {
    errors.push(`Sector adjustment ${sectorAdjustment} out of range (${min} to ${max} for velocity ${velocity})`)
  }

  // Check total reaction mass including adjustment cost
  const totalMassCost = calculateBurnMassCost(burnCost.mass, sectorAdjustment)
  if (player.ship.reactionMass < totalMassCost) {
    errors.push(`Need ${totalMassCost} reaction mass (${burnCost.mass} base + ${Math.abs(sectorAdjustment)} adjustment), have ${player.ship.reactionMass}`)
  }

  return errors
}

function validateFireWeaponAction(gameState: GameState, action: FireWeaponAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  // Check weapon subsystem exists and is powered
  const weaponSubsystem = player.ship.subsystems.find(s => s.type === action.data.weaponType)
  if (!weaponSubsystem) {
    errors.push(`${action.data.weaponType} not found`)
    return errors
  }

  if (!weaponSubsystem.isPowered) {
    errors.push(`${action.data.weaponType} not powered`)
  }

  if (weaponSubsystem.usedThisTurn) {
    errors.push(`${action.data.weaponType} already used this turn`)
  }

  // Get weapon config
  const weaponConfig = WEAPONS[action.data.weaponType]
  if (!weaponConfig) {
    errors.push(`Unknown weapon type: ${action.data.weaponType}`)
    return errors
  }

  // Check target count
  if (action.data.targetPlayerIds.length === 0) {
    errors.push('Must have at least one target')
  }

  if (action.data.targetPlayerIds.length > 1) {
    errors.push(`${action.data.weaponType} can only target 1 player at a time, got ${action.data.targetPlayerIds.length}`)
  }

  // Check energy cost
  const totalEnergyCost = weaponConfig.energyCost
  if (weaponSubsystem.allocatedEnergy < totalEnergyCost) {
    errors.push(`Not enough energy (need ${totalEnergyCost}, have ${weaponSubsystem.allocatedEnergy})`)
  }

  // Check missile inventory (stored on missiles subsystem)
  if (action.data.weaponType === 'missiles') {
    if (getMissileAmmo(player.ship.subsystems) <= 0) {
      errors.push('No missiles remaining')
    }
  }

  return errors
}

function validateWellTransferAction(gameState: GameState, action: WellTransferAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  // Ship must be on outermost ring of current well
  const currentWell = getGravityWell(player.ship.wellId)
  if (!currentWell) {
    errors.push('Current gravity well not found')
    return errors
  }

  const outermostRing = currentWell.rings[currentWell.rings.length - 1]
  if (player.ship.ring !== outermostRing.ring) {
    errors.push(`Well transfers can only be initiated from Ring ${outermostRing.ring} (outermost ring of ${currentWell.name || currentWell.id})`)
    return errors
  }

  // Ship cannot already be in transfer
  if (player.ship.transferState) {
    errors.push('Cannot initiate well transfer while already in transfer')
    return errors
  }

  // Check if a transfer point exists from current position to destination
  const transferPoint = TRANSFER_POINTS.find(tp =>
    tp.fromWellId === player.ship.wellId &&
    tp.fromSector === player.ship.sector &&
    tp.toWellId === action.data.destinationWellId
  )

  if (!transferPoint) {
    errors.push('No transfer point available from current position to destination well')
    return errors
  }

  // Check engine level requirement (NEW for elliptic transfers)
  if (transferPoint.requiredEngineLevel) {
    const enginesSubsystem = player.ship.subsystems.find(s => s.type === 'engines')
    if (!enginesSubsystem || enginesSubsystem.allocatedEnergy < transferPoint.requiredEngineLevel) {
      errors.push(`Well transfer requires engines at level ${transferPoint.requiredEngineLevel} (current: ${enginesSubsystem?.allocatedEnergy || 0})`)
      return errors
    }
  }

  // Ship must be facing prograde for well transfers
  if (player.ship.facing !== 'prograde') {
    errors.push('Ship must be facing prograde to initiate well transfer')
    return errors
  }

  // Check reaction mass
  if (player.ship.reactionMass < WELL_TRANSFER_COSTS.mass) {
    errors.push(`Not enough reaction mass for well transfer (need ${WELL_TRANSFER_COSTS.mass}, have ${player.ship.reactionMass})`)
    return errors
  }

  return errors
}

/**
 * Process all actions for the active player in the correct order
 *
 * NEW Turn sequence:
 * Phase 0 (Start of Turn - Automatic):
 *   0a. Calculate heat damage (excess heat above dissipation capacity)
 *   0b. Apply heat dissipation (remove heat up to dissipation capacity)
 *
 * Phase 1 (Fixed order - Energy Management):
 *   1. Energy Allocation (unlimited)
 *   2. Energy Deallocation (unlimited)
 *
 * Phase 2 (User-specified order - Tactical Actions):
 *   - Rotation (generates heat when executed)
 *   - Movement: coast or burn (burn generates heat when executed)
 *   - Weapon Firing (generates heat when fired, includes shield absorption and crits)
 *   (Order determined by sequence field on each action)
 *
 * Phase 3 (Fixed order - End of Turn):
 *   - Reset Subsystem Usage (prepare for next turn)
 *
 * Note: Heat is now generated when subsystems are USED, not from overclocking.
 */
export function processActions(gameState: GameState, actions: PlayerAction[]): ProcessResult {
  const logEntries: TurnLogEntry[] = []
  let currentGameState = gameState
  const activePlayerIndex = gameState.activePlayerIndex

  // Validate action sequence ordering
  const sequenceErrors = validateActionSequence(actions)
  if (sequenceErrors.length > 0) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: sequenceErrors,
    }
  }

  // NOTE: Heat damage and reset are now handled in turns.ts when switching to next player
  // This ensures the player sees the damage BEFORE their turn starts

  // PHASE 1: Energy Management (fixed order, now unlimited)
  // IMPORTANT: Deallocations must be processed BEFORE allocations
  // so that freed energy is available for new allocations

  // Phase 1.1: Energy Deallocation (must come first to free up energy)
  const deallocateActions = actions.filter(a => a.type === 'deallocate_energy') as DeallocateEnergyAction[]
  const deallocateResult = validateAndProcessActions(currentGameState, deallocateActions, validateDeallocateEnergyAction, processDeallocateEnergy)
  if (!deallocateResult.success) return deallocateResult
  currentGameState = deallocateResult.gameState
  logEntries.push(...deallocateResult.logEntries)

  // Phase 1.2: Energy Allocation (uses energy freed by deallocations)
  const allocateActions = actions.filter(a => a.type === 'allocate_energy') as AllocateEnergyAction[]
  const allocateResult = validateAndProcessActions(currentGameState, allocateActions, validateAllocateEnergyAction, processAllocateEnergy)
  if (!allocateResult.success) return allocateResult
  currentGameState = allocateResult.gameState
  logEntries.push(...allocateResult.logEntries)

  // PHASE 2: Tactical Actions (user-specified order via sequence field)

  const tacticalActions = actions
    .filter(a => a.type === 'rotate' || a.type === 'coast' || a.type === 'burn' || a.type === 'fire_weapon' || a.type === 'well_transfer')
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))

  // Track whether movement has happened (for missile orbital skip logic)
  let movementHappened = false

  for (const action of tacticalActions) {
    if (action.type === 'rotate') {
      const rotateResult = validateAndProcessActions(currentGameState, [action as RotateAction], validateRotateAction, processRotation)
      if (!rotateResult.success) return rotateResult
      currentGameState = rotateResult.gameState
      logEntries.push(...rotateResult.logEntries)
    } else if (action.type === 'coast') {
      const coastResult = validateAndProcessActions(currentGameState, [action as CoastAction], validateCoastAction, processCoast)
      if (!coastResult.success) return coastResult
      currentGameState = coastResult.gameState
      logEntries.push(...coastResult.logEntries)
      movementHappened = true
    } else if (action.type === 'burn') {
      const burnResult = validateAndProcessActions(currentGameState, [action as BurnAction], validateBurnAction, processBurn)
      if (!burnResult.success) return burnResult
      currentGameState = burnResult.gameState
      logEntries.push(...burnResult.logEntries)
      movementHappened = true
    } else if (action.type === 'fire_weapon') {
      const weaponResult = validateAndProcessActions(currentGameState, [action as FireWeaponAction], validateFireWeaponAction, processFireWeapon)
      if (!weaponResult.success) return weaponResult
      currentGameState = weaponResult.gameState
      logEntries.push(...weaponResult.logEntries)

      // If movement already happened, mark any new missiles to skip orbital this turn
      if (movementHappened) {
        const fireAction = action as FireWeaponAction
        if (fireAction.data.weaponType === 'missiles') {
          // Find newly added missiles (those without skipOrbitalThisTurn set yet)
          currentGameState = {
            ...currentGameState,
            missiles: currentGameState.missiles.map(m =>
              m.turnFired === currentGameState.turn && m.skipOrbitalThisTurn === undefined
                ? { ...m, skipOrbitalThisTurn: true }
                : m
            ),
          }
        }
      }
    } else if (action.type === 'well_transfer') {
      const wellTransferResult = validateAndProcessActions(currentGameState, [action as WellTransferAction], validateWellTransferAction, processWellTransfer)
      if (!wellTransferResult.success) return wellTransferResult
      currentGameState = wellTransferResult.gameState
      logEntries.push(...wellTransferResult.logEntries)
      movementHappened = true
    }
  }

  // PHASE 3: End of Turn (fixed order)

  // Reset subsystem usage flags for next turn
  const updatedPlayers = [...currentGameState.players]
  const currentPlayer = updatedPlayers[activePlayerIndex]
  updatedPlayers[activePlayerIndex] = {
    ...currentPlayer,
    ship: {
      ...currentPlayer.ship,
      subsystems: resetSubsystemUsage(currentPlayer.ship.subsystems),
    },
  }
  currentGameState = {
    ...currentGameState,
    players: updatedPlayers,
  }

  return {
    success: true,
    gameState: currentGameState,
    logEntries,
  }
}

/**
 * Process a coast action (orbital movement only)
 */
function processCoast(gameState: GameState, action: CoastAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  // Apply orbital movement
  let updatedShip = applyOrbitalMovement(player.ship)

  // Apply fuel scoop if activated
  if (action.data.activateScoop) {
    const well = getGravityWell(updatedShip.wellId)
    const ringConfig = well?.rings.find(r => r.ring === updatedShip.ring)
    const velocity = ringConfig?.velocity || 1

    // Recover reaction mass equal to velocity, capped at max
    const massRecovered = Math.min(velocity, MAX_REACTION_MASS - updatedShip.reactionMass)
    updatedShip = {
      ...updatedShip,
      reactionMass: updatedShip.reactionMass + massRecovered,
    }
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Coast',
      result: `Moved to sector ${updatedShip.sector}${action.data.activateScoop ? ` (scoop recovered ${Math.min((getGravityWell(updatedShip.wellId)?.rings.find(r => r.ring === updatedShip.ring)?.velocity || 1), MAX_REACTION_MASS - player.ship.reactionMass)} mass)` : ''}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process a burn action (initiate and complete transfer on same turn)
 */
function processBurn(gameState: GameState, action: BurnAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  // Apply orbital movement first, then initiate burn
  let updatedShip = applyOrbitalMovement(player.ship)
  updatedShip = initiateBurn(updatedShip, action)

  // Complete the transfer immediately (all transfers complete same turn)
  const destinationRing = updatedShip.transferState?.destinationRing
  if (updatedShip.transferState) {
    updatedShip = completeRingTransfer(updatedShip)
  }

  // Generate heat from engines (heat = allocated energy)
  const enginesSubsystem = updatedShip.subsystems.find(s => s.type === 'engines')
  const heatGenerated = enginesSubsystem?.allocatedEnergy || 0
  if (heatGenerated > 0) {
    updatedShip = addHeat(updatedShip, heatGenerated)
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Burn',
      result: `${action.data.burnIntensity} burn completed to ring ${destinationRing}, sector ${updatedShip.sector}${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ''}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process rotation action
 */
function processRotation(gameState: GameState, action: RotateAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  let updatedShip = applyRotation(player.ship, action.data.targetFacing)

  // Mark rotation subsystem as used
  const rotationSubsystem = updatedShip.subsystems.find(s => s.type === 'rotation')
  const updatedSubsystems = updatedShip.subsystems.map(s =>
    s.type === 'rotation' ? { ...s, usedThisTurn: true } : s
  )

  updatedShip = {
    ...updatedShip,
    subsystems: updatedSubsystems,
  }

  // Generate heat from rotation (heat = allocated energy)
  const heatGenerated = rotationSubsystem?.allocatedEnergy || 0
  if (heatGenerated > 0) {
    updatedShip = addHeat(updatedShip, heatGenerated)
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Rotate',
      result: `Rotated to ${action.data.targetFacing}${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ''}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process energy allocation action
 */
function processAllocateEnergy(gameState: GameState, action: AllocateEnergyAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  const subsystemIndex = player.ship.subsystems.findIndex(s => s.type === action.data.subsystemType)
  const subsystem = player.ship.subsystems[subsystemIndex]
  const newAllocatedEnergy = subsystem.allocatedEnergy + action.data.amount

  // Create new subsystems array with updated subsystem
  const updatedSubsystems = [...player.ship.subsystems]
  updatedSubsystems[subsystemIndex] = {
    ...subsystem,
    allocatedEnergy: newAllocatedEnergy,
    isPowered: newAllocatedEnergy > 0,
  }

  // Update reactor and ship
  const updatedShip = {
    ...player.ship,
    subsystems: updatedSubsystems,
    reactor: {
      ...player.ship.reactor,
      availableEnergy: player.ship.reactor.availableEnergy - action.data.amount,
    },
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Allocate Energy',
      result: `+${action.data.amount} to ${action.data.subsystemType}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process energy deallocation action
 */
function processDeallocateEnergy(
  gameState: GameState,
  action: DeallocateEnergyAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  const subsystemIndex = player.ship.subsystems.findIndex(s => s.type === action.data.subsystemType)
  const subsystem = player.ship.subsystems[subsystemIndex]
  const amountToReturn = Math.min(action.data.amount, subsystem.allocatedEnergy)
  const newAllocatedEnergy = subsystem.allocatedEnergy - amountToReturn

  // Create new subsystems array with updated subsystem
  const updatedSubsystems = [...player.ship.subsystems]
  updatedSubsystems[subsystemIndex] = {
    ...subsystem,
    allocatedEnergy: newAllocatedEnergy,
    isPowered: newAllocatedEnergy > 0,
  }

  // Update reactor (energy returns WITHOUT generating heat - heat only generated from overclocking)
  const updatedShip = {
    ...player.ship,
    subsystems: updatedSubsystems,
    reactor: {
      ...player.ship.reactor,
      availableEnergy: player.ship.reactor.availableEnergy + amountToReturn,
    },
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Deallocate Energy',
      result: `Deallocated ${amountToReturn} from ${action.data.subsystemType} (${newAllocatedEnergy} remaining)`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process well transfer action (complete transfer between gravity wells immediately)
 * Well transfers happen instantly on the same turn - ship changes wells and moves with destination ring's velocity
 */
function processWellTransfer(gameState: GameState, action: WellTransferAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  // Find the transfer point
  const transferPoint = TRANSFER_POINTS.find(tp =>
    tp.fromWellId === player.ship.wellId &&
    tp.fromSector === player.ship.sector &&
    tp.toWellId === action.data.destinationWellId
  )

  if (!transferPoint) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ['Transfer point no longer available'],
    }
  }

  // Get destination well and ring config for orbital movement
  const destinationWell = getGravityWell(action.data.destinationWellId)
  if (!destinationWell) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ['Destination well not found'],
    }
  }

  const destinationRing = destinationWell.rings.find((r: RingConfig) => r.ring === transferPoint.toRing)
  if (!destinationRing) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ['Destination ring not found'],
    }
  }

  // Consume reaction mass
  const newReactionMass = player.ship.reactionMass - WELL_TRANSFER_COSTS.mass

  // Transfer to destination well immediately
  // Orbital movement will be applied by the movement action (coast/burn) that follows
  const updatedShip: ShipState = {
    ...player.ship,
    wellId: action.data.destinationWellId,
    ring: transferPoint.toRing,
    sector: transferPoint.toSector,
    reactionMass: newReactionMass,
    // Facing is preserved (sector numbering handles direction reversal)
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  // Get well names for logging
  const fromWell = getGravityWell(player.ship.wellId)
  const toWell = getGravityWell(action.data.destinationWellId)

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Well Transfer',
      result: `Transferred from ${fromWell?.name || player.ship.wellId} to ${toWell?.name || action.data.destinationWellId} R${updatedShip.ring}S${updatedShip.sector}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Process weapon firing action
 */
function processFireWeapon(gameState: GameState, action: FireWeaponAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const logEntries: TurnLogEntry[] = []

  const weaponConfig = WEAPONS[action.data.weaponType]
  const weaponSubsystem = player.ship.subsystems.find(s => s.type === action.data.weaponType)
  const heatGenerated = weaponSubsystem?.allocatedEnergy || 0

  // Special handling for missiles: create missile entity instead of dealing instant damage
  if (action.data.weaponType === 'missiles') {
    const targetId = action.data.targetPlayerIds[0] // Missiles target one player at a time
    const targetPlayer = gameState.players.find(p => p.id === targetId)

    if (!targetPlayer) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: ['Target player not found'],
      }
    }

    const { missile, error } = fireMissile(gameState, player.id, targetId)

    if (error || !missile) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: [error || 'Failed to fire missile'],
      }
    }

    // Add missile to game state, decrement ammo on missiles subsystem, mark used, and generate heat
    const currentAmmo = getMissileAmmo(player.ship.subsystems)
    let updatedAttackerShip = {
      ...player.ship,
      subsystems: player.ship.subsystems.map(s =>
        s.type === 'missiles' ? { ...s, usedThisTurn: true, ammo: currentAmmo - 1 } : s
      ),
    }

    // Generate heat from firing
    if (heatGenerated > 0) {
      updatedAttackerShip = addHeat(updatedAttackerShip, heatGenerated)
    }

    const updatedPlayers = gameState.players.map(p =>
      p.id === player.id ? { ...p, ship: updatedAttackerShip } : p
    )

    logEntries.push({
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Fire Missile',
      result: `Fired missile at ${targetPlayer.name} (${currentAmmo - 1} missiles remaining)${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ''}`,
    })

    return {
      success: true,
      gameState: {
        ...gameState,
        missiles: [...gameState.missiles, missile],
        players: updatedPlayers,
      },
      logEntries,
    }
  }

  // Regular weapons (laser, railgun): instant damage with shields and criticals
  const damage = getWeaponDamage(action.data.weaponType)

  // Apply damage to each target
  let updatedPlayers = [...gameState.players]

  // Update attacker's ship first (mark weapon used, generate heat)
  let updatedAttackerShip = {
    ...player.ship,
    subsystems: player.ship.subsystems.map(s =>
      s.type === action.data.weaponType ? { ...s, usedThisTurn: true } : s
    ),
  }

  // Generate heat from firing
  if (heatGenerated > 0) {
    updatedAttackerShip = addHeat(updatedAttackerShip, heatGenerated)
  }

  updatedPlayers[playerIndex] = { ...player, ship: updatedAttackerShip }

  for (const targetId of action.data.targetPlayerIds) {
    const targetIndex = updatedPlayers.findIndex(p => p.id === targetId)
    if (targetIndex === -1) continue

    const target = updatedPlayers[targetIndex]
    if (target.ship.hitPoints <= 0) continue // Already destroyed

    // Apply damage with shield absorption and critical hit chance
    const { ship: updatedTargetShip, hitResult } = applyDamageWithShields(
      target.ship,
      damage,
      action.data.criticalTarget
    )
    updatedPlayers[targetIndex] = { ...target, ship: updatedTargetShip }

    // Build result message
    let resultMsg = ''
    if (hitResult.damageToHeat > 0) {
      resultMsg = `Dealt ${damage} damage to ${target.name} (${hitResult.damageToHeat} absorbed by shields → heat, ${hitResult.damageToHull} to hull, ${updatedTargetShip.hitPoints}/${target.ship.maxHitPoints} HP)`
    } else {
      resultMsg = `Dealt ${damage} damage to ${target.name} (${updatedTargetShip.hitPoints}/${target.ship.maxHitPoints} HP)`
    }

    logEntries.push({
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: `${weaponConfig.name} Hit`,
      result: resultMsg + (heatGenerated > 0 ? ` (+${heatGenerated} heat to attacker)` : ''),
    })

    // Log critical hit if it occurred
    if (hitResult.critical && hitResult.criticalEffect) {
      const critEffect = hitResult.criticalEffect
      logEntries.push({
        turn: gameState.turn,
        playerId: player.id,
        playerName: player.name,
        action: 'Critical Hit!',
        result: `${target.name}'s ${getSubsystemConfig(critEffect.targetSubsystem).name} was disabled! (${critEffect.energyLost} energy → ${critEffect.heatAdded} heat)`,
      })
    }

    if (updatedTargetShip.hitPoints <= 0) {
      logEntries.push({
        turn: gameState.turn,
        playerId: target.id,
        playerName: target.name,
        action: 'Ship Destroyed',
        result: `${target.name} has been destroyed!`,
      })
    }
  }

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

