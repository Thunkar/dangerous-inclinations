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
  ShipState,
} from '../types/game'
import { applyOrbitalMovement, initiateBurn, applyRotation } from './movement'
import { applyWeaponDamage, getWeaponDamage } from './damage'
import { WEAPONS } from '../constants/weapons'
import { getSubsystemConfig, canSubsystemFunction } from '../types/subsystems'
import { resetSubsystemUsage } from './subsystems'

export interface ProcessResult {
  success: boolean
  gameState: GameState
  logEntries: TurnLogEntry[]
  errors?: string[]
}

export interface ApplySingleResult {
  success: boolean
  ship: ShipState
  errors?: string[]
}

/**
 * Apply a single action to a ship snapshot (for snapshot-based validation)
 * This modifies the ship state in place and returns it
 */
export function applySingleAction(ship: ShipState, action: PlayerAction): ApplySingleResult {
  try {
    switch (action.type) {
      case 'allocate_energy':
        return applyAllocateToSnapshot(ship, action)

      case 'deallocate_energy':
        return applyDeallocateToSnapshot(ship, action)

      case 'vent_heat':
        return applyVentToSnapshot(ship, action)

      case 'rotate':
        return applyRotateToSnapshot(ship, action)

      case 'burn':
      case 'coast':
      case 'fire_weapon':
        // These actions don't modify ship state during validation phase
        // They're processed later in the actual execution
        return { success: true, ship }

      default:
        return { success: false, ship, errors: ['Unknown action type'] }
    }
  } catch (error) {
    return {
      success: false,
      ship,
      errors: [error instanceof Error ? error.message : 'Failed to apply action'],
    }
  }
}

function applyAllocateToSnapshot(ship: ShipState, action: AllocateEnergyAction): ApplySingleResult {
  const { subsystemType, amount } = action.data

  const subsystemIndex = ship.subsystems.findIndex(s => s.type === subsystemType)
  if (subsystemIndex === -1) {
    return { success: false, ship, errors: [`Subsystem ${subsystemType} not found`] }
  }

  // Update subsystem energy
  ship.subsystems[subsystemIndex].allocatedEnergy += amount
  ship.subsystems[subsystemIndex].isPowered = canSubsystemFunction(
    ship.subsystems[subsystemIndex]
  )

  // Update reactor
  ship.reactor.availableEnergy -= amount

  return { success: true, ship }
}

function applyDeallocateToSnapshot(
  ship: ShipState,
  action: DeallocateEnergyAction
): ApplySingleResult {
  const { subsystemType, amount } = action.data

  const subsystemIndex = ship.subsystems.findIndex(s => s.type === subsystemType)
  if (subsystemIndex === -1) {
    return { success: false, ship, errors: [`Subsystem ${subsystemType} not found`] }
  }

  const actualAmount = Math.min(amount, ship.subsystems[subsystemIndex].allocatedEnergy)

  // Update subsystem energy
  ship.subsystems[subsystemIndex].allocatedEnergy -= actualAmount
  ship.subsystems[subsystemIndex].isPowered = canSubsystemFunction(
    ship.subsystems[subsystemIndex]
  )

  // Return energy to reactor
  ship.reactor.availableEnergy += actualAmount

  return { success: true, ship }
}

function applyVentToSnapshot(ship: ShipState, action: VentHeatAction): ApplySingleResult {
  const { amount } = action.data

  // Vent heat
  ship.heat.currentHeat = Math.max(0, ship.heat.currentHeat - amount)

  return { success: true, ship }
}

function applyRotateToSnapshot(ship: ShipState, action: RotateAction): ApplySingleResult {
  const { targetFacing } = action.data

  // Change facing
  ship.facing = targetFacing

  // Mark rotation subsystem as used
  const rotationSubsystem = ship.subsystems.find(s => s.type === 'rotation')
  if (rotationSubsystem) {
    rotationSubsystem.usedThisTurn = true
  }

  return { success: true, ship }
}

