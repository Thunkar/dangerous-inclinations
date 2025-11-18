import type {
  PlayerAction,
  DeallocateEnergyAction,
  VentHeatAction,
} from '../../types/game'
import type { TacticalSituation, BotParameters } from '../types'

/**
 * Generate heat venting action if needed
 */
export function generateHeatVentAction(
  situation: TacticalSituation,
  parameters: BotParameters
): VentHeatAction | null {
  const { status } = situation
  const { heat, heatPercent } = status

  // Vent if heat is above threshold
  if (heatPercent >= parameters.heatThreshold && heat > 0) {
    // Vent up to 3 heat (max deallocation limit)
    const ventAmount = Math.min(3, heat)

    return {
      type: 'vent_heat',
      playerId: situation.botPlayer.id,
      data: {
        amount: ventAmount,
      },
    }
  }

  return null
}

/**
 * Generate energy allocation actions to power essential systems
 * Strategy varies based on aggressiveness parameter
 */
export function generateEnergyManagement(
  situation: TacticalSituation,
  parameters: BotParameters
): PlayerAction[] {
  const { status, primaryTarget, primaryThreat } = situation
  const actions: PlayerAction[] = []

  // Track remaining energy as we allocate
  let remainingEnergy = status.availableEnergy

  // Aggressive strategy: weapons first, then essentials
  if (parameters.aggressiveness >= 0.7) {
    // Prioritize weapons over everything
    if (primaryTarget) {
      // Max out railgun for high damage
      if (!status.subsystems.railgun.powered && remainingEnergy >= 4) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'railgun',
            amount: 4,
          },
        })
        remainingEnergy -= 4
      }

      // Power laser
      if (!status.subsystems.laser.powered && remainingEnergy >= 2) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'laser',
            amount: 2,
          },
        })
        remainingEnergy -= 2
      }

      // Power missiles if energy left
      if (!status.subsystems.missiles.powered && remainingEnergy >= 2) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'missiles',
            amount: 2,
          },
        })
        remainingEnergy -= 2
      }
    }

    // Engines last for aggressive bots
    if (!status.subsystems.engines.powered && remainingEnergy >= 1) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'engines',
          amount: 1,
        },
      })
      remainingEnergy -= 1
    }

    return actions
  }

  // Defensive strategy: shields and engines first
  if (parameters.aggressiveness <= 0.4) {
    // Shields are priority #1 when defensive
    if (primaryThreat && !status.subsystems.shields.powered && remainingEnergy >= 2) {
      // Allocate extra energy to shields when defensive
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'shields',
          amount: 2,
        },
      })
      remainingEnergy -= 2
    }

    // Engines for maneuvering
    if (!status.subsystems.engines.powered && remainingEnergy >= 2) {
      // Allocate extra energy for faster movement
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'engines',
          amount: 2,
        },
      })
      remainingEnergy -= 2
    }

    // Rotation for defensive positioning
    if (!status.subsystems.rotation.powered && remainingEnergy >= 1) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'rotation',
          amount: 1,
        },
      })
      remainingEnergy -= 1
    }

    // Only power weapons with leftover energy
    if (primaryTarget) {
      if (!status.subsystems.laser.powered && remainingEnergy >= 2) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'laser',
            amount: 2,
          },
        })
        remainingEnergy -= 2
      }

      // No railgun when defensive (saves energy)
    }

    return actions
  }

  // Balanced strategy: engines > weapons > shields > rotation
  // 1. Ensure engines have at least 1 energy (for light burns)
  if (!status.subsystems.engines.powered && remainingEnergy >= 1) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'engines',
        amount: 1,
      },
    })
    remainingEnergy -= 1
  }

  // 2. Power weapons if we have a target
  if (primaryTarget) {
    // Power laser (versatile, moderate energy cost)
    if (!status.subsystems.laser.powered && remainingEnergy >= 2) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: 2,
        },
      })
      remainingEnergy -= 2
    }

    // Power railgun (high damage, but expensive)
    if (!status.subsystems.railgun.powered && remainingEnergy >= 4) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: 4,
        },
      })
      remainingEnergy -= 4
    }

    // Power missiles if we have energy left
    if (!status.subsystems.missiles.powered && remainingEnergy >= 2) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'missiles',
          amount: 2,
        },
      })
      remainingEnergy -= 2
    }
  }

  // 3. Power shields if under fire
  if (primaryThreat && !status.subsystems.shields.powered && remainingEnergy >= 1) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'shields',
        amount: 1,
      },
    })
    remainingEnergy -= 1
  }

  // 4. Power rotation if we need to maneuver
  if (!status.subsystems.rotation.powered && remainingEnergy >= 1) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'rotation',
        amount: 1,
      },
    })
    remainingEnergy -= 1
  }

  return actions
}

/**
 * Generate energy deallocation if we have excess energy in unused systems
 */
export function generateEnergyDeallocation(
  situation: TacticalSituation
): DeallocateEnergyAction[] {
  const { status, primaryTarget } = situation
  const actions: DeallocateEnergyAction[] = []

  // If no target, consider deallocating from weapons to use energy elsewhere
  if (!primaryTarget) {
    // Deallocate from missiles if powered (least useful without target)
    if (status.subsystems.missiles.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'missiles',
          amount: Math.min(3, status.subsystems.missiles.energy),
        },
      })
    }
  }

  return actions
}
