import type {
  PlayerAction,
  DeallocateEnergyAction,
} from '@dangerous-inclinations/engine'
import type { TacticalSituation, BotParameters } from '../types'

/**
 * Heat venting is now automatic based on dissipationCapacity
 * This function is deprecated and no longer needed
 */

/**
 * Energy requirements for each subsystem to be functional
 */
const ENERGY_REQUIREMENTS = {
  engines: 1,
  rotation: 1,
  scoop: 3,
  laser: 2,
  railgun: 4,
  missiles: 2,
  shields: 1,
} as const

/**
 * Helper to check if a subsystem needs more energy to function
 * and calculate how much additional energy is needed
 */
function getEnergyNeeded(
  subsystemType: keyof typeof ENERGY_REQUIREMENTS,
  currentEnergy: number
): number {
  const required = ENERGY_REQUIREMENTS[subsystemType]
  const needed = required - currentEnergy
  return needed > 0 ? needed : 0
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
      // Max out railgun for high damage (need 4 energy to fire)
      const railgunNeeded = getEnergyNeeded('railgun', status.subsystems.railgun.energy)
      if (railgunNeeded > 0 && remainingEnergy >= railgunNeeded) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'railgun',
            amount: railgunNeeded,
          },
        })
        remainingEnergy -= railgunNeeded
      }

      // Power laser (need 2 energy)
      const laserNeeded = getEnergyNeeded('laser', status.subsystems.laser.energy)
      if (laserNeeded > 0 && remainingEnergy >= laserNeeded) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'laser',
            amount: laserNeeded,
          },
        })
        remainingEnergy -= laserNeeded
      }

      // Power missiles if energy left (need 2 energy)
      const missilesNeeded = getEnergyNeeded('missiles', status.subsystems.missiles.energy)
      if (missilesNeeded > 0 && remainingEnergy >= missilesNeeded) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'missiles',
            amount: missilesNeeded,
          },
        })
        remainingEnergy -= missilesNeeded
      }
    }

    // Engines last for aggressive bots (need 1 energy)
    const enginesNeeded = getEnergyNeeded('engines', status.subsystems.engines.energy)
    if (enginesNeeded > 0 && remainingEnergy >= enginesNeeded) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'engines',
          amount: enginesNeeded,
        },
      })
      remainingEnergy -= enginesNeeded
    }

    return actions
  }

  // Defensive strategy: shields and engines first
  if (parameters.aggressiveness <= 0.4) {
    // Shields are priority #1 when defensive (need 1, but allocate 2 for defense)
    const shieldsNeeded = getEnergyNeeded('shields', status.subsystems.shields.energy)
    if (primaryThreat && shieldsNeeded > 0 && remainingEnergy >= 2) {
      // Allocate extra energy to shields when defensive
      const shieldsToAllocate = Math.min(2, remainingEnergy)
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'shields',
          amount: shieldsToAllocate,
        },
      })
      remainingEnergy -= shieldsToAllocate
    }

    // Engines for maneuvering (need 1, but allocate 2 for speed)
    const enginesNeeded = getEnergyNeeded('engines', status.subsystems.engines.energy)
    if (enginesNeeded > 0 && remainingEnergy >= 2) {
      // Allocate extra energy for faster movement
      const enginesToAllocate = Math.min(2, remainingEnergy)
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'engines',
          amount: enginesToAllocate,
        },
      })
      remainingEnergy -= enginesToAllocate
    }

    // Rotation for defensive positioning (need 1 energy)
    const rotationNeeded = getEnergyNeeded('rotation', status.subsystems.rotation.energy)
    if (rotationNeeded > 0 && remainingEnergy >= rotationNeeded) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'rotation',
          amount: rotationNeeded,
        },
      })
      remainingEnergy -= rotationNeeded
    }

    // Only power weapons with leftover energy
    if (primaryTarget) {
      const laserNeeded = getEnergyNeeded('laser', status.subsystems.laser.energy)
      if (laserNeeded > 0 && remainingEnergy >= laserNeeded) {
        actions.push({
          type: 'allocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'laser',
            amount: laserNeeded,
          },
        })
        remainingEnergy -= laserNeeded
      }

      // No railgun when defensive (saves energy)
    }

    return actions
  }

  // Balanced strategy: engines > weapons > shields > rotation
  // 1. Ensure engines have at least 1 energy (for soft burns)
  const enginesNeeded = getEnergyNeeded('engines', status.subsystems.engines.energy)
  if (enginesNeeded > 0 && remainingEnergy >= enginesNeeded) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'engines',
        amount: enginesNeeded,
      },
    })
    remainingEnergy -= enginesNeeded
  }

  // 2. Power weapons if we have a target
  if (primaryTarget) {
    // Power laser (versatile, moderate energy cost - need 2)
    const laserNeeded = getEnergyNeeded('laser', status.subsystems.laser.energy)
    if (laserNeeded > 0 && remainingEnergy >= laserNeeded) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: laserNeeded,
        },
      })
      remainingEnergy -= laserNeeded
    }

    // Power railgun (high damage, but expensive - need 4)
    const railgunNeeded = getEnergyNeeded('railgun', status.subsystems.railgun.energy)
    if (railgunNeeded > 0 && remainingEnergy >= railgunNeeded) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: railgunNeeded,
        },
      })
      remainingEnergy -= railgunNeeded
    }

    // Power missiles if we have energy left (need 2)
    const missilesNeeded = getEnergyNeeded('missiles', status.subsystems.missiles.energy)
    if (missilesNeeded > 0 && remainingEnergy >= missilesNeeded) {
      actions.push({
        type: 'allocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'missiles',
          amount: missilesNeeded,
        },
      })
      remainingEnergy -= missilesNeeded
    }
  }

  // 3. Power shields if under fire (need 1)
  const shieldsNeeded = getEnergyNeeded('shields', status.subsystems.shields.energy)
  if (primaryThreat && shieldsNeeded > 0 && remainingEnergy >= shieldsNeeded) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'shields',
        amount: shieldsNeeded,
      },
    })
    remainingEnergy -= shieldsNeeded
  }

  // 4. Power rotation if we need to maneuver (need 1)
  const rotationNeeded = getEnergyNeeded('rotation', status.subsystems.rotation.energy)
  if (rotationNeeded > 0 && remainingEnergy >= rotationNeeded) {
    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: 'rotation',
        amount: rotationNeeded,
      },
    })
    remainingEnergy -= rotationNeeded
  }

  return actions
}

