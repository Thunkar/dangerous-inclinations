/**
 * Reading a route out loud.
 *
 * A {@link MovementPlan} is a list of steps, each with the facing it is made
 * in; turning that into words is the same job at the table as it is in the
 * game, so both the turn column's planner and the standalone tool call these
 * and the two cannot end up describing the same burn differently.
 */
import type { MovementPlan, MovementStep, Position } from '@dangerous-inclinations/engine'
import { fill, getWellName } from '@dangerous-inclinations/engine'
import { ACTIONS } from '../text/actions'

const R = ACTIONS.route

/** How many turns ahead a route search looks before it gives up: the turn column and the tool alike. */
export const ROUTE_SEARCH_TURNS = 20

export const placeLabel = (p: Position) =>
  fill(R.place, { well: getWellName(p.wellId), ring: p.ring, sector: p.sector })

/** One leg of a route: what it does, and whether the nose has to come round first. */
interface Leg {
  text: string
  rotate: boolean
  /** Fuel this leg spends; negative is fuel the scoop brought in. */
  massCost: number
}

/** One step of a planned route, in the words of the move row. */
function legText(step: MovementStep): string {
  if (step.actionType === 'coast') return step.massCost < 0 ? R.coastScoop : R.coast
  const leg =
    step.actionType === 'well_transfer'
      ? fill(R.jump, { well: getWellName(step.to.wellId) })
      : fill(R.burn, {
          intensity: R.intensities[step.burnIntensity ?? 'soft'],
          direction: step.from.facing === 'prograde' ? R.out : R.in,
        })
  const adjust = step.sectorAdjustment
  return adjust ? fill(R.phased, { leg, phase: `${adjust > 0 ? '+' : ''}${adjust}` }) : leg
}

/**
 * The same step spelled out in full, for a tooltip that has the room. The
 * planner says which way each step faces and whether the ship turns for it.
 */
export function describeStep(step: MovementStep): string {
  const leg = legText(step)
  return step.requiresRotation ? fill(R.rotateFirst, { leg }) : leg
}

/** Every step described. */
export function routeLegs(steps: MovementStep[]): Leg[] {
  return steps.map(step => ({
    text: legText(step),
    rotate: step.requiresRotation,
    massCost: step.massCost,
  }))
}

/** "⚡ Fastest" → "fastest": the engine labels for people, we label for the plate. */
export const routeName = (route: MovementPlan, index: number) =>
  (route.label ?? fill(R.unnamed, { n: index + 1 })).replace(/^[^\p{L}]+/u, '').toLowerCase()
