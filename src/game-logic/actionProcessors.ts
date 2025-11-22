import type {
  GameState,
  PlayerAction,
  TurnLogEntry,
  CoastAction,
  BurnAction,
  RotateAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  VentHeatAction,
  FireWeaponAction,
  WellTransferAction,
  ShipState,
} from '../types/game'
import { applyOrbitalMovement, initiateBurn, applyRotation, completeRingTransfer } from './movement'
import { applyWeaponDamage, getWeaponDamage } from './damage'
import { WEAPONS } from '../constants/weapons'
import { BURN_COSTS } from '../constants/rings'
import { getSubsystemConfig } from '../types/subsystems'
import { resetSubsystemUsage } from './subsystems'
import { fireMissile } from './missiles'
import { getGravityWell } from '../constants/gravityWells'
import type { RingConfig } from '../types/game'

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

function validateVentHeatAction(gameState: GameState, action: VentHeatAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  // Amount must be positive
  if (action.data.amount <= 0) {
    errors.push('Vent amount must be positive')
  }

  // Check there's enough heat to vent
  if (player.ship.heat.currentHeat < action.data.amount) {
    errors.push(`Not enough heat to vent (trying to vent ${action.data.amount}, have ${player.ship.heat.currentHeat})`)
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

function validateBurnAction(gameState: GameState, action: BurnAction): string[] {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const errors: string[] = []

  const burnCost = BURN_COSTS[action.data.burnIntensity]

  // Check engine energy
  const enginesSubsystem = player.ship.subsystems.find(s => s.type === 'engines')
  const currentEngineEnergy = enginesSubsystem?.allocatedEnergy || 0

  if (currentEngineEnergy < burnCost.energy) {
    errors.push(`Need ${burnCost.energy} energy in engines for ${action.data.burnIntensity} burn (have ${currentEngineEnergy})`)
  }

  // Check reaction mass
  if (player.ship.reactionMass < burnCost.mass) {
    errors.push(`Need ${burnCost.mass} reaction mass, have ${player.ship.reactionMass}`)
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

  // Check missile inventory
  if (action.data.weaponType === 'missiles') {
    if (player.ship.missileInventory <= 0) {
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
  const currentWell = gameState.gravityWells.find(w => w.id === player.ship.wellId)
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
  const transferPoint = gameState.transferPoints.find(tp =>
    tp.fromWellId === player.ship.wellId &&
    tp.fromSector === player.ship.sector &&
    tp.toWellId === action.data.destinationWellId
  )

  if (!transferPoint) {
    errors.push('No transfer point available from current position to destination well')
    return errors
  }

  return errors
}

/**
 * Process all actions for the active player in the correct order
 *
 * Turn sequence:
 * Phase 1 (Fixed order - Energy Management):
 *   1. Energy Allocation
 *   2. Energy Deallocation
 *   3. Heat Venting
 *
 * Phase 2 (User-specified order - Tactical Actions):
 *   - Rotation
 *   - Movement (coast or burn)
 *   - Weapon Firing
 *   (Order determined by sequence field on each action)
 *
 * Phase 3 (Fixed order - End of Turn):
 *   7. Heat Damage (from heat accumulated on PREVIOUS turns)
 *   8. Heat Generation (from overclocked subsystems THIS turn)
 *   9. Reset Subsystem Usage (prepare for next turn)
 *
 * Note: Transfer completion happens AFTER the previous player's turn ends,
 * so the active player sees their ship in the correct position when their turn starts.
 */
export function processActions(gameState: GameState, actions: PlayerAction[]): ProcessResult {
  const logEntries: TurnLogEntry[] = []
  let currentGameState = gameState
  const activePlayerIndex = gameState.activePlayerIndex
  const activePlayer = gameState.players[activePlayerIndex]

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

  // Track heat at start of turn for damage calculation
  const heatAtStartOfTurn = activePlayer.ship.heat.currentHeat

  // PHASE 1: Energy Management (fixed order)

  // Phase 1.1: Energy Allocation
  const allocateActions = actions.filter(a => a.type === 'allocate_energy') as AllocateEnergyAction[]
  const allocateResult = validateAndProcessActions(currentGameState, allocateActions, validateAllocateEnergyAction, processAllocateEnergy)
  if (!allocateResult.success) return allocateResult
  currentGameState = allocateResult.gameState
  logEntries.push(...allocateResult.logEntries)

  // Phase 1.2: Energy Deallocation
  const deallocateActions = actions.filter(a => a.type === 'deallocate_energy') as DeallocateEnergyAction[]
  const deallocateResult = validateAndProcessActions(currentGameState, deallocateActions, validateDeallocateEnergyAction, processDeallocateEnergy)
  if (!deallocateResult.success) return deallocateResult
  currentGameState = deallocateResult.gameState
  logEntries.push(...deallocateResult.logEntries)

  // Phase 1.3: Heat Venting
  const ventActions = actions.filter(a => a.type === 'vent_heat') as VentHeatAction[]
  const ventResult = validateAndProcessActions(currentGameState, ventActions, validateVentHeatAction, processVentHeat)
  if (!ventResult.success) return ventResult
  currentGameState = ventResult.gameState
  logEntries.push(...ventResult.logEntries)

  // PHASE 2: Tactical Actions (user-specified order via sequence field)

  const tacticalActions = actions
    .filter(a => a.type === 'rotate' || a.type === 'coast' || a.type === 'burn' || a.type === 'fire_weapon' || a.type === 'well_transfer')
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))

  for (const action of tacticalActions) {
    if (action.type === 'rotate') {
      const rotateResult = validateAndProcessActions(currentGameState, [action as RotateAction], validateRotateAction, processRotation)
      if (!rotateResult.success) return rotateResult
      currentGameState = rotateResult.gameState
      logEntries.push(...rotateResult.logEntries)
    } else if (action.type === 'coast') {
      const result = processCoast(currentGameState, action as CoastAction)
      currentGameState = result.gameState
      logEntries.push(...result.logEntries)
    } else if (action.type === 'burn') {
      const burnResult = validateAndProcessActions(currentGameState, [action as BurnAction], validateBurnAction, processBurn)
      if (!burnResult.success) return burnResult
      currentGameState = burnResult.gameState
      logEntries.push(...burnResult.logEntries)
    } else if (action.type === 'fire_weapon') {
      const weaponResult = validateAndProcessActions(currentGameState, [action as FireWeaponAction], validateFireWeaponAction, processFireWeapon)
      if (!weaponResult.success) return weaponResult
      currentGameState = weaponResult.gameState
      logEntries.push(...weaponResult.logEntries)
    } else if (action.type === 'well_transfer') {
      const wellTransferResult = validateAndProcessActions(currentGameState, [action as WellTransferAction], validateWellTransferAction, processWellTransfer)
      if (!wellTransferResult.success) return wellTransferResult
      currentGameState = wellTransferResult.gameState
      logEntries.push(...wellTransferResult.logEntries)
    }
  }

  // PHASE 3: End of Turn (fixed order)

  // Phase 7: Apply heat damage to active player (from heat at START of turn)
  const heatToVent = ventActions.reduce((sum, a) => sum + a.data.amount, 0)
  const heatDamageResult = applyHeatDamage(
    currentGameState,
    activePlayerIndex,
    heatAtStartOfTurn,
    heatToVent
  )
  currentGameState = heatDamageResult.gameState
  logEntries.push(...heatDamageResult.logEntries)

  // Phase 8: Generate heat from overclocked subsystems (happens at END of turn)
  const overclockResult = generateOverclockHeat(currentGameState, activePlayerIndex)
  currentGameState = overclockResult.gameState
  logEntries.push(...overclockResult.logEntries)

  // Phase 9: Reset subsystem usage flags for next turn
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
  const updatedShip = applyOrbitalMovement(player.ship)

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Coast',
      result: `Moved to sector ${updatedShip.sector}${action.data.activateScoop ? ' (scoop active)' : ''}`,
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

  // Apply orbital movement first, then initiate burn with immediate completion
  let updatedShip = applyOrbitalMovement(player.ship)
  updatedShip = initiateBurn(updatedShip, action, true) // true = immediate transfer

  // Complete the transfer immediately (same turn)
  const destinationRing = updatedShip.transferState?.destinationRing
  if (updatedShip.transferState && !updatedShip.transferState.arriveNextTurn) {
    updatedShip = completeRingTransfer(updatedShip)
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Burn',
      result: `${action.data.burnIntensity} burn completed to ring ${destinationRing}, sector ${updatedShip.sector}`,
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

  const updatedShip = applyRotation(player.ship, action.data.targetFacing)

  // Mark rotation subsystem as used
  const rotationSubsystemIndex = updatedShip.subsystems.findIndex(s => s.type === 'rotation')
  const updatedSubsystems = [...updatedShip.subsystems]
  if (rotationSubsystemIndex !== -1) {
    updatedSubsystems[rotationSubsystemIndex] = {
      ...updatedSubsystems[rotationSubsystemIndex],
      usedThisTurn: true,
    }
  }

  const shipWithUpdatedSubsystems = {
    ...updatedShip,
    subsystems: updatedSubsystems,
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: shipWithUpdatedSubsystems }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Rotate',
      result: `Rotated to ${action.data.targetFacing}`,
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
 * Process heat venting action
 */
function processVentHeat(gameState: GameState, action: VentHeatAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  const updatedShip = {
    ...player.ship,
    heat: {
      ...player.ship.heat,
      currentHeat: Math.max(0, player.ship.heat.currentHeat - action.data.amount),
    },
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Vent Heat',
      result: `Vented ${action.data.amount} heat (${updatedShip.heat.currentHeat} remaining)`,
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
  const transferPoint = gameState.transferPoints.find(tp =>
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

  // Transfer to destination well immediately
  // Orbital movement will be applied by the movement action (coast/burn) that follows
  const updatedShip: ShipState = {
    ...player.ship,
    wellId: action.data.destinationWellId,
    ring: transferPoint.toRing,
    sector: transferPoint.toSector,
    // Facing is preserved (sector numbering handles direction reversal)
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  // Get well names for logging
  const fromWell = gameState.gravityWells.find(w => w.id === player.ship.wellId)
  const toWell = gameState.gravityWells.find(w => w.id === action.data.destinationWellId)

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

    // Add missile to game state and decrement inventory
    const updatedPlayers = gameState.players.map(p =>
      p.id === player.id
        ? { ...p, ship: { ...p.ship, missileInventory: p.ship.missileInventory - 1 } }
        : p
    )

    // Mark weapon subsystem as used this turn
    const updatedPlayersWithUsage = updatedPlayers.map(p => {
      if (p.id === player.id) {
        const updatedSubsystems = p.ship.subsystems.map(s =>
          s.type === 'missiles' ? { ...s, usedThisTurn: true } : s
        )
        return { ...p, ship: { ...p.ship, subsystems: updatedSubsystems } }
      }
      return p
    })

    logEntries.push({
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Fire Missile',
      result: `Fired missile at ${targetPlayer.name} (${updatedPlayersWithUsage.find(p => p.id === player.id)!.ship.missileInventory} missiles remaining)`,
    })

    return {
      success: true,
      gameState: {
        ...gameState,
        missiles: [...gameState.missiles, missile],
        players: updatedPlayersWithUsage,
      },
      logEntries,
    }
  }

  // Regular weapons (laser, railgun): instant damage
  const damage = getWeaponDamage(action.data.weaponType)

  // Apply damage to each target
  const updatedPlayers = [...gameState.players]
  for (const targetId of action.data.targetPlayerIds) {
    const targetIndex = updatedPlayers.findIndex(p => p.id === targetId)
    if (targetIndex === -1) continue

    const target = updatedPlayers[targetIndex]
    if (target.ship.hitPoints <= 0) continue // Already destroyed

    const updatedShip = applyWeaponDamage(target.ship, action.data.weaponType, damage)
    updatedPlayers[targetIndex] = { ...target, ship: updatedShip }

    logEntries.push({
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: `${weaponConfig.name} Hit`,
      result: `Dealt ${damage} damage to ${target.name} (${updatedShip.hitPoints}/${target.ship.maxHitPoints} HP)`,
    })

    if (updatedShip.hitPoints <= 0) {
      logEntries.push({
        turn: gameState.turn,
        playerId: target.id,
        playerName: target.name,
        action: 'Ship Destroyed',
        result: `💥 ${target.name} has been destroyed!`,
      })
    }
  }

  // Mark weapon subsystem as used this turn
  const weaponSubsystem = player.ship.subsystems.find(s => s.type === action.data.weaponType)
  if (weaponSubsystem) {
    weaponSubsystem.usedThisTurn = true
  }

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}

/**
 * Apply heat damage to a player
 */
function applyHeatDamage(
  gameState: GameState,
  playerIndex: number,
  heatAtStartOfTurn: number,
  heatVented: number
): ProcessResult {
  const player = gameState.players[playerIndex]
  const effectiveHeatForDamage = Math.max(0, heatAtStartOfTurn - heatVented)

  if (effectiveHeatForDamage === 0) {
    return {
      success: true,
      gameState,
      logEntries: [],
    }
  }

  const heatDamage = effectiveHeatForDamage
  const updatedShip = applyWeaponDamage(player.ship, 'shields', heatDamage) // Using shields as placeholder

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Heat Damage',
      result: `Took ${heatDamage} hull damage from heat (${updatedShip.hitPoints}/${player.ship.maxHitPoints} HP)`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}


/**
 * Generate heat from overclocked subsystems
 */
function generateOverclockHeat(gameState: GameState, playerIndex: number): ProcessResult {
  const player = gameState.players[playerIndex]
  let totalHeatGenerated = 0
  const heatSources: string[] = []

  // Check each subsystem for overclocking
  player.ship.subsystems.forEach(subsystem => {
    const config = getSubsystemConfig(subsystem.type)
    if (subsystem.allocatedEnergy > config.overclockThreshold) {
      const overclockAmount = subsystem.allocatedEnergy - config.overclockThreshold
      const heatGenerated = overclockAmount // Always 1 heat per energy above threshold
      if (heatGenerated > 0) {
        totalHeatGenerated += heatGenerated
        heatSources.push(`${config.name} (+${heatGenerated})`)
      }
    }
  })

  if (totalHeatGenerated === 0) {
    return {
      success: true,
      gameState,
      logEntries: [],
    }
  }

  const updatedShip = {
    ...player.ship,
    heat: {
      ...player.ship.heat,
      currentHeat: player.ship.heat.currentHeat + totalHeatGenerated,
    },
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Overclock Heat",
      result: `Generated ${totalHeatGenerated} heat from overclocking: ${heatSources.join(", ")}`,
    },
  ]

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  }
}
