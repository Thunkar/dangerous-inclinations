/**
 * PlanContext: the turn you are putting together.
 *
 * It holds what the player chose (the steps, the powers, a repair, the dock
 * job, Escort markers, what a click is currently picking) and the verbs that
 * edit them. Every number shown for the plan is `plan/preview.ts`, which reads
 * the choices against the engine's pure functions; the server is the referee
 * and nothing here advances state. The route planner keeps its own state in
 * `RoutePlanContext`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  BurnIntensity,
  DockJob,
  DockJobs,
  Facing,
  JumpOption,
  Player,
  PlayerAction,
  SlotView,
  Subsystem,
  SubsystemId,
} from '@dangerous-inclinations/engine'
import {
  chosenDockJob,
  energyStepOf,
  getAdjustmentRange,
  getJumpAdjustmentRange,
  getJumpOptions,
  getSubsystemConfig,
  heatFromCubes,
  isMooredAt,
  ringVelocity,
} from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'
import {
  criticalFrom as criticalFromPlan,
  moveReadiness,
  planActions,
  powerableTile,
  previewPlan,
  targetsInRange as targetsInRangeOf,
  targetsOutOfReach as targetsOutOfReachOf,
  type FireStep,
  type MoveChoice,
  type MoveReadiness,
  type MoveStep,
  type PlanStep,
  type ScanStep,
  type StepContext,
  type Target,
} from '../plan/preview'

/** What a click on an opponent's loadout is currently for. */
export type Picking =
  | { kind: 'crit'; stepId: string }
  | { kind: 'peek'; stepId: string }
  /** Choosing a destination sector for the route planner. */
  | { kind: 'destination' }
  | null

