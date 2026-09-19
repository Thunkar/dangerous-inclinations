/**
 * PlanContext — the turn you are putting together.
 *
 * Energy cubes moved on your mat, plus an ordered list of steps (rotate, one
 * move, any number of weapons, a scan). Every number here is a preview
 * computed with pure engine functions — range, projected position, costs. The
 * server is the referee; nothing here advances state.
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
  Facing,
  JumpOption,
  Player,
  PlayerAction,
  Position,
  SlotView,
  Subsystem,
  SubsystemId,
  MovementPlan,
  MovementStep,
  Station,
} from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  SCAN_SECTOR_RANGE,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  canSubsystemFunction,
  getAdjustmentRange,
  getJumpAdjustmentRange,
  getJumpOptions,
  MAX_REACTION_MASS,
  getMaxRing,
  energyStepOf,
  getSubsystemConfig,
  hasWorkingCompressor,
  canEngage,
  isInWeaponRange,
  isMooredAt,
  isWeaponType,
  opponentPositions,
  phasedJumpDestination,
  projectPosition,
  ringVelocity,
  sectorDistance,
  getStationAt,
  planMovementAlternatives,
  planStationMeetUp,
  samePosition,
  stationPosition,
} from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'

/**
 * What "go there" means when the destination is a station.
 *
 * A station is not a place, it is a thing on a circuit: it advances 4 sectors
 * at the end of every round. Planning to the sector it is on today lands the
 * ship where it used to be, which is never what anyone clicking a station
 * wanted — so a station destination means `meet` unless you say otherwise.
 */
export type RouteMode = 'meet' | 'sector'

export type MoveChoice =
  | { kind: 'coast'; scoop: boolean }
  | { kind: 'burn'; intensity: BurnIntensity; adjustment: number }
  | { kind: 'jump'; destinationWellId: string; adjustment: number }

export type PlanStep =
  | { id: string; kind: 'rotate' }
  | { id: string; kind: 'move'; move: MoveChoice }
  | {
      id: string
      kind: 'fire'
      subsystemId: SubsystemId
      targetId: string | null
      criticalTarget: SubsystemId
      compensateRecoil: boolean
      /**
       * Missiles only: how many of the tile's remaining rounds this action puts
       * in the air, at one ship and one named slot. Every other weapon fires
       * once, so it stays at 1.
       */
      count: number
    }
  | { id: string; kind: 'scan'; targetId: string | null; peekSlot: SubsystemId | null }

export type FireStep = Extract<PlanStep, { kind: 'fire' }>
export type ScanStep = Extract<PlanStep, { kind: 'scan' }>
export type MoveStep = Extract<PlanStep, { kind: 'move' }>

/** What a click on an opponent's mat is currently for. */
export type Picking =
  | { kind: 'crit'; stepId: string }
  | { kind: 'peek'; stepId: string }
  /** Choosing a destination sector for the route planner. */
  | { kind: 'destination' }
  | null

export interface StepContext {
  position: Position
  facing: Facing
}

export interface Target {
  id: string
  position: Position
}

