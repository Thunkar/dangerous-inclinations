import type { Player, TurnLogEntry, ShipState } from '../types/game'
import {
  getRingConfig,
  BURN_COSTS,
  SCOOP_ENERGY_COST,
  MAX_REACTION_MASS,
  mapSectorOnTransfer,
} from '../constants/rings'
import {
  calculateHeatGeneration,
  processEnergyReturn,
  resetSubsystemUsage,
} from './subsystemHelpers'

/**
 * Resolve only the transfer and orbital movement for a ship without processing energy/heat
 * Used when we need to update a ship's position at the start of their turn
 */
export function resolveTransferOnly(
  ship: ShipState,
  playerId: string,
  playerName: string,
  turn: number
): { updatedShip: ShipState; logEntries: TurnLogEntry[] } {
  const logEntries: TurnLogEntry[] = []
  let updatedShip = { ...ship }

  // Only resolve transfer if one exists
  if (updatedShip.transferState) {
    const oldRing = updatedShip.ring
    const newRing = updatedShip.transferState.destinationRing
    const newSector = mapSectorOnTransfer(oldRing, newRing, updatedShip.sector)

    const newRingConfig = getRingConfig(newRing)
    if (!newRingConfig) {
      return { updatedShip, logEntries }
    }

    // Apply the destination ring's velocity for slingshot effect
    const finalSector = (newSector + newRingConfig.velocity) % newRingConfig.sectors

    updatedShip = {
      ...updatedShip,
      ring: newRing,
      sector: finalSector,
      transferState: null,
    }

    logEntries.push({
      turn,
      playerId,
      playerName,
      action: 'Transfer Complete',
      result: `Arrived at Ring ${updatedShip.ring}, Sector ${updatedShip.sector}`,
    })
  } else {
    // No transfer, just apply orbital movement
    const ringConfig = getRingConfig(updatedShip.ring)
    if (ringConfig) {
      const newSector = (updatedShip.sector + ringConfig.velocity) % ringConfig.sectors
      updatedShip = {
        ...updatedShip,
        sector: newSector,
      }

      logEntries.push({
        turn,
        playerId,
        playerName,
        action: 'Orbital Movement',
        result: `Moved ${ringConfig.velocity} sectors to sector ${newSector}`,
      })
    }
  }

  return { updatedShip, logEntries }
}

