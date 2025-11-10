import type { ShipState, PlayerAction, TurnLogEntry, GameState } from '../types/game'
import type { SubsystemType } from '../types/subsystems'
import {
  getRingConfig,
  BURN_COSTS,
  MAX_REACTION_MASS,
  mapSectorOnTransfer,
} from '../constants/rings'
import { markSubsystemUsed } from './energy'
import { applyHeatGeneration } from './heat'
import { processEnergyReturn } from './energy'
import { resetSubsystemUsage } from './subsystems'

/**
 * Result of applying an action to a ship
 */
export interface ActionResult {
  ship: ShipState
  logEntries: TurnLogEntry[]
}

/**
 * Context for action application (provides player info for logging)
 * Derived from GameState and PlayerAction
 */
export interface ActionContext {
  playerId: string
  playerName: string
  turn: number
}

/**
 * Derive action context from game state and player action
 */
export function deriveActionContext(gameState: GameState, action: PlayerAction): ActionContext {
  const player = gameState.players.find(p => p.id === action.playerId)
  if (!player) {
    throw new Error(`Player with id ${action.playerId} not found`)
  }

  return {
    playerId: action.playerId,
    playerName: player.name,
    turn: gameState.turn,
  }
}

/**
 * Apply rotation action - change ship facing
 */
export function applyRotation(
  ship: ShipState,
  targetFacing: 'prograde' | 'retrograde',
  context: ActionContext
): ActionResult {
  if (ship.facing === targetFacing) {
    return { ship, logEntries: [] }
  }

  return {
    ship: { ...ship, facing: targetFacing },
    logEntries: [
      {
        turn: context.turn,
        playerId: context.playerId,
        playerName: context.playerName,
        action: 'Rotation',
        result: `Rotated to ${targetFacing}`,
      },
    ],
  }
}

/**
 * Apply burn action - initiate transfer to new ring
 */
export function applyBurn(
  ship: ShipState,
  burnIntensity: 'light' | 'medium' | 'heavy',
  targetFacing: 'prograde' | 'retrograde',
  sectorAdjustment: number = 0,
  context: ActionContext
): ActionResult {
  const logEntries: TurnLogEntry[] = []
  const burnCost = BURN_COSTS[burnIntensity]

  // Consume reaction mass
  const updatedShip: ShipState = {
    ...ship,
    reactionMass: ship.reactionMass - burnCost.mass,
  }

  // Calculate destination ring
  const direction = targetFacing === 'prograde' ? 1 : -1
  const destinationRing = Math.max(1, Math.min(5, ship.ring + direction * burnCost.rings))

  // Set transfer state
  updatedShip.transferState = {
    destinationRing,
    sectorAdjustment,
    arriveNextTurn: true,
  }

  const adjText = sectorAdjustment
    ? ` (sector adj: ${sectorAdjustment > 0 ? '+' : ''}${sectorAdjustment})`
    : ''

  logEntries.push({
    turn: context.turn,
    playerId: context.playerId,
    playerName: context.playerName,
    action: `${burnIntensity} burn ${targetFacing}`,
    result: `Initiating transfer to Ring ${destinationRing}${adjText} (${burnCost.energy}E, ${burnCost.mass}M)`,
  })

  return { ship: updatedShip, logEntries }
}

/**
 * Apply fuel scoop action - recover reaction mass from orbital velocity
 */
export function applyScoopFuel(ship: ShipState, context: ActionContext): ActionResult {
  const ringConfig = getRingConfig(ship.ring)
  if (!ringConfig) {
    return { ship, logEntries: [] }
  }

  const massRecovered = Math.min(ringConfig.velocity, MAX_REACTION_MASS - ship.reactionMass)

  return {
    ship: { ...ship, reactionMass: ship.reactionMass + massRecovered },
    logEntries: [
      {
        turn: context.turn,
        playerId: context.playerId,
        playerName: context.playerName,
        action: 'Fuel Scoop Active',
        result: `Recovered ${massRecovered} reaction mass`,
      },
    ],
  }
}

/**
 * Apply orbital movement - move ship along its current ring
 */