interface PlanContextValue {
  me: Player
  isMyTurn: boolean
  steps: PlanStep[]
  /** The single move step; there is always exactly one. */
  moveStep: MoveStep
  energy: Record<SubsystemId, number>
  /** My subsystems with the planned energy applied. */
  pendingSubsystems: Subsystem[]
  availableEnergy: number
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
  /**
   * Whether each move can actually be taken from the mat as it is planned.
   * A control the engine would refuse is not offered (see {@link MoveReadiness}).
   */
  rotateReady: MoveReadiness
  burnReady: Record<BurnIntensity, MoveReadiness>
  jumpReady: MoveReadiness
  scoopGain: number
  projectedHeat: number
  /** Total fuel the plan spends. */
  massCost: number
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
  allocate: (subsystemId: SubsystemId, delta: number) => void
  setEnergyTo: (subsystemId: SubsystemId, value: number) => void
  /**
   * One click on a tile: up powers it on to its minimum (then a cube at a
   * time), down takes a cube back and switches it off at the minimum.
   */
  power: (subsystemId: SubsystemId, direction: 1 | -1) => void
  setMove: (move: MoveChoice) => void
  toggleRotate: () => void
  addFire: (subsystemId: SubsystemId) => void
  addScan: () => void
  updateStep: (id: string, patch: Partial<FireStep> & Partial<ScanStep>) => void
  removeStep: (id: string) => void
  reorderStep: (id: string, direction: -1 | 1) => void
  setPicking: (picking: Picking) => void
  /** A slot on an opponent's mat was clicked while picking. */
  pickSlot: (targetId: string, slotId: SubsystemId) => void
  /** An opponent's ship or mat was clicked: aim the step being edited at them. */
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
  /** Route planner: a destination sector, the routes the engine finds, and the one in view. */
  routeDestination: Position | null
  /**
   * The station the destination was picked on, if any — held by id, because a
   * station drifts 4 sectors every round and the sector you clicked stops
   * being the one it is on.
   */
  routeStation: Station | null
  /**
   * `meet` aims at where the station will be when the ship gets there; `sector`
   * aims at the fixed sector. Only a station destination can be `meet`.
   */
  routeMode: RouteMode
  setRouteMode: (mode: RouteMode) => void
  routes: MovementPlan[]
  route: MovementPlan | null
  routeIndex: number
  setRouteDestination: (position: Position | null) => void
  selectRoute: (index: number) => void
  /** Turn the route's first step into this turn's move (rotation and cubes included). */
  applyRouteStep: () => void
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

let stepCounter = 0
const stepId = () => `step-${++stepCounter}`

const flip = (facing: Facing): Facing => (facing === 'prograde' ? 'retrograde' : 'prograde')

/**
 * Whether a move is available, and what is in the way if it is not.
 *
 * The engine refuses a burn whose engines are dark, a rotation with nothing on
 * the thrusters and a jump with no fuel, but the buttons offered all three and
 * only said so after the turn was submitted. Every check here is the one the
 * validator makes (`game/validators.ts`), read off the mat as the player has
 * planned it — cubes they are about to move count, because that is the mat the
 * turn will be taken with.
 *
 * `reason` is a clause, so a tooltip can end a sentence with it.
 */
export interface MoveReadiness {
  ok: boolean
  reason: string
}

const READY: MoveReadiness = { ok: true, reason: '' }
const blocked = (reason: string): MoveReadiness => ({ ok: false, reason })
const cubes = (n: number) => `${n} cube${n === 1 ? '' : 's'}`

const BURN_INTENSITIES: BurnIntensity[] = ['soft', 'medium', 'hard']

/**
 * A burn changes exactly its number of rings — there is no partial burn off
 * the edge of the well (RULES §Burn), and the engine rejects one that would
 * leave the rings. Prograde burns outward, retrograde inward.
 */
function burnFitsInWell(position: Position, facing: Facing, intensity: BurnIntensity): boolean {
  const ring = position.ring + (facing === 'prograde' ? 1 : -1) * BURN_COSTS[intensity].rings
  return ring >= 1 && ring <= getMaxRing(position.wellId)
}

const bySlotOrder = (a: SlotView, b: SlotView) =>
  a.group === b.group ? a.index - b.index : a.group === 'forward' ? -1 : 1

function committedEnergy(player: Player): Record<SubsystemId, number> {
  return Object.fromEntries(player.ship.subsystems.map(s => [s.id, s.allocatedEnergy]))
}

/**
 * A turn opens on a coast, and on a scoop if the scoop is already holding its
 * cubes: leaving them on the tile is the decision, and a coast past a well
 * with a live scoop and nobody touching it was only ever an oversight. The
 * chip still turns it off.
 */
function defaultSteps(scooping = false): PlanStep[] {
  return [{ id: stepId(), kind: 'move', move: { kind: 'coast', scoop: scooping } }]
}

/**
 * One click on a tile: up powers it on to its minimum (then a cube at a
 * time), down takes a cube off and switches it off below the minimum. Returns
 * the tile's new energy, or null when the click can do nothing.
 */
function poweredTo(
  player: Player,
  energy: Record<SubsystemId, number>,
  subsystemId: SubsystemId,
  direction: 1 | -1
): number | null {
  const sub = player.ship.subsystems.find(s => s.id === subsystemId)
  if (!sub || sub.isBroken) return null
  const config = getSubsystemConfig(sub.type)
  if (config.maxEnergy === 0) return null
  const current = energy[subsystemId] ?? sub.allocatedEnergy
  const total = player.ship.subsystems.reduce((sum, s) => sum + (energy[s.id] ?? s.allocatedEnergy), 0)
  const free = player.ship.reactor.totalCapacity - total
  const step = energyStepOf(sub.type)
  if (direction > 0) {
    // Powering on costs the whole minimum at once, or nothing.
    if (current === 0) return free < config.minEnergy ? null : config.minEnergy
    if (current >= config.maxEnergy || free < step) return null
    return current + step
  }
  if (current === 0) return null
  return current <= config.minEnergy ? 0 : current - step
}

/** Whether a coast this turn would scoop without anyone asking. */
function scoopRuns(player: Player): boolean {
  const scoop = player.ship.subsystems.find(s => s.id === 'scoop')
  if (!scoop || scoop.isBroken) return false
  return scoop.allocatedEnergy >= getSubsystemConfig('scoop').minEnergy
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { view } = useGame()
  const me = view.me
  if (!me) throw new Error('PlanProvider needs a seated player')
  return <SeatedPlanProvider me={me}>{children}</SeatedPlanProvider>
}

function SeatedPlanProvider({ me, children }: { me: Player; children: ReactNode }) {
  const { view, readOnly } = useGame()
  const [energy, setEnergy] = useState<Record<SubsystemId, number>>(() => committedEnergy(me))
  const [steps, setSteps] = useState<PlanStep[]>(() => defaultSteps(scoopRuns(me)))
  const [picking, setPicking] = useState<Picking>(null)
  const [focusWeaponId, setFocusWeaponId] = useState<SubsystemId | null>(null)
  const [repairChoice, setRepairChoiceState] = useState<SubsystemId | null>(null)
  const [routeDestination, setRouteDestinationState] = useState<Position | null>(null)
  const [routeStationId, setRouteStationId] = useState<string | null>(null)
  const [routeMode, setRouteMode] = useState<RouteMode>('meet')
  const [routeIndex, setRouteIndex] = useState(0)

  const isMyTurn = !readOnly && view.activePlayerId === me.id && view.phase === 'active'

  const reset = useCallback(() => {
    setEnergy(committedEnergy(me))
    setSteps(defaultSteps(scoopRuns(me)))
    setPicking(null)
    setFocusWeaponId(null)
  }, [me])

  // A new turn (or a fresh state after our own turn) starts a fresh plan.
  useEffect(() => {
    reset()
    // `reset` closes over `me`, which changes with every view; keying on the
    // turn and the active seat is what actually means "new turn".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.turn, view.activePlayerId, readOnly])

  const pendingSubsystems = useMemo<Subsystem[]>(
    () =>
      me.ship.subsystems.map(s => {
        const allocatedEnergy = energy[s.id] ?? s.allocatedEnergy
        const next = { ...s, allocatedEnergy }
        return { ...next, isPowered: canSubsystemFunction(next) }
      }),
    [me.ship.subsystems, energy]
  )

  const allocatedTotal = useMemo(
    () => pendingSubsystems.reduce((sum, s) => sum + s.allocatedEnergy, 0),
    [pendingSubsystems]
  )
  const availableEnergy = me.ship.reactor.totalCapacity - allocatedTotal
  const pendingShip = useMemo(
    () => ({ ...me.ship, subsystems: pendingSubsystems }),
    [me.ship, pendingSubsystems]
  )
  const targets = useMemo<Target[]>(() => opponentPositions(view), [view])

  const moveStep = useMemo(
    () => steps.find((s): s is MoveStep => s.kind === 'move') ?? (defaultSteps()[0] as MoveStep),
    [steps]
  )

  // Walk the sequence: where is the ship at the start of each step?
  const { stepStart, finalPosition } = useMemo(() => {
    let position: Position = { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector }
    let facing: Facing = me.ship.facing
    const starts: StepContext[] = []
    for (const step of steps) {
      starts.push({ position, facing })
      switch (step.kind) {
        case 'rotate':
          facing = flip(facing)
          break
        case 'move': {
          const move = step.move
          const shipHere = { ...me.ship, ...position, facing }
          if (move.kind === 'jump') {
            const jump = getJumpOptions(position).find(
              o => o.destination.wellId === move.destinationWellId
            )
            const landing = jump && phasedJumpDestination(jump, move.adjustment)
            if (landing) position = landing
          } else {
            const p =
              move.kind === 'burn'
                ? projectPosition(shipHere, facing, {
                    kind: 'burn',
                    burnIntensity: move.intensity,
                    sectorAdjustment: move.adjustment,
                  })
                : projectPosition(shipHere, facing, {
                    kind: 'coast',
                    moored: isMooredAt(view.stations, position),
                  })
            position = { wellId: p.wellId, ring: p.ring, sector: p.sector }
          }
          break
        }
        case 'fire': {
          const weapon = pendingSubsystems.find(s => s.id === step.subsystemId)
          const recoils =
            weapon &&
            getSubsystemConfig(weapon.type).weaponStats?.hasRecoil &&
            !step.compensateRecoil
          if (recoils) {
            const ring = position.ring + (facing === 'prograde' ? 1 : -1)
            if (ring >= 1 && ring <= getMaxRing(position.wellId)) position = { ...position, ring }
          }
          break
        }
        case 'scan':
          break
      }
    }
    return { stepStart: starts, finalPosition: { position, facing } }
  }, [steps, me.ship, pendingSubsystems, view.stations])

  const moveFrom = useMemo(() => {
    const index = steps.findIndex(s => s.kind === 'move')
    return index >= 0 ? stepStart[index] : { position: me.ship, facing: me.ship.facing }
  }, [steps, stepStart, me.ship])

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
  const rotateReady = useMemo<MoveReadiness>(() => {
    const thrusters = pendingSubsystems.find(s => s.id === 'rotation')
    const need = getSubsystemConfig('rotation').minEnergy
    if (!thrusters || thrusters.isBroken) return blocked('the thrusters are broken')
    if (thrusters.usedThisTurn) return blocked('the thrusters have already turned the ship')
    if (thrusters.allocatedEnergy < need)
      return blocked(`the thrusters hold ${thrusters.allocatedEnergy} of the ${cubes(need)} a turn needs`)
    return READY
  }, [pendingSubsystems])

  const burnReady = useMemo<Record<BurnIntensity, MoveReadiness>>(() => {
    const engines = pendingSubsystems.find(s => s.id === 'engines')
    // Phasing is part of the fuel bill, so the burn already being planned is
    // priced with the sectors it is shifting; the mode button asks about a
    // plain burn.
    const adjustment = moveStep.move.kind === 'burn' ? moveStep.move.adjustment : 0
    const outward = moveFrom.facing === 'prograde' ? 'outward' : 'inward'
    const entries = BURN_INTENSITIES.map(intensity => {
      const cost = BURN_COSTS[intensity]
      const rings = `${cost.rings} ring${cost.rings === 1 ? '' : 's'} ${outward}`
      const mass = calculateBurnMassCost(cost.mass, adjustment)
      const state = !engines || engines.isBroken
        ? blocked('the engines are broken')
        : !burnFitsInWell(moveFrom.position, moveFrom.facing, intensity)
          ? blocked(`there are not ${rings} from ring ${moveFrom.position.ring} — rotate to burn the other way`)
          : engines.usedThisTurn
            ? blocked('the engines have already burned this turn')
            : engines.allocatedEnergy < cost.energy
              ? blocked(`the engines hold ${engines.allocatedEnergy} of the ${cubes(cost.energy)} a ${intensity} burn needs`)
              : me.ship.reactionMass < mass
                ? blocked(`it costs ${mass} fuel and ${me.ship.reactionMass} is aboard`)
                : READY
      return [intensity, state]
    })
    return Object.fromEntries(entries) as Record<BurnIntensity, MoveReadiness>
  }, [pendingSubsystems, moveFrom, moveStep, me.ship.reactionMass])

  const jumpReady = useMemo<MoveReadiness>(() => {
    if (jumpOptions.length === 0)
      return blocked('jumps leave only from a lane end, and this sector is not one')
    const engines = pendingSubsystems.find(s => s.id === 'engines')
    if (!engines || engines.isBroken) return blocked('the engines are broken')
    if (engines.usedThisTurn) return blocked('the engines have already burned this turn')
    if (engines.allocatedEnergy < WELL_TRANSFER_COSTS.energy)
      return blocked(
        `the engines hold ${engines.allocatedEnergy} of the ${cubes(WELL_TRANSFER_COSTS.energy)} a jump needs`
      )
    const adjustment = moveStep.move.kind === 'jump' ? moveStep.move.adjustment : 0
    const compressor = hasWorkingCompressor({ ...me.ship, subsystems: pendingSubsystems })
    const mass = calculateJumpMassCost(adjustment, compressor)
    if (me.ship.reactionMass < mass)
      return blocked(`it costs ${mass} fuel and ${me.ship.reactionMass} is aboard`)
    return READY
  }, [jumpOptions, pendingSubsystems, moveStep, me.ship])

  const scoopGain = ringVelocity(moveFrom.position.wellId, moveFrom.position.ring)

  /** Where the shot is fired from, and whether the ship has already moved. */
  const firingFrom = useCallback(
    (step: PlanStep) => {
      const index = steps.findIndex(s => s.id === step.id)
      const at = index >= 0 ? stepStart[index] : { position: me.ship, facing: me.ship.facing }
      const moveIndex = steps.findIndex(s => s.kind === 'move')
      return {
        attacker: { ...at.position, facing: at.facing },
        afterMoving: index >= 0 && moveIndex >= 0 && index > moveIndex,
      }
    },
    [steps, stepStart, me.ship]
  )

  const targetsOutOfReach = useCallback(
    (step: PlanStep): Target[] => {
      if (step.kind !== 'fire') return []
      const weapon = pendingSubsystems.find(s => s.id === step.subsystemId)
      if (!weapon) return []
      const { attacker, afterMoving } = firingFrom(step)
      return targets.filter(
        t =>
          isInWeaponRange(weapon, attacker, t.position) &&
          !canEngage(weapon, attacker, t.position, afterMoving)
      )
    },
    [firingFrom, pendingSubsystems, targets]
  )

  const targetsInRange = useCallback(
    (step: PlanStep): Target[] => {
      const index = steps.findIndex(s => s.id === step.id)
      const at = index >= 0 ? stepStart[index] : { position: me.ship, facing: me.ship.facing }
      const attacker = { ...at.position, facing: at.facing }
      if (step.kind === 'fire') {
        const weapon = pendingSubsystems.find(s => s.id === step.subsystemId)
        if (!weapon) return []
        return targets.filter(t => isInWeaponRange(weapon, attacker, t.position))
      }
      if (step.kind === 'scan') {
        return targets.filter(
          t =>
            t.position.wellId === attacker.wellId &&
            t.position.ring === attacker.ring &&
            sectorDistance(attacker.sector, t.position.sector) <= SCAN_SECTOR_RANGE
        )
      }
      return []
    },
    [steps, stepStart, targets, pendingSubsystems, me.ship]
  )

  const engines = pendingSubsystems.find(s => s.id === 'engines')
  const compressor = hasWorkingCompressor(pendingShip)

  /** The station the destination was picked on, found again by id as it drifts. */
  const routeStation = useMemo<Station | null>(
    () => (routeStationId ? (view.stations.find(s => s.id === routeStationId) ?? null) : null),
    [routeStationId, view.stations]
  )

  // Route planner: from where the ship is now (the first step is this turn's move).
  const routes = useMemo<MovementPlan[]>(() => {
    // Meeting a station is a forward search against a moving target, so it
    // yields the one plan that arrives when the station does, not a set of
    // alternatives to a fixed sector.
    if (routeStation && routeMode === 'meet') {
      if (samePosition(me.ship, stationPosition(routeStation))) return []
      const meet = planStationMeetUp(me.ship, routeStation, 20)
      return meet ? [meet.plan] : []
    }
    if (!routeDestination || samePosition(me.ship, routeDestination)) return []
    const scoop = pendingSubsystems.find(s => s.id === 'scoop')
    const result = planMovementAlternatives(
      {
        wellId: me.ship.wellId,
        ring: me.ship.ring,
        sector: me.ship.sector,
        facing: me.ship.facing,
      },
      routeDestination,
      {
        availableMass: me.ship.reactionMass,
        hasFuelScoop: Boolean(scoop && !scoop.isBroken),
        maxFuelCapacity: view.myStats?.maxReactionMass ?? me.ship.reactionMass,
        hasFuelCompressor: compressor,
        allowWellTransfers: true,
        maxTurns: 20,
      }
    )
    return result?.alternatives ?? []
  }, [routeDestination, routeStation, routeMode, me.ship, pendingSubsystems, compressor, view.myStats])
  const route = routes[Math.min(routeIndex, Math.max(0, routes.length - 1))] ?? null

  // Arrived: the route has done its job. Meeting a station ends when the ship
  // is on the station, wherever the two of them got to.
  useEffect(() => {
    const arrived =
      routeStation && routeMode === 'meet'
        ? samePosition(me.ship, stationPosition(routeStation))
        : routeDestination !== null && samePosition(me.ship, routeDestination)
    if (arrived) {
      setRouteDestinationState(null)
      setRouteStationId(null)
    }
  }, [routeDestination, routeStation, routeMode, me.ship])

  /**
   * Walk the sequence in order. Heat accumulates, fuel is spent *and earned*
   * as the turn plays out, so a scoop earlier in the sequence pays for a burn
   * or a recoil compensation later in it — exactly as the engine sees it.
   */
  const { projectedHeat, massCost, projectedFuel, issues } = useMemo(() => {
    let heat = me.ship.heat.currentHeat
    let spent = 0
    let fuel = me.ship.reactionMass
    const maxFuel = MAX_REACTION_MASS
    const problems: string[] = []
    let engineUses = 0
    let reportedShortFuel = false

    const spend = (amount: number, what: string) => {
      spent += amount
      if (amount > fuel && !reportedShortFuel) {
        reportedShortFuel = true
        problems.push(`Not enough fuel for ${what}: ${amount} needed, ${fuel} in the tank by then`)
      }
      fuel = Math.max(0, fuel - amount)
    }

    steps.forEach((step, index) => {
      const at = stepStart[index]
      switch (step.kind) {
        case 'rotate': {
          const thrusters = pendingSubsystems.find(s => s.id === 'rotation')
          if (!thrusters || thrusters.isBroken) problems.push('Thrusters are broken: no rotation')
          else if (!thrusters.isPowered) problems.push('Rotating needs 1 energy on the thrusters')
          else heat += thrusters.allocatedEnergy
          break
        }
        case 'move': {
          const move = step.move
          if (move.kind === 'burn') {
            const cost = BURN_COSTS[move.intensity]
            const range = getAdjustmentRange(ringVelocity(at.position.wellId, at.position.ring))
            engineUses++
            if (!engines || engines.isBroken) problems.push('Engines are broken: no burn')
            else if (engines.allocatedEnergy < cost.energy)
              problems.push(`A ${move.intensity} burn needs ${cost.energy} energy on the engines`)
            else heat += engines.allocatedEnergy
            if (move.adjustment < range.min || move.adjustment > range.max)
              problems.push(`Phasing must be between ${range.min} and +${range.max} from this ring`)
            if (!burnFitsInWell(at.position, at.facing, move.intensity)) {
              problems.push(
                `A ${move.intensity} burn ${at.facing === 'prograde' ? 'outward' : 'inward'} from ring ${
                  at.position.ring
                } would leave the rings`
              )
            }
            spend(calculateBurnMassCost(cost.mass, move.adjustment), `a ${move.intensity} burn`)
          } else if (move.kind === 'jump') {
            engineUses++
            const option = getJumpOptions(at.position).find(
              o => o.destination.wellId === move.destinationWellId
            )
            if (!option) problems.push('No transfer lane from here to that destination')
            else {
              const range = getJumpAdjustmentRange(option)
              if (move.adjustment < range.min || move.adjustment > range.max)
                problems.push(
                  `Phasing a jump stays inside the arrival arc (${range.min} to +${range.max} from here)`
                )
            }
            if (!engines || engines.isBroken) problems.push('Engines are broken: no jump')
            else if (engines.allocatedEnergy < WELL_TRANSFER_COSTS.energy)
              problems.push(`A jump needs ${WELL_TRANSFER_COSTS.energy} energy on the engines`)
            else heat += engines.allocatedEnergy
            spend(calculateJumpMassCost(move.adjustment, compressor), 'a jump')
          } else if (move.scoop) {
            const scoop = pendingSubsystems.find(s => s.id === 'scoop')
            if (!scoop || scoop.isBroken) problems.push('Fuel scoop is broken')
            else if (!scoop.isPowered)
              problems.push(
                `Scooping needs ${getSubsystemConfig('scoop').minEnergy} energy on the scoop`
              )
            else {
              heat += scoop.allocatedEnergy
              // Recover fuel equal to this ring's velocity, up to the tank's capacity.
              fuel = Math.min(maxFuel, fuel + ringVelocity(at.position.wellId, at.position.ring))
            }
          }
          break
        }
        case 'fire': {
          const weapon = pendingSubsystems.find(s => s.id === step.subsystemId)
          if (!weapon || !isWeaponType(weapon.type)) break
          const config = getSubsystemConfig(weapon.type)
          // A salvo pays the tile's cubes once per missile (RULES §Weapons →
          // Missiles), so how big the launch is, is how hot the turn runs.
          const salvo = weapon.type === 'missiles' ? Math.max(1, step.count) : 1
          if (weapon.isBroken) problems.push(`${config.name} is broken`)
          else if (!weapon.isPowered)
            problems.push(`${config.name} needs ${config.minEnergy} energy to fire`)
          else heat += weapon.allocatedEnergy * salvo
          if (weapon.type === 'missiles') {
            const ammo = weapon.ammo ?? 0
            if (ammo <= 0) problems.push('No missiles left aboard')
            else if (step.count > ammo)
              problems.push(`${config.name}: ${step.count} missiles planned, ${ammo} aboard`)
            if (step.count < 1)
              problems.push(`${config.name}: a salvo launches at least one missile`)
          }
          if (!step.targetId) problems.push(`${config.name}: pick a target`)
          else if (!targetsInRange(step).some(t => t.id === step.targetId))
            problems.push(`${config.name}: target out of range from where you fire`)
          if (config.weaponStats?.hasRecoil) {
            if (step.compensateRecoil) {
              engineUses++
              if (!engines || engines.isBroken || engines.allocatedEnergy < BURN_COSTS.soft.energy)
                problems.push('Compensating recoil needs 1 energy on the engines')
              else heat += engines.allocatedEnergy
              spend(BURN_COSTS.soft.mass, 'recoil compensation')
            } else {
              const ring = at.position.ring + (at.facing === 'prograde' ? 1 : -1)
              if (ring < 1 || ring > getMaxRing(at.position.wellId))
                problems.push(
                  'Railgun recoil would push you off the rings: compensate or rotate first'
                )
            }
          }
          break
        }
        case 'scan': {
          const sensor = pendingSubsystems.find(s => s.type === 'sensor_array')
          if (!sensor) problems.push('No sensor array aboard')
          else if (sensor.isBroken) problems.push('Sensor array is broken')
          else if (!sensor.isPowered)
            problems.push(
              `Scanning needs ${getSubsystemConfig('sensor_array').minEnergy} energy on the sensors`
            )
          else heat += sensor.allocatedEnergy
          if (!step.targetId) problems.push('Scan: pick a target on your ring within 3 sectors')
          else if (!targetsInRange(step).some(t => t.id === step.targetId))
            problems.push('Scan: the target must be on your ring within 3 sectors')
          if (!step.peekSlot) problems.push('Scan: choose which tile to look at')
          break
        }
      }
    })

    if (engineUses > 1)
      problems.push('Engines act once per turn: burn/jump or recoil compensation, not both')
    if (availableEnergy < 0) problems.push('More cubes allocated than the reactor holds')
    return { projectedHeat: heat, massCost: spent, projectedFuel: fuel, issues: problems }
  }, [
    steps,
    stepStart,
    pendingSubsystems,
    engines,
    compressor,
    me.ship,
    targetsInRange,
    availableEnergy,
  ])

  const actions = useMemo<PlayerAction[]>(() => {
    const list: PlayerAction[] = []
    for (const s of me.ship.subsystems) {
      const diff = (energy[s.id] ?? s.allocatedEnergy) - s.allocatedEnergy
      if (diff > 0)
        list.push({
          playerId: me.id,
          type: 'allocate_energy',
          data: { subsystemId: s.id, amount: diff },
        })
      if (diff < 0)
        list.push({
          playerId: me.id,
          type: 'deallocate_energy',
          data: { subsystemId: s.id, amount: -diff },
        })
    }
    let sequence = 0
    steps.forEach((step, index) => {
      const at = stepStart[index]
      switch (step.kind) {
        case 'rotate':
          list.push({
            playerId: me.id,
            type: 'rotate',
            sequence: ++sequence,
            data: { targetFacing: flip(at.facing) },
          })
          break
        case 'move':
          if (step.move.kind === 'coast') {
            list.push({
              playerId: me.id,
              type: 'coast',
              sequence: ++sequence,
              data: { activateScoop: step.move.scoop },
            })
          } else if (step.move.kind === 'burn') {
            list.push({
              playerId: me.id,
              type: 'burn',
              sequence: ++sequence,
              data: { burnIntensity: step.move.intensity, sectorAdjustment: step.move.adjustment },
            })
          } else {
            list.push({
              playerId: me.id,
              type: 'well_transfer',
              sequence: ++sequence,
              data: {
                destinationWellId: step.move.destinationWellId,
                sectorAdjustment: step.move.adjustment,
              },
            })
          }
          break
        case 'fire': {
          if (!step.targetId) break
          // Only a missiles tile takes a count: the engine refuses one on any
          // other weapon, so it is sent for a launcher and nothing else.
          const weapon = me.ship.subsystems.find(s => s.id === step.subsystemId)
          list.push({
            playerId: me.id,
            type: 'fire_weapon',
            sequence: ++sequence,
            data: {
              subsystemId: step.subsystemId,
              targetPlayerId: step.targetId,
              criticalTarget: step.criticalTarget,
              ...(step.compensateRecoil ? { compensateRecoil: true } : {}),
              ...(weapon?.type === 'missiles' ? { count: step.count } : {}),
            },
          })
          break
        }
        case 'scan':
          if (!step.targetId || !step.peekSlot) break
          list.push({
            playerId: me.id,
            type: 'scan',
            sequence: ++sequence,
            data: { targetPlayerId: step.targetId, peekSlot: step.peekSlot },
          })
          break
      }
    })
    if (repairChoice !== null)
      list.push({ playerId: me.id, type: 'repair', data: { subsystemId: repairChoice } })
    return list
  }, [me, energy, steps, stepStart, repairChoice])

  /**
   * A repair needs the ship cold at its check: no heat carried in, none made by
   * the turn, and no shields powered — a powered shield is heat at the check
   * even unused. A choice the turn can no longer earn is dropped rather than
   * refused, so editing the move never leaves an illegal action on the sheet.
   */
  const standingHeat = pendingSubsystems
    .filter(s => s.type === 'shields' && s.isPowered && !s.isBroken)
    .reduce((sum, s) => sum + s.allocatedEnergy, 0)
  const repairable = useMemo(
    () =>
      projectedHeat === 0 && standingHeat === 0
        ? me.ship.subsystems.filter(s => s.isBroken).map(s => s.id)
        : [],
    [projectedHeat, standingHeat, me.ship.subsystems]
  )
  useEffect(() => {
    if (repairChoice !== null && !repairable.includes(repairChoice)) setRepairChoiceState(null)
  }, [repairChoice, repairable])
  const setRepairChoice = useCallback((id: SubsystemId | null) => setRepairChoiceState(id), [])

  // --- mutators ------------------------------------------------------------

  const allocate = useCallback(
    (subsystemId: SubsystemId, delta: number) => {
      setEnergy(prev => {
        const sub = me.ship.subsystems.find(s => s.id === subsystemId)
        if (!sub || sub.isBroken) return prev
        const config = getSubsystemConfig(sub.type)
        if (config.maxEnergy === 0) return prev
        const current = prev[subsystemId] ?? sub.allocatedEnergy
        const total = me.ship.subsystems.reduce(
          (sum, s) => sum + (prev[s.id] ?? s.allocatedEnergy),
          0
        )
        const free = me.ship.reactor.totalCapacity - total
        // A tile that takes its energy in steps moves a whole step at a time,
        // so a shield reads 0, 2 or 4 and never the odd cube that buys nothing.
        const step = energyStepOf(sub.type)
        let next = current
        if (delta > 0) {
          // From off, a tile powers up straight to its minimum.
          const bump = Math.max(delta, step)
          const target = current === 0 ? Math.max(config.minEnergy, bump) : current + bump
          next = Math.min(config.maxEnergy, target)
          if (next - current > free) next = current + Math.floor(free / step) * step
          if (next < config.minEnergy) return prev
        } else if (delta < 0) {
          const target = current - Math.max(-delta, step)
          next = target < config.minEnergy ? 0 : target
        }
        if (next === current) return prev
        if (subsystemId === 'scoop') {
          // The cubes are the decision: putting them on the scoop while
          // coasting means you want it run, taking them off means you don't.
          const runs = next >= config.minEnergy && !isMooredAt(view.stations, me.ship)
          setSteps(steps =>
            steps.map(step =>
              step.kind === 'move' && step.move.kind === 'coast'
                ? { ...step, move: { kind: 'coast', scoop: runs } }
                : step
            )
          )
        }
        return { ...prev, [subsystemId]: next }
      })
    },
    [me, view.stations]
  )

  const setEnergyTo = useCallback(
    (subsystemId: SubsystemId, value: number) => {
      const current = energy[subsystemId] ?? 0
      allocate(subsystemId, value - current)
    },
    [energy, allocate]
  )

  /**
   * The tile click model: a tile is off or at least at its minimum, never in
   * between. Everything is decided inside the updater, so a burst of clicks
   * lands one cube at a time even before the mat has re-rendered.
   */
  const power = useCallback(
    (subsystemId: SubsystemId, direction: 1 | -1) => {
      const next = poweredTo(me, energy, subsystemId, direction)
      if (next === null) return
      setEnergy(prev => ({ ...prev, [subsystemId]: next }))
      if (subsystemId === 'scoop') {
        // The cubes are the decision: putting them on the scoop while coasting
        // means you want it run, taking them off means you do not.
        const runs = next >= getSubsystemConfig('scoop').minEnergy
        setSteps(steps =>
          steps.map(step =>
            step.kind === 'move' && step.move.kind === 'coast'
              ? { ...step, move: { kind: 'coast', scoop: runs } }
              : step
          )
        )
      }
    },
    [me, energy]
  )

  const setRouteDestination = useCallback(
    (position: Position | null) => {
      setRouteDestinationState(position)
      // Click a station and you meant the station, not the sector under it.
      const station = position ? getStationAt(view.stations, position) : undefined
      setRouteStationId(station?.id ?? null)
      setRouteMode(station ? 'meet' : 'sector')
      setRouteIndex(0)
      setPicking(p => (p?.kind === 'destination' ? null : p))
    },
    [view.stations]
  )

  const selectRoute = useCallback((index: number) => setRouteIndex(index), [])

  const applyRouteStep = useCallback(() => {
    const step: MovementStep | undefined = route?.steps[0]
    if (!step) return
    const move: MoveChoice =
      step.actionType === 'coast'
        ? { kind: 'coast', scoop: step.massCost < 0 }
        : step.actionType === 'well_transfer'
          ? { kind: 'jump', destinationWellId: step.to.wellId, adjustment: step.sectorAdjustment }
          : {
              kind: 'burn',
              intensity: step.burnIntensity ?? 'soft',
              adjustment: step.sectorAdjustment,
            }
    // Prograde burns outward, retrograde inward: the step says which way, the ship says where it points.
    const neededFacing: Facing | null =
      step.actionType === 'burn_prograde'
        ? 'prograde'
        : step.actionType === 'burn_retrograde'
          ? 'retrograde'
          : null
    const rotate = neededFacing !== null && neededFacing !== me.ship.facing
    setSteps(prev => {
      let next: PlanStep[] = prev.filter(s => s.kind !== 'rotate')
      if (rotate) {
        const moveIndex = next.findIndex(s => s.kind === 'move')
        next = [...next]
        next.splice(Math.max(0, moveIndex), 0, { id: stepId(), kind: 'rotate' })
      }
      return next.map(s => (s.kind === 'move' ? { ...s, move } : s))
    })
    // Cubes the step needs, never taking any back.
    const raise = (id: SubsystemId, wanted: number) => {
      if ((energy[id] ?? 0) < wanted) setEnergyTo(id, wanted)
    }
    if (move.kind === 'burn') raise('engines', BURN_COSTS[move.intensity].energy)
    if (move.kind === 'jump') raise('engines', WELL_TRANSFER_COSTS.energy)
    if (move.kind === 'coast' && move.scoop) raise('scoop', getSubsystemConfig('scoop').minEnergy)
    if (rotate) raise('rotation', getSubsystemConfig('rotation').minEnergy)
  }, [route, energy, setEnergyTo, me.ship.facing])

  const setMove = useCallback((move: MoveChoice) => {
    setSteps(prev => prev.map(s => (s.kind === 'move' ? { ...s, move } : s)))
  }, [])

  const toggleRotate = useCallback(() => {
    setSteps(prev => {
      if (prev.some(s => s.kind === 'rotate')) return prev.filter(s => s.kind !== 'rotate')
      const moveIndex = prev.findIndex(s => s.kind === 'move')
      const next = [...prev]
      next.splice(Math.max(0, moveIndex), 0, { id: stepId(), kind: 'rotate' })
      return next
    })
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
    },
    [targets]
  )

  const addScan = useCallback(() => {
    setSteps(prev =>
      prev.some(s => s.kind === 'scan')
        ? prev
        : [...prev, { id: stepId(), kind: 'scan', targetId: null, peekSlot: null }]
    )
  }, [])

  /**
   * Which tile a scan should look at by default: the first face-down one, in
   * mat order. If every tile is already known to you, any slot will do — the
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
          // Aiming a scan at someone else invalidates the slot picked on the old mat.
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
      steps,
      moveStep,
      energy,
      pendingSubsystems,
      availableEnergy,
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
      massCost,
      projectedFuel,
      issues,
      actions,
      picking,
      focusWeaponId:
        focusWeaponId ??
        [...steps].reverse().find((s): s is FireStep => s.kind === 'fire')?.subsystemId ??
        null,
      targets,
      targetsInRange,
      targetsOutOfReach,
      allocate,
      setEnergyTo,
      power,
      setMove,
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
      routeDestination,
      routeStation,
      routeMode,
      setRouteMode,
      routes,
      route,
      routeIndex,
      setRouteDestination,
      selectRoute,
      applyRouteStep,
    }),
    [
      me,
      isMyTurn,
      steps,
      moveStep,
      energy,
      pendingSubsystems,
      availableEnergy,
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
      massCost,
      projectedFuel,
      issues,
      actions,
      picking,
      focusWeaponId,
      targets,
      targetsInRange,
      targetsOutOfReach,
      allocate,
      setEnergyTo,
      power,
      setMove,
      toggleRotate,
      addFire,
      addScan,
      updateStep,
      removeStep,
      reorderStep,
      repairChoice,
      setRepairChoice,
      repairable,
      routeDestination,
      routeStation,
      routeMode,
      setRouteMode,
      routes,
      route,
      routeIndex,
      setRouteDestination,
      selectRoute,
      applyRouteStep,
      pickSlot,
      pickTarget,
      reset,
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
