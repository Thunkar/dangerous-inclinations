import type {
  PlayerAction,
  DeallocateEnergyAction,
  VentHeatAction,
} from '../../types/game'
import type { TacticalSituation, BotParameters } from '../types'

/**
 * Generate heat venting action if needed
 * IMPORTANT: Heat causes 1 damage per heat per turn, so we must vent proactively
 */
export function generateHeatVentAction(
  situation: TacticalSituation,
  parameters: BotParameters
): VentHeatAction | null {
  const { status } = situation
  const { heat, heatPercent } = status

  // CRITICAL: If we have ANY heat, we should consider venting it
  // Heat causes damage every turn it persists
  if (heat > 0) {
    // Aggressive venting: if heat is above 50% of threshold, start venting
    const shouldVent = heatPercent >= parameters.heatThreshold * 0.5

    // Emergency venting: if heat >= 2, always vent (will cause 2 damage/turn)
    const emergencyVent = heat >= 2

    if (shouldVent || emergencyVent) {
      // Vent up to 3 heat (max venting limit)
      const ventAmount = Math.min(3, heat)

      return {
        type: 'vent_heat',
        playerId: situation.botPlayer.id,
        data: {
          amount: ventAmount,
        },
      }
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
 * PRIORITY: Deallocate from overclocked systems to prevent heat buildup
 */
export function generateEnergyDeallocation(
  situation: TacticalSituation,
  parameters: BotParameters
): DeallocateEnergyAction[] {
  const { status, primaryTarget, primaryThreat } = situation
  const actions: DeallocateEnergyAction[] = []

  // CRITICAL: If we have heat accumulating, deallocate from overclocked systems
  // Heat threshold check: if we're at or approaching the threshold, start deallocating
  const heatDanger = status.heatPercent >= parameters.heatThreshold * 0.8 // Start at 80% of threshold

  if (heatDanger || status.heat > 0) {
    // Priority 1: Deallocate from overclocked railgun (4 energy, generates 1 heat)
    const railgunOverclocked = status.subsystems.railgun.energy >= 4
    if (railgunOverclocked) {
      // If no target or heat is critical, deallocate railgun
      if (!primaryTarget || status.heat >= 3) {
        actions.push({
          type: 'deallocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'railgun',
            amount: Math.min(3, status.subsystems.railgun.energy),
          },
        })
        return actions // Return immediately to handle heat emergency
      }
    }

    // Priority 2: Deallocate from overclocked engines (3 energy, generates 1 heat)
    const enginesOverclocked = status.subsystems.engines.energy >= 3
    if (enginesOverclocked && status.heat >= 2) {
      // Reduce engines from 3 to 2 to stop heat generation
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'engines',
          amount: 1, // Just reduce by 1 to stop overclock
        },
      })
      return actions
    }
  }

  // Detect combat situation
  const noCombatNeeded = !primaryTarget && !primaryThreat
  const underThreatOnly = !primaryTarget && primaryThreat

  // If no combat needed at all, deallocate ALL weapons and shields
  if (noCombatNeeded) {
    // Deallocate all weapons
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

    if (status.subsystems.railgun.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: Math.min(3, status.subsystems.railgun.energy),
        },
      })
    }

    if (status.subsystems.laser.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: Math.min(3, status.subsystems.laser.energy),
        },
      })
    }

    // Deallocate shields too (no combat = no need for defense)
    if (status.subsystems.shields.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'shields',
          amount: Math.min(3, status.subsystems.shields.energy),
        },
      })
    }
  }
  // If under threat but can't attack back, keep shields but deallocate weapons
  else if (underThreatOnly) {
    // Keep shields for defense, but deallocate offensive weapons
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

    if (status.subsystems.railgun.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: Math.min(3, status.subsystems.railgun.energy),
        },
      })
    }

    if (status.subsystems.laser.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: Math.min(3, status.subsystems.laser.energy),
        },
      })
    }
  }
  // If we have a target, only deallocate if no combat (handled by noCombatNeeded above)
  else if (primaryTarget) {
    // Keep weapons powered when we have a target
    // No deallocation needed
  }

  return actions
}
