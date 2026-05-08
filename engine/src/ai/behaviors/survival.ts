import type { PlayerAction, DeallocateEnergyAction } from '../../models/game'
import type { SubsystemType } from '../../models/subsystems'
import { SUBSYSTEM_CONFIGS } from '../../models/subsystems'
import type { TacticalSituation, BotParameters } from '../types'

/**
 * Energy request for priority-based budgeting
 */
interface EnergyRequest {
  subsystemIndex: number
  type: SubsystemType
  energy: number // Total energy needed (minEnergy)
  priority: number // Lower = higher priority (0 = most urgent)
}

/**
 * Build a priority-ordered energy budget based on the current tactical situation
 * and the planned actions for this turn.
 *
 * Priority levels:
 * P0: Engines (if burning or well transfer planned)
 * P1: Rotation (if rotating), Shields (if under threat)
 * P2: Weapons in range of target
 * P3: Scoop (if coasting), Sensor array (if firing weapons)
 * P4: Weapons not in range but target exists (preparation)
 * SKIP: Anything not needed this turn
 */
/**
 * Context for energy budgeting decisions
 */
export interface EnergyContext {
  willBurn: boolean
  willCoast: boolean
  willRotate: boolean
  willTransfer: boolean
  hasTargetInRange: boolean
  hasTarget: boolean
  underThreat: boolean
  requiredEngineEnergy?: number // How much energy engines need (1=soft, 2=medium, 3=hard/transfer)
}

function buildEnergyBudget(
  situation: TacticalSituation,
  _parameters: BotParameters,
  context: EnergyContext
): EnergyRequest[] {
  const { status } = situation
  const requests: EnergyRequest[] = []

  for (const sub of status.subsystems) {
    const config = SUBSYSTEM_CONFIGS[sub.type]
    if (sub.broken) continue
    if (config.minEnergy === 0) continue // Passive subsystems (radiator, fuel_compressor)

    let priority = -1 // -1 means skip
    let requiredEnergy = config.minEnergy

    switch (sub.type) {
      case 'engines':
        if (context.willBurn || context.willTransfer) {
          priority = 0
          // Use specific engine energy requirement if provided
          requiredEnergy = context.requiredEngineEnergy ?? config.minEnergy
        }
        break

      case 'rotation':
        if (context.willRotate) {
          priority = 1
        }
        break

      case 'shields':
        if (context.underThreat) {
          priority = 1
        } else if (context.hasTarget) {
          // Low priority shields if enemy exists but not threatening
          priority = 5
        }
        break

      case 'scoop':
        if (context.willCoast && status.reactionMass < 8) {
          priority = 3
        }
        break

      case 'sensor_array':
        if (context.hasTargetInRange) {
          priority = 3 // Boost crit chance when firing
        }
        break

      default: {
        // Weapon subsystems
        if (config.weaponStats) {
          // Skip ammo-depleted weapons entirely (don't waste energy)
          if (sub.type === 'missiles' && sub.ammo !== undefined && sub.ammo <= 0) {
            priority = -1
            break
          }
          if (context.hasTargetInRange) {
            // Check if THIS specific weapon is in range
            const target = situation.primaryTarget
            if (target && target.firingSolutions.has(sub.index)) {
              const solution = target.firingSolutions.get(sub.index)!
              if (solution.inRange) {
                priority = 2 // High priority - weapon in range
              } else {
                priority = 4 // Lower priority - weapon exists but not in range
              }
            } else {
              priority = 4
            }
          } else if (context.hasTarget) {
            priority = 4 // Target exists but nothing in range
          }
        }
        break
      }
    }

    if (priority >= 0) {
      requests.push({
        subsystemIndex: sub.index,
        type: sub.type,
        energy: requiredEnergy,
        priority,
      })
    }
  }

  // Sort by priority (lower = more important)
  requests.sort((a, b) => a.priority - b.priority)

  return requests
}

/**
 * Generate energy allocation actions using priority-based budgeting.
 * Allocates greedily in priority order, respecting reactor capacity.
 */