/**
 * Generate energy deallocation if we have excess energy in unused systems
 * PRIORITY: Deallocate from systems that aren't needed
 *
 * NOTE: Subsystems can only be unpowered (0) or powered (>= minEnergy).
 * When deallocating, we either turn off completely or reduce by 1 (staying above minEnergy).
 */
export function generateEnergyDeallocation(
  situation: TacticalSituation,
  parameters: BotParameters
): DeallocateEnergyAction[] {
  const { status, primaryTarget, primaryThreat } = situation
  const actions: DeallocateEnergyAction[] = []

  // Helper to calculate valid deallocation amount
  // Returns amount to deallocate to reach target, ensuring we don't leave partial state
  const getValidDeallocAmount = (
    subsystemType: keyof typeof ENERGY_REQUIREMENTS,
    currentEnergy: number,
    turnOff: boolean
  ): number => {
    if (currentEnergy === 0) return 0

    const minEnergy = ENERGY_REQUIREMENTS[subsystemType]

    if (turnOff) {
      // Turn off completely - deallocate all
      return currentEnergy
    } else {
      // Try to reduce but stay powered (at or above minEnergy)
      const excessAboveMin = currentEnergy - minEnergy
      // Can only reduce if we have excess above minimum
      return excessAboveMin > 0 ? 1 : 0
    }
  }

  // CRITICAL: If we have heat accumulating, deallocate from high-energy systems
  // Heat threshold check: if we're at or approaching the threshold, start deallocating
  const heatDanger = status.heatPercent >= parameters.heatThreshold * 0.8 // Start at 80% of threshold

  if (heatDanger || status.heat > 0) {
    // Priority 1: Turn off railgun if no target or heat is critical
    if (status.subsystems.railgun.energy > 0) {
      if (!primaryTarget || status.heat >= 3) {
        const amount = getValidDeallocAmount('railgun', status.subsystems.railgun.energy, true)
        if (amount > 0) {
          actions.push({
            type: 'deallocate_energy',
            playerId: situation.botPlayer.id,
            data: {
              subsystemType: 'railgun',
              amount,
            },
          })
          return actions // Return immediately to handle heat emergency
        }
      }
    }

    // Priority 2: Reduce engines if above minimum and heat is building
    if (status.subsystems.engines.energy > ENERGY_REQUIREMENTS.engines && status.heat >= 2) {
      const amount = getValidDeallocAmount('engines', status.subsystems.engines.energy, false)
      if (amount > 0) {
        actions.push({
          type: 'deallocate_energy',
          playerId: situation.botPlayer.id,
          data: {
            subsystemType: 'engines',
            amount,
          },
        })
        return actions
      }
    }
  }

  // Detect combat situation
  const noCombatNeeded = !primaryTarget && !primaryThreat
  const underThreatOnly = !primaryTarget && primaryThreat

  // If no combat needed at all, turn off ALL weapons and shields
  if (noCombatNeeded) {
    // Turn off all weapons completely
    if (status.subsystems.missiles.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'missiles',
          amount: status.subsystems.missiles.energy, // Turn off completely
        },
      })
    }

    if (status.subsystems.railgun.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: status.subsystems.railgun.energy, // Turn off completely
        },
      })
    }

    if (status.subsystems.laser.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: status.subsystems.laser.energy, // Turn off completely
        },
      })
    }

    // Turn off shields too (no combat = no need for defense)
    if (status.subsystems.shields.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'shields',
          amount: status.subsystems.shields.energy, // Turn off completely
        },
      })
    }
  }
  // If under threat but can't attack back, keep shields but turn off weapons
  else if (underThreatOnly) {
    // Keep shields for defense, but turn off offensive weapons completely
    if (status.subsystems.missiles.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'missiles',
          amount: status.subsystems.missiles.energy, // Turn off completely
        },
      })
    }

    if (status.subsystems.railgun.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'railgun',
          amount: status.subsystems.railgun.energy, // Turn off completely
        },
      })
    }

    if (status.subsystems.laser.energy > 0) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: 'laser',
          amount: status.subsystems.laser.energy, // Turn off completely
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