export function applyOrbitalMovement(ship: ShipState, context: ActionContext): ActionResult {
  const ringConfig = getRingConfig(ship.ring)
  if (!ringConfig) {
    return { ship, logEntries: [] }
  }

  const newSector = (ship.sector + ringConfig.velocity) % ringConfig.sectors

  return {
    ship: { ...ship, sector: newSector },
    logEntries: [
      {
        turn: context.turn,
        playerId: context.playerId,
        playerName: context.playerName,
        action: 'Orbital Movement',
        result: `Moved ${ringConfig.velocity} sectors to sector ${newSector}`,
      },
    ],
  }
}

/**
 * Apply transfer completion - move ship to destination ring
 */
export function applyTransferCompletion(ship: ShipState, context: ActionContext): ActionResult {
  if (!ship.transferState) {
    return { ship, logEntries: [] }
  }

  const oldRing = ship.ring
  const newRing = ship.transferState.destinationRing
  const baseSector = mapSectorOnTransfer(oldRing, newRing, ship.sector)
  const adjustment = ship.transferState.sectorAdjustment || 0

  const newRingConfig = getRingConfig(newRing)
  if (!newRingConfig) {
    return { ship, logEntries: [] }
  }

  // Apply sector adjustment with wraparound
  const finalSector = (baseSector + adjustment + newRingConfig.sectors) % newRingConfig.sectors

  return {
    ship: {
      ...ship,
      ring: newRing,
      sector: finalSector,
      transferState: null,
    },
    logEntries: [
      {
        turn: context.turn,
        playerId: context.playerId,
        playerName: context.playerName,
        action: 'Transfer Complete',
        result: `Arrived at Ring ${newRing}, Sector ${finalSector}${adjustment !== 0 ? ` (adjusted ${adjustment > 0 ? '+' : ''}${adjustment})` : ''}`,
      },
    ],
  }
}

/**
 * Apply weapon firing - mark weapon as used and handle special mechanics
 */
export function applyWeaponFiring(
  ship: ShipState,
  weaponType: string,
  targetPlayerId: string,
  context: ActionContext
): ActionResult {
  const logEntries: TurnLogEntry[] = []
  let updatedShip = markSubsystemUsed(ship, weaponType as SubsystemType)

  logEntries.push({
    turn: context.turn,
    playerId: context.playerId,
    playerName: context.playerName,
    action: `Fire ${weaponType}`,
    result: `Targeting player ${targetPlayerId}`,
  })

  // Handle railgun recoil
  if (weaponType === 'railgun') {
    const enginesSubsystem = updatedShip.subsystems.find(s => s.type === 'engines')
    const hasEnginesWithMass =
      enginesSubsystem && enginesSubsystem.allocatedEnergy >= 1 && updatedShip.reactionMass >= 1

    if (hasEnginesWithMass) {
      // Engines compensate for recoil
      updatedShip = { ...updatedShip, reactionMass: updatedShip.reactionMass - 1 }
      logEntries.push({
        turn: context.turn,
        playerId: context.playerId,
        playerName: context.playerName,
        action: 'Railgun Recoil Compensated',
        result: 'Engines absorbed recoil (1M consumed)',
      })
    } else {
      // Uncontrolled recoil burn - ship moves opposite to facing direction
      const recoilDirection = updatedShip.facing === 'prograde' ? -1 : 1
      const destinationRing = Math.max(1, Math.min(6, updatedShip.ring + recoilDirection))

      // Only initiate transfer if not already in one
      if (!updatedShip.transferState) {
        updatedShip = {
          ...updatedShip,
          transferState: {
            destinationRing,
            arriveNextTurn: true,
            sectorAdjustment: 0,
          },
        }

        logEntries.push({
          turn: context.turn,
          playerId: context.playerId,
          playerName: context.playerName,
          action: 'Railgun Recoil Burn',
          result: `⚠️ Uncontrolled recoil! Initiating transfer to Ring ${destinationRing}`,
        })
      } else {
        logEntries.push({
          turn: context.turn,
          playerId: context.playerId,
          playerName: context.playerName,
          action: 'Railgun Recoil Warning',
          result: '⚠️ Already in transfer - recoil had no additional effect',
        })
      }
    }
  }

  return { ship: updatedShip, logEntries }
}