export function generateEnergyManagement(
  situation: TacticalSituation,
  parameters: BotParameters,
  context?: EnergyContext,
  energyFreedByDeallocation: number = 0
): PlayerAction[] {
  const { status } = situation
  const actions: PlayerAction[] = []

  // Default context if not provided (backward compat)
  const ctx = context ?? {
    willBurn: true,
    willCoast: false,
    willRotate: false,
    willTransfer: false,
    hasTargetInRange: situation.primaryTarget != null && Array.from(situation.primaryTarget.firingSolutions.values()).some(s => s.inRange),
    hasTarget: situation.primaryTarget != null,
    underThreat: situation.primaryThreat != null && situation.primaryThreat.weaponsInRange.some(w => w.inRange),
  }

  const budget = buildEnergyBudget(situation, parameters, ctx)

  // Track remaining energy as we allocate.
  // Include energy that will be freed by deallocation actions (processed before allocations).
  let remainingEnergy = status.availableEnergy + energyFreedByDeallocation

  // Also track total allocated across all subsystems to stay under reactor cap (10)
  let totalAllocated = status.subsystems.reduce((sum, s) => sum + s.energy, 0)
  const REACTOR_CAP = 10

  // IMPORTANT: The game engine identifies subsystems by TYPE (not index) via findIndex.
  // When multiple subsystems share a type (e.g. two lasers), only the FIRST one is targeted.
  // We must track which types we've already allocated to and skip duplicates.
  const allocatedTypes = new Set<SubsystemType>()

  for (const request of budget) {
    const sub = status.subsystems[request.subsystemIndex]
    if (!sub) continue

    // Skip if we already allocated to this subsystem type this turn
    if (allocatedTypes.has(request.type)) continue

    // For subsystems that already have energy, find the actual game subsystem
    // to check against (the engine uses findIndex, so it targets the first one)
    const gameSubsystem = situation.botPlayer.ship.subsystems.find(s => s.type === request.type)
    if (!gameSubsystem) continue

    const currentEnergy = gameSubsystem.allocatedEnergy
    const needed = request.energy - currentEnergy
    if (needed <= 0) continue // Already has enough energy

    // Check both available energy and reactor cap
    const canAllocate = Math.min(needed, remainingEnergy, REACTOR_CAP - totalAllocated)
    if (canAllocate <= 0) continue

    // Only allocate if we'd reach minEnergy (partial allocation is useless)
    if (currentEnergy + canAllocate < request.energy) continue

    actions.push({
      type: 'allocate_energy',
      playerId: situation.botPlayer.id,
      data: {
        subsystemType: request.type,
        amount: canAllocate,
      },
    })
    remainingEnergy -= canAllocate
    totalAllocated += canAllocate
    allocatedTypes.add(request.type)
  }

  return actions
}

/**
 * Generate energy deallocation actions.
 * Deallocates from subsystems that aren't in the energy budget.
 */
export function generateEnergyDeallocation(
  situation: TacticalSituation,
  parameters: BotParameters,
  context?: EnergyContext
): DeallocateEnergyAction[] {
  const { status } = situation
  const actions: DeallocateEnergyAction[] = []

  const ctx = context ?? {
    willBurn: true,
    willCoast: false,
    willRotate: false,
    willTransfer: false,
    hasTargetInRange: situation.primaryTarget != null && Array.from(situation.primaryTarget.firingSolutions.values()).some(s => s.inRange),
    hasTarget: situation.primaryTarget != null,
    underThreat: situation.primaryThreat != null && situation.primaryThreat.weaponsInRange.some(w => w.inRange),
  }

  const budget = buildEnergyBudget(situation, parameters, ctx)
  const budgetedTypes = new Set(budget.map(r => r.type))

  // IMPORTANT: Game engine targets subsystems by TYPE via findIndex.
  // Track which types we've already deallocated to avoid duplicates.
  const deallocatedTypes = new Set<SubsystemType>()

  // Deallocate from subsystems not in budget
  // We only check the first subsystem of each type (since that's what the engine targets)
  for (const sub of status.subsystems) {
    if (sub.energy <= 0) continue
    if (deallocatedTypes.has(sub.type)) continue

    const gameSubsystem = situation.botPlayer.ship.subsystems.find(s => s.type === sub.type)
    if (!gameSubsystem || gameSubsystem.allocatedEnergy <= 0) continue

    if (sub.broken) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: sub.type,
          amount: gameSubsystem.allocatedEnergy,
        },
      })
      deallocatedTypes.add(sub.type)
      continue
    }

    if (!budgetedTypes.has(sub.type)) {
      actions.push({
        type: 'deallocate_energy',
        playerId: situation.botPlayer.id,
        data: {
          subsystemType: sub.type,
          amount: gameSubsystem.allocatedEnergy,
        },
      })
      deallocatedTypes.add(sub.type)
    }
  }

  // Also deallocate if heat is dangerously high
  if (status.heatPercent >= parameters.panicHeatThreshold) {
    const nonEssential = status.subsystems
      .filter(s => s.energy > 0 && s.type !== 'engines' && s.type !== 'shields' && !deallocatedTypes.has(s.type))
      .sort((a, b) => b.energy - a.energy)

    for (const sub of nonEssential) {
      if (budgetedTypes.has(sub.type)) {
        const gameSubsystem = situation.botPlayer.ship.subsystems.find(s => s.type === sub.type)
        if (gameSubsystem && gameSubsystem.allocatedEnergy > 0) {
          actions.push({
            type: 'deallocate_energy',
            playerId: situation.botPlayer.id,
            data: {
              subsystemType: sub.type,
              amount: gameSubsystem.allocatedEnergy,
            },
          })
          deallocatedTypes.add(sub.type)
        }
        break
      }
    }
  }

  return actions
}
