import type { Player, TurnLogEntry } from '../types/game'
import { getRingConfig, BURN_COSTS, SCOOP_ENERGY_COST, MAX_REACTION_MASS } from '../constants/rings'

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
  if (updatedShip.transferState) {
    updatedShip = {
      ...updatedShip,
      ring: updatedShip.transferState.destinationRing,
      transferState: null,
    }
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Transfer Complete',
      result: `Arrived at Ring ${updatedShip.ring}`,
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
    const clampedDestination = Math.max(1, Math.min(8, destinationRing))

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