/**
 * Apply a complete player action to a ship
 * This is the main entry point for processing player actions
 *
 * The action is self-contained with playerId, and context is derived from GameState
 */
export function applyAction(gameState: GameState, action: PlayerAction): ActionResult {
  // Find the player and get their ship
  const player = gameState.players.find(p => p.id === action.playerId)
  if (!player) {
    throw new Error(`Player with id ${action.playerId} not found in game state`)
  }

  const ship = player.ship
  const context = deriveActionContext(gameState, action)

  const allLogEntries: TurnLogEntry[] = []
  let updatedShip = ship

  // Phase 1: Transfer completion (if arriving this turn)
  if (updatedShip.transferState) {
    const result = applyTransferCompletion(updatedShip, context)
    updatedShip = result.ship
    allLogEntries.push(...result.logEntries)
  }

  // Phase 2: Rotation (if requested)
  const targetFacing = action.type === 'coast' ? action.data.targetFacing : action.type === 'burn' ? action.data.targetFacing : undefined
  if (targetFacing && updatedShip.facing !== targetFacing) {
    const result = applyRotation(updatedShip, targetFacing, context)
    updatedShip = result.ship
    allLogEntries.push(...result.logEntries)
  }

  // Phase 3: Burn execution (if burn action)
  if (action.type === 'burn') {
    const burnFacing = action.data.targetFacing
    const result = applyBurn(
      updatedShip,
      action.data.burnIntensity,
      burnFacing,
      action.data.sectorAdjustment,
      context
    )
    updatedShip = result.ship
    allLogEntries.push(...result.logEntries)
  }

  // Phase 4: No weapon firings in old applyAction - weapons are now handled separately

  // Phase 5: Fuel scoop (only during coast)
  if (action.type === 'coast' && action.data.activateScoop) {
    const result = applyScoopFuel(updatedShip, context)
    updatedShip = result.ship
    allLogEntries.push(...result.logEntries)
  }

  // Phase 6: Orbital movement (only if not completing transfer)
  const completedTransferThisTurn = ship.transferState !== null && updatedShip.transferState === null
  if (!completedTransferThisTurn) {
    const result = applyOrbitalMovement(updatedShip, context)
    updatedShip = result.ship
    allLogEntries.push(...result.logEntries)
  }

  // Phase 7: Heat generation
  updatedShip = applyHeatGeneration(updatedShip)
  const heatGenerated = updatedShip.heat.currentHeat - ship.heat.currentHeat
  if (heatGenerated > 0) {
    allLogEntries.push({
      turn: context.turn,
      playerId: context.playerId,
      playerName: context.playerName,
      action: 'Heat Generation',
      result: `Overclocking generated ${heatGenerated} heat`,
    })
  }

  // Phase 8: Energy return & heat venting
  const beforeReturn = updatedShip.reactor.availableEnergy
  const beforeHeat = updatedShip.heat.currentHeat

  updatedShip = processEnergyReturn(updatedShip)

  const actualReturn = updatedShip.reactor.availableEnergy - beforeReturn
  const actualVent = beforeHeat - updatedShip.heat.currentHeat

  if (actualVent > 0) {
    allLogEntries.push({
      turn: context.turn,
      playerId: context.playerId,
      playerName: context.playerName,
      action: 'Heat Venting',
      result: `Vented ${actualVent} heat`,
    })
  }

  if (actualReturn > 0) {
    allLogEntries.push({
      turn: context.turn,
      playerId: context.playerId,
      playerName: context.playerName,
      action: 'Energy Return',
      result: `Returned ${actualReturn} energy to reactor`,
    })
  }

  // Phase 9: Reset subsystem usage flags for next turn
  updatedShip = {
    ...updatedShip,
    subsystems: resetSubsystemUsage(updatedShip.subsystems),
  }

  return {
    ship: updatedShip,
    logEntries: allLogEntries,
  }
}
