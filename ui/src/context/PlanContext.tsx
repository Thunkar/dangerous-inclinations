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
} from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  SCAN_SECTOR_RANGE,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  canSubsystemFunction,
  getAdjustmentRange,
  getJumpOptions,
  getMaxReactionMass,
  getMaxRing,
  getSubsystemConfig,
  hasWorkingCompressor,
  isInWeaponRange,
  isWeaponType,
  opponentPositions,
  projectPosition,
  ringVelocity,
  sectorDistance,
  planMovementAlternatives,
  samePosition,
} from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'

export type MoveChoice =
  | { kind: 'coast'; scoop: boolean }
  | { kind: 'burn'; intensity: BurnIntensity; adjustment: number }
  | { kind: 'jump'; destinationWellId: string }

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
  /** Burn intensities that stay inside the well from where the move starts. */
  availableBurns: Record<BurnIntensity, boolean>
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
  /** Route planner: a destination sector, the routes the engine finds, and the one in view. */
  routeDestination: Position | null
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

function defaultSteps(): PlanStep[] {
  return [{ id: stepId(), kind: 'move', move: { kind: 'coast', scoop: false } }]
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
  const [steps, setSteps] = useState<PlanStep[]>(defaultSteps)
  const [picking, setPicking] = useState<Picking>(null)
  const [focusWeaponId, setFocusWeaponId] = useState<SubsystemId | null>(null)
  const [routeDestination, setRouteDestinationState] = useState<Position | null>(null)
  const [routeIndex, setRouteIndex] = useState(0)

  const isMyTurn = !readOnly && view.activePlayerId === me.id && view.phase === 'active'

  const reset = useCallback(() => {
    setEnergy(committedEnergy(me))
    setSteps(defaultSteps())
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
            if (jump) position = jump.destination
          } else {
            const p =
              move.kind === 'burn'
                ? projectPosition(shipHere, facing, {
                    kind: 'burn',
                    burnIntensity: move.intensity,
                    sectorAdjustment: move.adjustment,
                  })
                : projectPosition(shipHere, facing, { kind: 'coast' })
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
  }, [steps, me.ship, pendingSubsystems])

  const moveFrom = useMemo(() => {
    const index = steps.findIndex(s => s.kind === 'move')
    return index >= 0 ? stepStart[index] : { position: me.ship, facing: me.ship.facing }
  }, [steps, stepStart, me.ship])

  const jumpOptions = useMemo(() => getJumpOptions(moveFrom.position), [moveFrom])
  const adjustmentRange = useMemo(
    () => getAdjustmentRange(ringVelocity(moveFrom.position.wellId, moveFrom.position.ring)),
    [moveFrom]
  )
  const availableBurns = useMemo<Record<BurnIntensity, boolean>>(() => {
    const entries = BURN_INTENSITIES.map(intensity => [
      intensity,
      burnFitsInWell(moveFrom.position, moveFrom.facing, intensity),
    ])
    return Object.fromEntries(entries) as Record<BurnIntensity, boolean>
  }, [moveFrom])

  const scoopGain = ringVelocity(moveFrom.position.wellId, moveFrom.position.ring)

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

  // Route planner: from where the ship is now (the first step is this turn's move).
  const routes = useMemo<MovementPlan[]>(() => {
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
  }, [routeDestination, me.ship, pendingSubsystems, compressor, view.myStats])
  const route = routes[Math.min(routeIndex, Math.max(0, routes.length - 1))] ?? null

  // Arrived: the route has done its job.
  useEffect(() => {
    if (routeDestination && samePosition(me.ship, routeDestination)) setRouteDestinationState(null)
  }, [routeDestination, me.ship])

  /**
   * Walk the sequence in order. Heat accumulates, fuel is spent *and earned*
   * as the turn plays out, so a scoop earlier in the sequence pays for a burn
   * or a recoil compensation later in it — exactly as the engine sees it.
   */
  const { projectedHeat, massCost, projectedFuel, issues } = useMemo(() => {
    let heat = me.ship.heat.currentHeat
    let spent = 0
    let fuel = me.ship.reactionMass
    const maxFuel = getMaxReactionMass(pendingSubsystems)
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
            if (!engines || engines.isBroken) problems.push('Engines are broken: no jump')
            else if (engines.allocatedEnergy < WELL_TRANSFER_COSTS.energy)
              problems.push(`A jump needs ${WELL_TRANSFER_COSTS.energy} energy on the engines`)
            else heat += engines.allocatedEnergy
            if (!compressor) spend(WELL_TRANSFER_COSTS.mass, 'a jump')
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
          if (weapon.isBroken) problems.push(`${config.name} is broken`)
          else if (!weapon.isPowered)
            problems.push(`${config.name} needs ${config.minEnergy} energy to fire`)
          else heat += weapon.allocatedEnergy
          if (weapon.type === 'missiles' && (weapon.ammo ?? 0) <= 0)
            problems.push('No missiles left aboard')
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
              data: { destinationWellId: step.move.destinationWellId },
            })
          }
          break
        case 'fire':
          if (!step.targetId) break
          list.push({
            playerId: me.id,
            type: 'fire_weapon',
            sequence: ++sequence,
            data: {
              subsystemId: step.subsystemId,
              targetPlayerId: step.targetId,
              criticalTarget: step.criticalTarget,
              ...(step.compensateRecoil ? { compensateRecoil: true } : {}),
            },
          })
          break
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
    return list
  }, [me, energy, steps, stepStart])

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
        let next = current
        if (delta > 0) {
          // From off, a tile powers up straight to its minimum.
          const target = current === 0 ? Math.max(config.minEnergy, delta) : current + delta
          next = Math.min(config.maxEnergy, target)
          if (next - current > free) next = current + free
          if (next < config.minEnergy) return prev
        } else if (delta < 0) {
          const target = current + delta
          next = target < config.minEnergy ? 0 : target
        }
        if (next === current) return prev
        return { ...prev, [subsystemId]: next }
      })
    },
    [me]
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
        let next = current
        if (direction > 0) {
          if (current === 0) {
            // Powering on costs the whole minimum at once, or nothing.
            if (free < config.minEnergy) return prev
            next = config.minEnergy
          } else {
            if (current >= config.maxEnergy || free < 1) return prev
            next = current + 1
          }
        } else {
          if (current === 0) return prev
          next = current <= config.minEnergy ? 0 : current - 1
        }
        if (next === current) return prev
        return { ...prev, [subsystemId]: next }
      })
    },
    [me]
  )

  const setRouteDestination = useCallback((position: Position | null) => {
    setRouteDestinationState(position)
    setRouteIndex(0)
    setPicking(p => (p?.kind === 'destination' ? null : p))
  }, [])

  const selectRoute = useCallback((index: number) => setRouteIndex(index), [])

  const applyRouteStep = useCallback(() => {
    const step: MovementStep | undefined = route?.steps[0]
    if (!step) return
    const move: MoveChoice =
      step.actionType === 'coast'
        ? { kind: 'coast', scoop: step.massCost < 0 }
        : step.actionType === 'well_transfer'
          ? { kind: 'jump', destinationWellId: step.to.wellId }
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
      availableBurns,
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
      routeDestination,
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
      availableBurns,
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
      routeDestination,
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
