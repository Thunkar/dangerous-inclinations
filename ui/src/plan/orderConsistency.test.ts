/**
 * The preview and the referee agree on every order of a turn.
 *
 * The same states and action sets the engine's order suite plays
 * (`engine/src/test/game/actionOrder.scenarios.ts`) are held as the plan the
 * UI would build: the steps in every order, and the powers beside them (a plan
 * sends its powers first, so they are not part of the order). The preview must
 * report no issue exactly when the engine accepts the actions `planActions`
 * builds, and for an accepted turn its final position and facing, the energy
 * on every tile and the fuel left must be what the engine's ship ends with.
 * One test a table walks every ordering and names the first that disagrees.
 *
 * A power on a tile a step also uses is dropped by the plan rather than sent
 * (the step leaves its energy there), so the tables the engine refuses for
 * that reason are accepted here, and the two still agree.
 */
import { describe, expect, it } from 'vitest'
import type { GameState, SubsystemId } from '@dangerous-inclinations/engine'
import { executeTurn, viewFor } from '@dangerous-inclinations/engine'
import {
  ORDER_TABLES,
  label,
  orderings,
  type Item,
} from '../../../engine/src/test/game/actionOrder.scenarios.ts'
import { checkEach } from '../../../engine/src/test/testUtils.ts'
import { planActions, previewPlan, type PlanExtras, type PlanStep } from './preview'

const NO_EXTRAS: PlanExtras = { repair: null, dockSale: null, escorts: [], seizes: [] }

function stepOf(item: Exclude<Item, { kind: 'power' }>, index: number): PlanStep {
  const id = `s-${index}`
  switch (item.kind) {
    case 'rotate':
      return { id, kind: 'rotate' }
    case 'coast':
      return { id, kind: 'move', move: { kind: 'coast', scoop: item.scoop } }
    case 'burn':
      return { id, kind: 'move', move: { kind: 'burn', intensity: item.intensity, adjustment: 0 } }
    case 'jump':
      return { id, kind: 'move', move: { kind: 'jump', destinationWellId: item.to, adjustment: 0 } }
    case 'fire':
      return {
        id,
        kind: 'fire',
        subsystemId: item.tile,
        targetId: item.target,
        criticalTarget: 'engines',
        compensateRecoil: item.compensate ?? false,
        count: item.count ?? 1,
      }
    case 'scan':
      return { id, kind: 'scan', targetId: item.target, peekSlot: 'forward-0' }
  }
}

/**
 * The plan for an ordering of the table's steps. The plan always holds a move:
 * a turn that names none coasts after everything else, so that is where it goes.
 */
function planOf(ordering: readonly Exclude<Item, { kind: 'power' }>[]): PlanStep[] {
  const steps = ordering.map(stepOf)
  if (!steps.some(s => s.kind === 'move'))
    steps.push({ id: 's-coast', kind: 'move', move: { kind: 'coast', scoop: false } })
  return steps
}

function judge(state: GameState, steps: PlanStep[], powers: Record<SubsystemId, number>) {
  const view = viewFor(state, 'p1')
  const me = view.me!
  const preview = previewPlan(view, me, steps, powers)
  const actions = planActions(me, steps, preview, NO_EXTRAS)
  const result = executeTurn(state, actions)
  return { preview, result }
}

describe('the preview in every order', () => {
  it.each(ORDER_TABLES)('$name: agrees with the referee', table => {
    const powers: Record<SubsystemId, number> = {}
    for (const item of table.items) if (item.kind === 'power') powers[item.tile] = item.amount
    const steps = table.items.filter(
      (i): i is Exclude<Item, { kind: 'power' }> => i.kind !== 'power'
    )

    checkEach(orderings(steps), label, ordering => {
      const { preview, result } = judge(table.build(), planOf(ordering), powers)
      expect({ issues: preview.issues.length > 0, errors: result.errors ?? [] }).toMatchObject({
        issues: result.errors !== undefined,
      })
      if (result.errors) return

      const ship = result.gameState.players.find(p => p.id === 'p1')!.ship
      expect({ ...preview.finalPosition.position, facing: preview.finalPosition.facing }).toEqual({
        wellId: ship.wellId,
        ring: ship.ring,
        sector: ship.sector,
        facing: ship.facing,
      })
      expect(Object.fromEntries(preview.loadout.map(s => [s.id, s.allocatedEnergy]))).toEqual(
        Object.fromEntries(ship.subsystems.map(s => [s.id, s.allocatedEnergy]))
      )
      expect(preview.projectedFuel).toBe(ship.reactionMass)
    })
  })
})