export function resolvePlayerTurn(
  player: Player,
  turn: number
): { updatedPlayer: Player; logEntries: TurnLogEntry[] } {
  const logEntries: TurnLogEntry[] = []
  let updatedShip = { ...player.ship }
  const action = player.pendingAction

  if (!action) {
    return { updatedPlayer: player, logEntries }
  }

  // Phase 2: Transfer Resolution
  // Track if we completed a transfer this turn (to skip movement later)
  let completedTransferThisTurn = false
  if (updatedShip.transferState) {
    const oldRing = updatedShip.ring
    const newRing = updatedShip.transferState.destinationRing
    const newSector = mapSectorOnTransfer(oldRing, newRing, updatedShip.sector)

    // Get the new ring's configuration to apply its velocity (slingshot effect)
    const newRingConfig = getRingConfig(newRing)
    if (!newRingConfig) {
      return { updatedPlayer: player, logEntries }
    }

    // Apply the destination ring's velocity for dramatic slingshot effect
    const finalSector = (newSector + newRingConfig.velocity) % newRingConfig.sectors

    updatedShip = {
      ...updatedShip,
      ring: newRing,
      sector: finalSector,
      transferState: null,
    }
    completedTransferThisTurn = true
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Transfer Complete',
      result: `Arrived at Ring ${updatedShip.ring}, Sector ${updatedShip.sector}`,
    })
  }

  // Phase 3: Orientation & Action Execution
  if (action.type === 'burn' && action.burnDirection && action.burnIntensity) {
    const needsRotation = updatedShip.facing !== action.burnDirection

    // Rotate if needed
    if (needsRotation) {
      updatedShip.facing = action.burnDirection
      logEntries.push({
        turn,
        playerId: player.id,
        playerName: player.name,
        action: 'Rotation',
        result: `Rotated to ${action.burnDirection}`,
      })
    }

    // Execute burn
    const burnCost = BURN_COSTS[action.burnIntensity]
    const direction = action.burnDirection === 'prograde' ? 1 : -1
    const destinationRing = updatedShip.ring + direction * burnCost.rings

    // Clamp to valid ring range
    const clampedDestination = Math.max(1, Math.min(6, destinationRing))

    updatedShip = {
      ...updatedShip,
      reactionMass: updatedShip.reactionMass - burnCost.mass,
      transferState: {
        destinationRing: clampedDestination,
        arriveNextTurn: true,
      },
    }

    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: `${action.burnIntensity} burn ${action.burnDirection}`,
      result: `Initiating transfer to Ring ${clampedDestination} (${burnCost.energy}E, ${burnCost.mass}M)`,
    })
  }

  // Phase 4: Fuel Scoop
  if (action.activateScoop && action.type === 'coast') {
    const ringConfig = getRingConfig(updatedShip.ring)
    if (ringConfig) {
      const massRecovered = Math.min(
        ringConfig.velocity,
        MAX_REACTION_MASS - updatedShip.reactionMass
      )
      updatedShip.reactionMass += massRecovered

      logEntries.push({
        turn,
        playerId: player.id,
        playerName: player.name,
        action: 'Fuel Scoop Active',
        result: `Recovered ${massRecovered} reaction mass (${SCOOP_ENERGY_COST}E)`,
      })
    }
  }

  // Phase 5: Sector Movement
  // Skip movement if we just completed a transfer (ship is already at final position)
  if (!completedTransferThisTurn) {
    const ringConfig = getRingConfig(updatedShip.ring)
    if (ringConfig) {
      const newSector = (updatedShip.sector + ringConfig.velocity) % ringConfig.sectors
      updatedShip.sector = newSector

      logEntries.push({
        turn,
        playerId: player.id,
        playerName: player.name,
        action: 'Orbital Movement',
        result: `Moved ${ringConfig.velocity} sectors to sector ${newSector}`,
      })
    }
  }

  // Phase 6: Heat Generation (damage applied at end of round, not per turn)
  const heatGenerated = calculateHeatGeneration(updatedShip.subsystems)
  let updatedHeat = { ...updatedShip.heat }

  if (heatGenerated > 0) {
    updatedHeat.currentHeat += heatGenerated
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Heat Generation',
      result: `Overclocking generated ${heatGenerated} heat`,
    })
  }

  // Phase 7: Energy Return & Heat Venting
  const { reactor: updatedReactor, heat: finalHeat } = processEnergyReturn(
    updatedShip.reactor,
    updatedHeat
  )

  if (updatedHeat.heatToVent > 0) {
    const actualVent = Math.min(updatedHeat.heatToVent, updatedHeat.currentHeat)
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Heat Venting',
      result: `Vented ${actualVent} heat`,
    })
  }

  if (updatedShip.reactor.energyToReturn > 0) {
    const actualReturn = Math.min(
      updatedShip.reactor.energyToReturn,
      Math.max(0, updatedShip.reactor.maxReturnRate - updatedHeat.heatToVent)
    )
    if (actualReturn > 0) {
      logEntries.push({
        turn,
        playerId: player.id,
        playerName: player.name,
        action: 'Energy Return',
        result: `Returned ${actualReturn} energy to reactor`,
      })
    }
  }

  // Phase 8: Reset subsystem usage flags for next turn
  const finalSubsystems = resetSubsystemUsage(updatedShip.subsystems)

  // Update final ship state
  updatedShip = {
    ...updatedShip,
    subsystems: finalSubsystems,
    reactor: updatedReactor,
    heat: finalHeat,
  }

  // Reset pending action
  const updatedPlayer: Player = {
    ...player,
    ship: updatedShip,
    pendingAction: null,
    powerAllocation: {
      rotation: 0,
      engines: 0,
      scoop: 0,
      weapons: 0,
      defense: 0,
    },
  }

  return { updatedPlayer, logEntries }
}