/**
 * Process all actions for the active player in the correct order
 *
 * Turn sequence:
 * 1. Energy Allocation
 * 2. Energy Deallocation
 * 3. Heat Venting
 * 4. Rotation
 * 5. Movement
 * 6. Weapon Firing
 * 7. Heat Damage (from heat accumulated on PREVIOUS turns)
 * 8. Heat Generation (from overclocked subsystems THIS turn)
 * 9. Reset Subsystem Usage (prepare for next turn)
 *
 * Note: Transfer completion happens AFTER the previous player's turn ends,
 * so the active player sees their ship in the correct position when their turn starts.
 */
export function processActions(gameState: GameState, actions: PlayerAction[]): ProcessResult {
  const logEntries: TurnLogEntry[] = []
  let currentGameState = gameState
  const activePlayerIndex = gameState.activePlayerIndex
  const activePlayer = gameState.players[activePlayerIndex]

  // Track heat at start of turn for damage calculation
  const heatAtStartOfTurn = activePlayer.ship.heat.currentHeat

  // Phase 1: Energy Allocation
  const allocateActions = actions.filter(a => a.type === 'allocate_energy') as AllocateEnergyAction[]
  for (const action of allocateActions) {
    const result = processAllocateEnergy(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

  // Phase 2: Energy Deallocation
  const deallocateActions = actions.filter(
    a => a.type === 'deallocate_energy'
  ) as DeallocateEnergyAction[]
  for (const action of deallocateActions) {
    const result = processDeallocateEnergy(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

  // Phase 3: Heat Venting
  const ventActions = actions.filter(a => a.type === 'vent_heat') as VentHeatAction[]
  for (const action of ventActions) {
    const result = processVentHeat(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

  // Phase 4: Rotation
  const rotateActions = actions.filter(a => a.type === 'rotate') as RotateAction[]
  for (const action of rotateActions) {
    const result = processRotation(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

  // Phase 5: Movement (coast or burn) + Orbital Movement
  const movementAction = actions.find(a => a.type === 'coast' || a.type === 'burn')
  if (movementAction) {
    if (movementAction.type === 'coast') {
      const result = processCoast(currentGameState, movementAction as CoastAction)
      currentGameState = result.gameState
      logEntries.push(...result.logEntries)
    } else {
      const result = processBurn(currentGameState, movementAction as BurnAction)
      currentGameState = result.gameState
      logEntries.push(...result.logEntries)
    }
  }

  // Phase 6: Weapon Firing (all simultaneous)
  const weaponActions = actions.filter(a => a.type === 'fire_weapon') as FireWeaponAction[]
  for (const action of weaponActions) {
    const result = processFireWeapon(currentGameState, action)
    currentGameState = result.gameState
    logEntries.push(...result.logEntries)
  }

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
 * Process a burn action (initiate transfer)
 */
function processBurn(gameState: GameState, action: BurnAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]

  // Apply orbital movement first, then initiate burn
  let updatedShip = applyOrbitalMovement(player.ship)
  updatedShip = initiateBurn(updatedShip, action)

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Burn',
      result: `${action.data.burnIntensity} burn initiated to ring ${updatedShip.transferState?.destinationRing}`,
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
  const rotationSubsystem = updatedShip.subsystems.find(s => s.type === 'rotation')
  if (rotationSubsystem) {
    rotationSubsystem.usedThisTurn = true
  }

  const updatedPlayers = [...gameState.players]
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip }

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
  if (subsystemIndex === -1) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: [`Subsystem ${action.data.subsystemType} not found`],
    }
  }

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
  if (subsystemIndex === -1) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: [`Subsystem ${action.data.subsystemType} not found`],
    }
  }

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
 * Process weapon firing action
 */
function processFireWeapon(gameState: GameState, action: FireWeaponAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(p => p.id === action.playerId)
  const player = gameState.players[playerIndex]
  const logEntries: TurnLogEntry[] = []

  const weaponConfig = WEAPONS[action.data.weaponType]
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

  // Consume energy from the specific weapon subsystem
  const weaponSubsystem = player.ship.subsystems.find(s => s.type === action.data.weaponType)
  if (weaponSubsystem) {
    const totalEnergyCost = weaponConfig.energyCost * action.data.targetPlayerIds.length
    weaponSubsystem.allocatedEnergy -= totalEnergyCost
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
