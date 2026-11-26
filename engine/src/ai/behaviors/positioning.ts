/**
 * Movement. Turns the first step of a movement plan into an engine action
 * the current ship can actually perform, checked against the engine's
 * `legalMoves`. Anything that fails becomes a coast.
 */
import type { BurnIntensity, Facing, Position, ShipState } from '../../models/game.ts'
import type { SubsystemId } from '../../models/subsystems.ts'
import { getSubsystemConfig } from '../../models/subsystems.ts'
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
} from '../../models/rings.ts'
import { findJump, phasedJumpDestination } from '../../models/gravityWells.ts'
import { positionOf } from '../../game/geometry.ts'
import { legalMoves, phasingAllowed } from '../../game/movement.ts'
import { foldEngines, foldFuel } from '../../game/fold.ts'
import type { MovementPreview } from '../../game/movement.ts'
import type { MovementPlan } from '../movementPlanner/index.ts'
import { getFirstAction } from '../movementPlanner/index.ts'
import type { BotStatus } from '../types.ts'

export interface MovementChoice {
  kind: 'coast' | 'burn' | 'jump' | 'fold'
  /** Engine's projection input (a fold is previewed as a jump that lands where it names). */
  preview: MovementPreview
  /** Facing the ship must have when the movement executes; null = any. */
  requiredFacing: Facing | null
  /** Energy the engines need (0 for a coast). */
  engineEnergy: number
  /** Reaction mass the movement spends. */
  massCost: number
  /** The plan counted on scooping during this coast. */
  wantsScoop: boolean
  burnIntensity?: BurnIntensity
  sectorAdjustment?: number
  destinationWellId?: string
  /**
   * A fold: where it puts the ship, the drive's energy and the energy it puts
   * on the engines, both heat at the check.
   */
  fold?: { to: Position; driveId: SubsystemId; energy: number; engines: number }
}

/** Heat the move itself puts on the track: the engines' cubes, and the drive's on a fold. */
export function moveHeat(movement: MovementChoice): number {
  return movement.engineEnergy + (movement.fold ? movement.fold.energy + movement.fold.engines : 0)
}

export function coastChoice(wantsScoop: boolean): MovementChoice {
  return {
    kind: 'coast',
    preview: { kind: 'coast' },
    requiredFacing: null,
    engineEnergy: 0,
    massCost: 0,
    wantsScoop,
  }
}

/**
 * A fold to `to` with the drive `driveId` (RULES §Movement, Fold): the
 * turn's whole move, with no drift and the facing kept.
 */
export function foldChoice(to: Position, driveId: SubsystemId): MovementChoice {
  return {
    kind: 'fold',
    preview: { kind: 'jump', jumpDestination: to },
    requiredFacing: null,
    engineEnergy: 0,
    massCost: foldFuel(),
    wantsScoop: false,
    fold: {
      to,
      driveId,
      energy: getSubsystemConfig('jump_drive').minEnergy,
      engines: foldEngines(),
    },
  }
}

/**
 * The cheapest way off a station berth: a soft burn, outward if there is a
 * ring above and inward otherwise, rotating if the nose is the wrong way
 * round.
 *
 * A berth is as good a place to skim from as any (RULES §Coast), so a tank
 * that runs down in port is not a ship stranded there. What the berth cannot
 * do is dock again: this is the move that turns the next arrival back into a
 * visit.
 */
export function castOffChoice(ship: ShipState): MovementChoice | null {
  const burn = legalMoves(ship).burns.find(b => b.intensity === 'soft')
  if (!burn) return null
  return {
    kind: 'burn',
    preview: { kind: 'burn', burnIntensity: 'soft', sectorAdjustment: 0 },
    requiredFacing: burn.facing,
    engineEnergy: burn.engineEnergy,
    massCost: burn.fuel,
    wantsScoop: false,
    burnIntensity: 'soft',
    sectorAdjustment: 0,
  }
}

/** Whether the engine takes this burn from `ship` now, rotating to `facing` first if need be. */
function burnIsLegal(
  ship: ShipState,
  intensity: BurnIntensity,
  facing: Facing,
  adjustment: number
): boolean {
  return legalMoves(ship).burns.some(
    b => b.intensity === intensity && b.facing === facing && phasingAllowed(b, adjustment)
  )
}

/** Whether the engine takes this jump from `ship` now. */
function jumpIsLegal(ship: ShipState, destinationWellId: string, adjustment = 0): boolean {
  return legalMoves(ship).jumps.some(
    j => j.destinationWellId === destinationWellId && phasingAllowed(j, adjustment)
  )
}

/**
 * The first step of `plan` as a movement the ship can perform now, or null
 * when the step is impossible (the caller then coasts and replans).
 */
export function movementFromPlan(
  ship: ShipState,
  status: BotStatus,
  plan: MovementPlan
): MovementChoice | null {
  const first = getFirstAction(plan)
  if (!first) return null

  if (first.actionType === 'coast') {
    return coastChoice(first.massCost < 0 && !status.scoop.isBroken)
  }

  if (first.actionType === 'burn') {
    const intensity = first.burnIntensity ?? 'soft'
    const adjustment = first.sectorAdjustment
    const facing = first.targetFacing ?? ship.facing
    if (!burnIsLegal(ship, intensity, facing, adjustment)) return null
    return {
      kind: 'burn',
      preview: { kind: 'burn', burnIntensity: intensity, sectorAdjustment: adjustment },
      requiredFacing: facing,
      engineEnergy: BURN_COSTS[intensity].energy,
      massCost: calculateBurnMassCost(BURN_COSTS[intensity].mass, adjustment),
      wantsScoop: false,
      burnIntensity: intensity,
      sectorAdjustment: adjustment,
    }
  }

  const destination = first.destinationWellId!
  const adjustment = first.sectorAdjustment
  if (!jumpIsLegal(ship, destination, adjustment)) return null
  const jump = findJump(positionOf(ship), destination)!
  return {
    kind: 'jump',
    preview: { kind: 'jump', jumpDestination: phasedJumpDestination(jump, adjustment) },
    // A jump is a burn out of the well.
    requiredFacing: 'prograde',
    engineEnergy: WELL_TRANSFER_COSTS.energy,
    massCost: calculateJumpMassCost(adjustment, status.hasCompressor),
    wantsScoop: false,
    sectorAdjustment: adjustment,
    destinationWellId: destination,
  }
}
