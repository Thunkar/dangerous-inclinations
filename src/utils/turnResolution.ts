import type { Player, TurnLogEntry, ShipState } from '../types/game'
import type { SubsystemType } from '../types/subsystems'
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
  getSubsystem,
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
    const baseSector = mapSectorOnTransfer(oldRing, newRing, updatedShip.sector)
    const adjustment = updatedShip.transferState.sectorAdjustment || 0

    const newRingConfig = getRingConfig(newRing)
    if (!newRingConfig) {
      return { updatedShip, logEntries }
    }

    // Apply sector adjustment with wraparound
    const finalSector = (baseSector + adjustment + newRingConfig.sectors) % newRingConfig.sectors

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
      result: `Arrived at Ring ${updatedShip.ring}, Sector ${updatedShip.sector}${adjustment !== 0 ? ` (adjusted ${adjustment > 0 ? '+' : ''}${adjustment})` : ''}`,
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
    const baseSector = mapSectorOnTransfer(oldRing, newRing, updatedShip.sector)
    const adjustment = updatedShip.transferState.sectorAdjustment || 0

    const newRingConfig = getRingConfig(newRing)
    if (!newRingConfig) {
      return { updatedPlayer: player, logEntries }
    }

    // Apply sector adjustment with wraparound
    const finalSector = (baseSector + adjustment + newRingConfig.sectors) % newRingConfig.sectors

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
      result: `Arrived at Ring ${updatedShip.ring}, Sector ${updatedShip.sector}${adjustment !== 0 ? ` (adjusted ${adjustment > 0 ? '+' : ''}${adjustment})` : ''}`,
    })
  }

  // Phase 3: Orientation (now independent of burn)
  if (action.targetFacing && updatedShip.facing !== action.targetFacing) {
    updatedShip.facing = action.targetFacing
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: 'Rotation',
      result: `Rotated to ${action.targetFacing}`,
    })
  }

  // Phase 3.5: Burn Execution (if burn action selected)
  if (action.type === 'burn' && action.burnIntensity) {
    const burnCost = BURN_COSTS[action.burnIntensity]
    const burnDirection = action.targetFacing || updatedShip.facing

    // Consume reaction mass
    updatedShip.reactionMass -= burnCost.mass

    // Transfer burn: initiate ring change
    const direction = burnDirection === 'prograde' ? 1 : -1
    const destinationRing = updatedShip.ring + direction * burnCost.rings

    // Clamp to valid ring range (1-5)
    const clampedDestination = Math.max(1, Math.min(5, destinationRing))

    updatedShip.transferState = {
      destinationRing: clampedDestination,
      sectorAdjustment: action.sectorAdjustment || 0,
      arriveNextTurn: true,
    }

    const adjText = action.sectorAdjustment
      ? ` (sector adj: ${action.sectorAdjustment > 0 ? '+' : ''}${action.sectorAdjustment})`
      : ''
    logEntries.push({
      turn,
      playerId: player.id,
      playerName: player.name,
      action: `${action.burnIntensity} burn ${burnDirection}`,
      result: `Initiating transfer to Ring ${clampedDestination}${adjText} (${burnCost.energy}E, ${burnCost.mass}M)`,
    })
  }

  // Phase 4: Weapons (process all weapon firings)
  // Note: Weapon damage will be applied in a separate combat resolution phase
  // This just logs the weapon firing events and handles special mechanics (like railgun recoil)
  if (action.weaponFirings && action.weaponFirings.length > 0) {
    action.weaponFirings.forEach(firing => {
      // Mark weapon as used
      const weaponType = firing.weaponType as SubsystemType
      updatedShip.subsystems = updatedShip.subsystems.map(s =>
        s.type === weaponType ? { ...s, usedThisTurn: true } : s
      )

      logEntries.push({
        turn,
        playerId: player.id,
        playerName: player.name,
        action: `Fire ${firing.weaponType}`,
        result: `Targeting player ${firing.targetPlayerId}`,
      })

      // Railgun recoil mechanics
      if (firing.weaponType === 'railgun') {
        const enginesSubsystem = getSubsystem(updatedShip.subsystems, 'engines')
        const hasEnginesWithMass =
          enginesSubsystem && enginesSubsystem.allocatedEnergy >= 1 && updatedShip.reactionMass >= 1

        if (hasEnginesWithMass) {
          // Engines compensate for recoil
          updatedShip.reactionMass -= 1
          logEntries.push({
            turn,
            playerId: player.id,
            playerName: player.name,
            action: 'Railgun Recoil Compensated',
            result: 'Engines absorbed recoil (1M consumed)',
          })
        } else {
          // Uncontrolled recoil burn - ship moves opposite to facing direction
          const recoilDirection = updatedShip.facing === 'prograde' ? -1 : 1
          const destinationRing = Math.max(1, Math.min(6, updatedShip.ring + recoilDirection))

          // Only initiate transfer if not already in one
          if (!updatedShip.transferState) {
            updatedShip.transferState = {
              destinationRing,
              arriveNextTurn: true,
              sectorAdjustment: 0,
            }

            logEntries.push({
              turn,
              playerId: player.id,
              playerName: player.name,
              action: 'Railgun Recoil Burn',
              result: `⚠️ Uncontrolled recoil! Initiating transfer to Ring ${destinationRing}`,
            })
          } else {
            logEntries.push({
              turn,
              playerId: player.id,
              playerName: player.name,
              action: 'Railgun Recoil Warning',
              result: '⚠️ Already in transfer - recoil had no additional effect',
            })
          }
        }
      }
    })
  }

  // Phase 5: Fuel Scoop
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

  // Phase 6: Sector Movement
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

  // Phase 7: Heat Generation (damage applied at end of round, not per turn)
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

  // Phase 8: Energy Return & Heat Venting
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

  // Phase 9: Reset subsystem usage flags for next turn
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
  }

  return { updatedPlayer, logEntries }
}
