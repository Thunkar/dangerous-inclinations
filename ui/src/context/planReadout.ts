/**
 * What the plan reads as: everything `PlanContext` shows that follows from
 * the choices and holds none of its own state. The preview of the turn, the
 * moves the loadout can make, the targets each step reaches, the sale a
 * visit will make and the actions the plan sends are all asked of
 * `plan/preview.ts` and the engine here, once per change of the choices.
 *
 * It is a hook the provider calls, not a context: a second context would
 * re-render its readers on its own clock, and every reader of the plan reads
 * both halves.
 */
import { useCallback, useMemo } from 'react'
import type { GameView, Player, SubsystemId } from '@dangerous-inclinations/engine'
import {
  SELL_NOTHING,
  chosenSale,
  getAdjustmentRange,
  getJumpAdjustmentRange,
  getJumpOptions,
  heatAtCheck,
  isMooredMidTurn,
  ringVelocity,
} from '@dangerous-inclinations/engine'
import {
  criticalFrom as criticalFromPlan,
  moveReadiness,
  planActions,
  previewPlan,
  reachesOnlyBeforeMove,
  salvageStepKey,
  seizeKey,
  targetsInRange as targetsInRangeOf,
  targetsOutOfReach as targetsOutOfReachOf,
  type MoveStep,
  type PlanStep,
  type StepContext,
} from '../plan/preview'

/** The choices the readout is read from: `PlanContext`'s state. */
export interface PlanChoices {
  steps: PlanStep[]
  powers: Record<SubsystemId, number>
  repairChoice: SubsystemId | null
  dockChoice: string | null
}

export function usePlanReadout(
  view: GameView,
  me: Player,
  { steps, powers, repairChoice, dockChoice }: PlanChoices,
  /** The move step a plan always holds, made when a plan somehow has none: keep it stable. */
  defaultMove: () => MoveStep
) {
  const preview = useMemo(() => previewPlan(view, me, steps, powers), [view, me, steps, powers])
  const { used, loadout: pendingSubsystems, stepStart, moveFrom, targets } = preview

  const moveStep = useMemo(
    () => steps.find((s): s is MoveStep => s.kind === 'move') ?? defaultMove(),
    [steps, defaultMove]
  )

  const projectedHeat = heatAtCheck({ ...me.ship, subsystems: [...pendingSubsystems] })

  const criticalFrom = useCallback(
    (step: PlanStep) => criticalFromPlan(me, preview.powers, steps, step),
    [me, preview.powers, steps]
  )
  const usedBy = useCallback((subsystemId: SubsystemId) => used[subsystemId] ?? null, [used])

  /** Where a step starts: a step not in the plan is asked about from where the ship is now. */
  const startOf = useCallback(
    (step: PlanStep): StepContext => {
      const index = steps.findIndex(s => s.id === step.id)
      return index >= 0 ? stepStart[index] : { position: me.ship, facing: me.ship.facing }
    },
    [steps, stepStart, me.ship]
  )
  const targetsInRange = useCallback(
    (step: PlanStep) => targetsInRangeOf(view, me, step, startOf(step), pendingSubsystems, targets),
    [view, me, startOf, pendingSubsystems, targets]
  )
  const targetsOutOfReach = useCallback(
    (step: PlanStep) =>
      targetsOutOfReachOf(view, me, step, startOf(step), pendingSubsystems, targets),
    [view, me, startOf, pendingSubsystems, targets]
  )
  const reachesBeforeMove = useCallback(
    (step: PlanStep) => reachesOnlyBeforeMove(view, me, steps, step, pendingSubsystems),
    [view, me, steps, pendingSubsystems]
  )

  const jumpOptions = useMemo(() => getJumpOptions(moveFrom.position), [moveFrom])
  // Moored only on a berth held since the turn began: a railgun's recoil onto
  // a station before the move does not dock the ship, and its coast drifts.
  const moored = useMemo(
    () => isMooredMidTurn(view.stations, me.ship, moveFrom.position),
    [view.stations, me.ship, moveFrom]
  )
  const jumpAdjustmentRange = useMemo(() => {
    const move = moveStep.move
    const option =
      (move.kind === 'jump'
        ? jumpOptions.find(o => o.destination.wellId === move.destinationWellId)
        : undefined) ?? jumpOptions[0]
    return option ? getJumpAdjustmentRange(option) : { min: 0, max: 0 }
  }, [jumpOptions, moveStep])
  const adjustmentRange = useMemo(
    () => getAdjustmentRange(ringVelocity(moveFrom.position.wellId, moveFrom.position.ring)),
    [moveFrom]
  )
  const { rotateReady, burnReady, jumpReady } = useMemo(
    () => moveReadiness(view, me, steps, preview.powers),
    [view, me, steps, preview.powers]
  )
  const { scoopGain } = preview

  const { dockOffer } = preview
  const dockSale = !dockOffer
    ? null
    : dockChoice === SELL_NOTHING && dockOffer.options.length > 0
      ? SELL_NOTHING
      : (chosenSale(dockOffer, dockChoice ?? undefined)?.sale ?? null)
  // A seize, salvage or mark step stays where it was put when the move
  // changes: if it no longer holds there, the sequence says so (the preview's issues).
  const seizeChoices = useMemo(
    () => steps.flatMap(s => (s.kind === 'seize' ? [seizeKey(s)] : [])),
    [steps]
  )
  const salvageChoice = useMemo(
    () =>
      steps
        .filter((s): s is Extract<PlanStep, { kind: 'salvage' }> => s.kind === 'salvage')
        .map(salvageStepKey)[0] ?? null,
    [steps]
  )
  const markChoices = useMemo(
    () => steps.flatMap(s => (s.kind === 'mark' ? [s.carrierId] : [])),
    [steps]
  )

  const actions = useMemo(
    () =>
      planActions(me, steps, preview, {
        repair: repairChoice,
        dockSale: dockChoice,
      }),
    [me, steps, preview, repairChoice, dockChoice]
  )

  return {
    preview,
    moveStep,
    projectedHeat,
    criticalFrom,
    usedBy,
    targetsInRange,
    targetsOutOfReach,
    reachesBeforeMove,
    jumpOptions,
    moored,
    jumpAdjustmentRange,
    adjustmentRange,
    rotateReady,
    burnReady,
    jumpReady,
    scoopGain,
    dockSale,
    seizeChoices,
    salvageChoice,
    markChoices,
    actions,
  }
}
