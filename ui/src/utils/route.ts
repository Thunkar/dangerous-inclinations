/**
 * Reading a route out loud.
 *
 * A {@link MovementPlan} is a list of steps with a facing carried between
 * them; turning that into words is the same job at the table as it is in the
 * game, so both the turn column's planner and the standalone tool call these
 * and the two cannot end up describing the same burn differently.
 */
import type { Facing, MovementPlan, MovementStep, Position } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'

export const placeLabel = (p: Position) => `${getWellName(p.wellId)} R${p.ring} S${p.sector}`

/** Facing a burn needs: prograde burns outward, retrograde inward. Coasts and jumps keep the facing. */
export function facingFor(step: MovementStep, before: Facing): Facing {
  if (step.actionType === 'burn_prograde') return 'prograde'
  if (step.actionType === 'burn_retrograde') return 'retrograde'
  return before
}

/** One leg of a route: what it does, and whether the nose has to come round first. */
export interface Leg {
  text: string
  rotate: boolean
  /** Fuel this leg spends; negative is fuel the scoop brought in. */
  massCost: number
}

/** One step of a planned route, in the words of the move row. */
export function legText(step: MovementStep, facingAfter: Facing): string {
  if (step.actionType === 'coast') return `coast${step.massCost < 0 ? ' + scoop' : ''}`
  if (step.actionType === 'well_transfer') return `jump → ${getWellName(step.to.wellId)}`
  const phase = step.sectorAdjustment
    ? ` ${step.sectorAdjustment > 0 ? '+' : ''}${step.sectorAdjustment}`
    : ''
  return `${step.burnIntensity ?? 'soft'} burn ${facingAfter === 'prograde' ? 'out' : 'in'}${phase}`
}

/** The same step spelled out in full, for a tooltip that has the room. */
export function describeStep(step: MovementStep, facingBefore: Facing): string {
  const needed = facingFor(step, facingBefore)
  return `${legText(step, needed)}${needed !== facingBefore ? ' (rotate first)' : ''}`
}

/** Every step described, with the facing carried from one to the next. */
export function routeLegs(steps: MovementStep[], facing: Facing): Leg[] {
  const out: Leg[] = []
  let current = facing
  for (const step of steps) {
    const needed = facingFor(step, current)
    out.push({ text: legText(step, needed), rotate: needed !== current, massCost: step.massCost })
    current = needed
  }
  return out
}

/** "⚡ Fastest" → "fastest": the engine labels for people, we label for the plate. */
export const routeName = (route: MovementPlan, index: number) =>
  (route.label ?? `route ${index + 1}`).replace(/^[^\p{L}]+/u, '').toLowerCase()