interface PlanContextValue {
  me: Player
  isMyTurn: boolean
  /** The turn's controls take no input: not your turn, or a turn still playing out. */
  disabled: boolean
  steps: PlanStep[]
  /** The single move step; there is always exactly one. */
  moveStep: MoveStep
  /**
   * The plan's power actions: the energy it puts on shields, a rack or a
   * sensor, by tile. Empty at the start of every turn, and never holds a tile
   * the plan also fires or scans with (each tile does one thing a turn).
   */
  powers: Record<SubsystemId, number>
  /** The step that uses a tile, if one does: a fired rack or a scanning sensor is up anyway. */
  usedBy: (subsystemId: SubsystemId) => 'fire' | 'scan' | null
  /** My subsystems as the plan leaves them: an empty loadout plus the powers and the steps' draws. */
  pendingSubsystems: Subsystem[]
  /** The lowest d10 face that is a critical for this fire step (`plan/preview.ts`). */
  criticalFrom: (step: PlanStep) => number
  /** Ship position and facing at the start of each step (index-aligned with `steps`). */
  stepStart: StepContext[]
  finalPosition: StepContext
  /** Where the move step starts from, for jump options and phasing limits. */
  moveFrom: StepContext
  jumpOptions: JumpOption[]
  adjustmentRange: { min: number; max: number }
  /** Phasing a jump may use: bounded by the arrival arc, not by the ring. */
  jumpAdjustmentRange: { min: number; max: number }
  /** Docked at a station: a coast holds the berth, only a burn casts off. */
  moored: boolean
  /** Whether each move can be taken from the loadout as planned (see {@link MoveReadiness}). */
  rotateReady: MoveReadiness
  burnReady: Record<BurnIntensity, MoveReadiness>
  jumpReady: MoveReadiness
  scoopGain: number
  /** Heat at the check: the track as it stands plus every point of energy the plan puts on a tile. */
  projectedHeat: number
  /** Fuel left when the plan is done, scoop gain included. */
  projectedFuel: number
  issues: string[]
  actions: PlayerAction[]
  picking: Picking
  /** Weapon whose range is drawn on the board. */
  focusWeaponId: SubsystemId | null
  targets: Target[]
  targetsInRange: (step: PlanStep) => Target[]
  /**
   * Targets this step may legally fire at but would not connect with: a
   * missile is launched at anyone in the well and only its own flight decides
   * whether it catches them, so a launch at a ship half an orbit ahead is a
   * legal way to throw one away.
   */
  targetsOutOfReach: (step: PlanStep) => Target[]
  /**
   * Power a shield, rack or sensor at a level (0 is off): the Systems step's
   * segments. A tile a step fires or scans with ignores it, because the step
   * already leaves its energy there.
   */
  setEnergyTo: (subsystemId: SubsystemId, value: number) => void
  setMove: (move: MoveChoice) => void
  /**
   * Set the move and the facing it needs: a rotation goes in before the move
   * when the ship points the wrong way, and comes out when it does not.
   */
  applyMove: (move: MoveChoice, facing: Facing | null) => void
  toggleRotate: () => void
  addFire: (subsystemId: SubsystemId) => void
  addScan: () => void
  updateStep: (id: string, patch: Partial<FireStep> & Partial<ScanStep>) => void
  removeStep: (id: string) => void
  reorderStep: (id: string, direction: -1 | 1) => void
  setPicking: (picking: Picking) => void
  /** A slot on an opponent's loadout was clicked while picking. */
  pickSlot: (targetId: string, slotId: SubsystemId) => void
  /** An opponent's ship or loadout was clicked: aim the step being edited at them. */
  pickTarget: (targetId: string) => void
  setFocusWeapon: (subsystemId: SubsystemId | null) => void
  reset: () => void
  /**
   * A broken tile to fix at the heat check. It only lands if the turn makes no
   * heat at all, so the picker is only offered while that is still true.
   */
  repairChoice: SubsystemId | null
  setRepairChoice: (id: SubsystemId | null) => void
  /** Tiles that could be named this turn: broken, and the ship can still end cold. */
  repairable: SubsystemId[]
  /**
   * The jobs on offer when the planned turn arrives at a station (not a berth
   * already held) with more than one job the visit could do, as the engine
   * reads them with the fuel the plan leaves aboard; null otherwise, which is
   * when there is nothing to choose.
   */
  dockOffer: DockJobs | null
  /** The job the visit will do: the one picked, if on offer, or the engine's default. */
  dockJob: DockJob | null
  setDockJob: (job: DockJob | null) => void
  /**
   * The rivals an Escort marker could go on if the turn ends where the plan
   * ends it (the engine's `escortCandidates`), and how many markers are in
   * hand; null when there is nobody, which is when there is nothing to choose.
   */
  escortOffer: { carriers: string[]; markers: number } | null
  /** Carriers the player chose to mark: a "you may", so none until picked. */
  escortChoices: string[]
  toggleEscort: (carrierId: string) => void
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

let stepCounter = 0
const stepId = () => `step-${++stepCounter}`

const bySlotOrder = (a: SlotView, b: SlotView) =>
  a.group === b.group ? a.index - b.index : a.group === 'forward' ? -1 : 1

/**
 * A turn opens on a plain coast: nothing holds cubes between turns, so the
 * scoop is a chip you tick on the turns you want it.
 */
function defaultSteps(): PlanStep[] {
  return [{ id: stepId(), kind: 'move', move: { kind: 'coast', scoop: false } }]
}

/** The steps with the rotation (if one is needed) just before the move. */
function withRotation(steps: PlanStep[], rotate: boolean): PlanStep[] {
  const next: PlanStep[] = steps.filter(s => s.kind !== 'rotate')
  const moveIndex = Math.max(
    0,
    next.findIndex(s => s.kind === 'move')
  )
  if (rotate) next.splice(moveIndex, 0, { id: stepId(), kind: 'rotate' })
  return next
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { view } = useGame()
  const me = view.me
  if (!me) throw new Error('PlanProvider needs a seated player')
  return <SeatedPlanProvider me={me}>{children}</SeatedPlanProvider>
}

function SeatedPlanProvider({ me, children }: { me: Player; children: ReactNode }) {
  const { view, readOnly, isAnimating } = useGame()
  // Nothing is powered until the plan powers it: last turn's energy is cleared
  // when this turn executes, so it is never the starting point.
  const [powers, setPowers] = useState<Record<SubsystemId, number>>({})
  const [steps, setSteps] = useState<PlanStep[]>(() => defaultSteps())
  const [picking, setPicking] = useState<Picking>(null)
  const [focusWeaponId, setFocusWeaponId] = useState<SubsystemId | null>(null)
  const [repairChoice, setRepairChoiceState] = useState<SubsystemId | null>(null)
  const [dockChoice, setDockChoice] = useState<DockJob | null>(null)
  const [escortChoices, setEscortChoices] = useState<string[]>([])

  const isMyTurn = !readOnly && view.activePlayerId === me.id && view.phase === 'active'
  const disabled = !isMyTurn || isAnimating

  const reset = useCallback(() => {
    setPowers({})
    setSteps(defaultSteps())
    setPicking(null)
    setFocusWeaponId(null)
    setDockChoice(null)
    setEscortChoices([])
  }, [])

  // A new turn (or a fresh state after our own turn) starts a fresh plan.
  useEffect(() => {
    reset()
    // Keying on the turn and the active seat is what actually means "new turn".
  }, [view.turn, view.activePlayerId, readOnly, reset])

  const preview = useMemo(() => previewPlan(view, me, steps, powers), [view, me, steps, powers])
  const { used, loadout: pendingSubsystems, stepStart, finalPosition, moveFrom, targets } = preview

  const moveStep = useMemo(
    () => steps.find((s): s is MoveStep => s.kind === 'move') ?? (defaultSteps()[0] as MoveStep),
    [steps]
  )

  const projectedHeat = me.ship.heat.currentHeat + heatFromCubes(pendingSubsystems)

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

  const jumpOptions = useMemo(() => getJumpOptions(moveFrom.position), [moveFrom])
  const moored = useMemo(
    () => isMooredAt(view.stations, moveFrom.position),
    [view.stations, moveFrom]
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
    () => moveReadiness(me, pendingSubsystems, moveFrom, moveStep.move),
    [me, pendingSubsystems, moveFrom, moveStep]
  )
  const scoopGain = useMemo(() => {
    const scoop = pendingSubsystems.find(s => s.id === 'scoop')
    if (!scoop || scoop.isBroken) return 0
    return ringVelocity(moveFrom.position.wellId, moveFrom.position.ring)
  }, [pendingSubsystems, moveFrom])

  const { dockOffer, escortOffer, repairable } = preview
  const dockJob = dockOffer ? chosenDockJob(dockOffer, dockChoice ?? undefined) : null
  // A pick the plan no longer offers is dropped rather than refused, so editing
  // the move never leaves an illegal action on the sheet.
  useEffect(() => {
    if (dockChoice !== null && !dockOffer?.jobs.some(o => o.job === dockChoice)) setDockChoice(null)
  }, [dockChoice, dockOffer])
  useEffect(() => {
    if (escortChoices.some(id => !escortOffer?.carriers.includes(id)))
      setEscortChoices(chosen => chosen.filter(id => escortOffer?.carriers.includes(id)))
  }, [escortChoices, escortOffer])
  useEffect(() => {
    if (repairChoice !== null && !repairable.includes(repairChoice)) setRepairChoiceState(null)
  }, [repairChoice, repairable])

  const toggleEscort = useCallback(
    (carrierId: string) =>
      setEscortChoices(chosen =>
        chosen.includes(carrierId)
          ? chosen.filter(id => id !== carrierId)
          : // One marker per ship and one ship per marker: at the cap, a new pick is refused.
            chosen.length < (escortOffer?.markers ?? 0)
            ? [...chosen, carrierId]
            : chosen
      ),
    [escortOffer]
  )
  const setRepairChoice = useCallback((id: SubsystemId | null) => setRepairChoiceState(id), [])

  const actions = useMemo(
    () =>
      planActions(me, steps, preview, {
        repair: repairChoice,
        dockJob: dockChoice,
        escorts: escortChoices,
      }),
    [me, steps, preview, repairChoice, dockChoice, escortChoices]
  )

  // --- mutators ------------------------------------------------------------

  const setEnergyTo = useCallback(
    (subsystemId: SubsystemId, value: number) => {
      const sub = powerableTile(me, used, subsystemId)
      if (!sub) return
      const config = getSubsystemConfig(sub.type)
      const step = energyStepOf(sub.type)
      const wanted =
        value < config.minEnergy ? 0 : Math.min(config.maxEnergy, Math.floor(value / step) * step)
      setPowers(prev => ({ ...prev, [subsystemId]: wanted }))
    },
    [me, used]
  )

  /** A tile a step starts using stops being a power choice: the step leaves its energy on it. */
  const dropPower = useCallback((subsystemId: SubsystemId | undefined) => {
    if (!subsystemId) return
    setPowers(prev => {
      if (!(subsystemId in prev)) return prev
      const next = { ...prev }
      delete next[subsystemId]
      return next
    })
  }, [])

  const setMove = useCallback((move: MoveChoice) => {
    setSteps(prev => prev.map(s => (s.kind === 'move' ? { ...s, move } : s)))
  }, [])

  const applyMove = useCallback(
    (move: MoveChoice, facing: Facing | null) => {
      const rotate = facing !== null && facing !== me.ship.facing
      setSteps(prev =>
        withRotation(prev, rotate).map(s => (s.kind === 'move' ? { ...s, move } : s))
      )
    },
    [me.ship.facing]
  )

  const toggleRotate = useCallback(() => {
    setSteps(prev => withRotation(prev, !prev.some(s => s.kind === 'rotate')))
  }, [])

  const addFire = useCallback(
    (subsystemId: SubsystemId) => {
      setSteps(prev => {
        if (prev.some(s => s.kind === 'fire' && s.subsystemId === subsystemId)) return prev
        return [
          ...prev,
          {
            id: stepId(),
            kind: 'fire',
            subsystemId,
            targetId: targets.length === 1 ? targets[0].id : null,
            criticalTarget: 'engines',
            compensateRecoil: false,
            count: 1,
          },
        ]
      })
      setFocusWeaponId(subsystemId)
      // A rack that fires is up anyway: the shot is its one thing this turn.
      dropPower(subsystemId)
    },
    [targets, dropPower]
  )

  const addScan = useCallback(() => {
    setSteps(prev =>
      prev.some(s => s.kind === 'scan')
        ? prev
        : [...prev, { id: stepId(), kind: 'scan', targetId: null, peekSlot: null }]
    )
    // A sensor that scans widens the range anyway, for every shot after the scan.
    dropPower(me.ship.subsystems.find(s => s.type === 'sensor_array' && !s.isBroken)?.id)
  }, [dropPower, me.ship.subsystems])

  /**
   * Which tile a scan should look at by default: the first face-down one, in
   * loadout order. If every tile is already known to you, any slot will do. The
   * engine peeks the first face-down slot it can find and tells you which.
   */
  const defaultPeekSlot = useCallback(
    (targetId: string | null): SubsystemId | null => {
      if (!targetId) return null
      const target = view.players.find(p => p.id === targetId)
      if (!target) return null
      const slots = [...target.slots].sort(bySlotOrder)
      return slots.find(slot => slot.type === null)?.id ?? slots[0]?.id ?? null
    },
    [view.players]
  )

  const updateStep = useCallback(
    (id: string, patch: Partial<FireStep> & Partial<ScanStep>) => {
      setSteps(prev =>
        prev.map(s => {
          if (s.id !== id) return s
          const next = { ...s, ...patch } as PlanStep
          // Aiming a scan at someone else invalidates the slot picked on the old loadout.
          if (
            next.kind === 'scan' &&
            s.kind === 'scan' &&
            patch.targetId !== undefined &&
            patch.targetId !== s.targetId
          ) {
            next.peekSlot = patch.peekSlot ?? defaultPeekSlot(next.targetId)
          }
          return next
        })
      )
    },
    [defaultPeekSlot]
  )

  const removeStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id || s.kind === 'move'))
    setPicking(p => (p && 'stepId' in p && p.stepId === id ? null : p))
  }, [])

  const reorderStep = useCallback((id: string, direction: -1 | 1) => {
    setSteps(prev => {
      const index = prev.findIndex(s => s.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const pickSlot = useCallback(
    (targetId: string, slotId: SubsystemId) => {
      if (!picking || picking.kind === 'destination') return
      if (picking.kind === 'crit') updateStep(picking.stepId, { targetId, criticalTarget: slotId })
      else updateStep(picking.stepId, { targetId, peekSlot: slotId })
      setPicking(null)
    },
    [picking, updateStep]
  )

  const pickTarget = useCallback(
    (targetId: string) => {
      setSteps(prev => {
        const editing =
          picking && 'stepId' in picking ? prev.find(s => s.id === picking.stepId) : undefined
        const step =
          editing ??
          [...prev]
            .reverse()
            .find(s => (s.kind === 'fire' || s.kind === 'scan') && s.targetId === null) ??
          [...prev].reverse().find(s => s.kind === 'fire' || s.kind === 'scan')
        if (!step) return prev
        return prev.map(s => {
          if (s.id !== step.id) return s
          if (s.kind === 'scan') {
            return {
              ...s,
              targetId,
              peekSlot: s.targetId === targetId ? s.peekSlot : defaultPeekSlot(targetId),
            }
          }
          return { ...s, targetId } as PlanStep
        })
      })
    },
    [picking, defaultPeekSlot]
  )

  const value = useMemo<PlanContextValue>(
    () => ({
      me,
      isMyTurn,
      disabled,
      steps,
      moveStep,
      powers: preview.powers,
      usedBy,
      pendingSubsystems,
      criticalFrom,
      stepStart,
      finalPosition,
      moveFrom,
      jumpOptions,
      adjustmentRange,
      jumpAdjustmentRange,
      moored,
      rotateReady,
      burnReady,
      jumpReady,
      scoopGain,
      projectedHeat,
      projectedFuel: preview.projectedFuel,
      issues: preview.issues,
      actions,
      picking,
      focusWeaponId:
        focusWeaponId ??
        [...steps].reverse().find((s): s is FireStep => s.kind === 'fire')?.subsystemId ??
        null,
      targets,
      targetsInRange,
      targetsOutOfReach,
      setEnergyTo,
      setMove,
      applyMove,
      toggleRotate,
      addFire,
      addScan,
      updateStep,
      removeStep,
      reorderStep,
      setPicking,
      pickSlot,
      pickTarget,
      setFocusWeapon: setFocusWeaponId,
      reset,
      repairChoice,
      setRepairChoice,
      repairable,
      dockOffer,
      dockJob,
      setDockJob: setDockChoice,
      escortOffer,
      escortChoices,
      toggleEscort,
    }),
    [
      me,
      isMyTurn,
      disabled,
      steps,
      moveStep,
      preview,
      usedBy,
      pendingSubsystems,
      criticalFrom,
      stepStart,
      finalPosition,
      moveFrom,
      jumpOptions,
      adjustmentRange,
      jumpAdjustmentRange,
      moored,
      rotateReady,
      burnReady,
      jumpReady,
      scoopGain,
      projectedHeat,
      actions,
      picking,
      focusWeaponId,
      targets,
      targetsInRange,
      targetsOutOfReach,
      setEnergyTo,
      setMove,
      applyMove,
      toggleRotate,
      addFire,
      addScan,
      updateStep,
      removeStep,
      reorderStep,
      pickSlot,
      pickTarget,
      reset,
      repairChoice,
      setRepairChoice,
      repairable,
      dockOffer,
      dockJob,
      escortOffer,
      escortChoices,
      toggleEscort,
    ]
  )

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
  const context = useContext(PlanContext)
  if (!context) throw new Error('usePlan must be used within a PlanProvider')
  return context
}

/** For components that also render outside a planning turn (replay, opponents' turns). */
export function usePlanOptional(): PlanContextValue | null {
  return useContext(PlanContext) ?? null
}
