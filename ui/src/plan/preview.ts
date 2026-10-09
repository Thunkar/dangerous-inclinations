/**
 * The turn being planned, previewed with no React in it.
 *
 * A plan is an ordered list of steps (rotate, one move, any number of
 * weapons, a scan, a seizure per free Piracy card, a survey, a salvage, an
 * Escort marker per marker in hand) plus the tiles it powers. Everything here
 * reads that plan
 * against the engine's own functions: where the ship is at each step, what
 * energy the loadout ends up holding, who is in range, what the engine would
 * refuse, and the actions the turn is sent as. Pure, so a test can hold it
 * against `executeTurn` on real states and prove the two agree
 * (`preview.test.ts`): the UI must never offer what the engine refuses.
 *
 * **Energy is shown, not set.** Every action puts energy on the tile it uses,
 * to the one draw that action has, so the energy on the loadout is a readout
 * of the plan. Powering is an action too, for the three tiles that work on
 * other players' turns (`isPowerableType`), and those start empty every turn.
 *
 * **The plan starts from an empty loadout.** The loadout is cleared when the
 * turn executes, so the energy the view still shows on your own tiles while
 * you plan is last turn's: none of it is carried into the preview.
 */
import type {
  BurnIntensity,
  Facing,
  GameView,
  Player,
  PlayerAction,
  Position,
  SaleOffer,
  SeizableItem,
  Station,
  Subsystem,
  SubsystemId,
  Wreck,
} from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  MAX_REACTION_MASS,
  SELL_NOTHING,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  canBeFiredAt,
  canSurvey,
  canBeScanned,
  canEngage,
  canFireFrom,
  drawFor,
  escortCandidates,
  freePiracyCards,
  findJump,
  getAdjustmentRange,
  getJumpAdjustmentRange,
  getJumpOptions,
  getStationAt,
  getSubsystemConfig,
  hasWorkingCompressor,
  heatFromCubes,
  inScanRange,
  isDestroyed,
  isInWeaponRange,
  isMooredAt,
  isMooredMidTurn,
  isOnBoard,
  isOpeningRound,
  isPowerableType,
  isQuietTurn,
  isWeaponType,
  lowestCriticalFace,
  onSurveyRing,
  oppositeFacing,
  phasedJumpDestination,
  projectPosition,
  recoilRing,
  ringAfter,
  ringVelocity,
  salesOnArrival,
  salvageToTake,
  salvageableWrecks,
  samePosition,
  seizableItems,
  surveyToTake,
  unplacedEscorts,
} from '@dangerous-inclinations/engine'
import { hullOf, slotWithSubsystem } from '../utils/slots'

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
  /**
   * Piracy: take this item off this ship where the step comes. It uses no
   * tile and puts no energy anywhere.
   */
  | { id: string; kind: 'seize'; victimId: string; cargoId: string }
  /** Survey: take the data where the step comes (Black Hole Ring 1). No tile, no energy. */
  | { id: string; kind: 'survey' }
  /**
   * Salvage: take this wreck's black box where the step comes. No tile, no
   * energy. A null `wreckId` names none: the first wreck in the sector there,
   * which is the wreck of `victimId` if the shot before the step kills it (a
   * ship is settled the moment it dies), and nothing taken if there is none.
   */
  | { id: string; kind: 'salvage'; wreckId: string | null; victimId: string | null }
  /** Escort: put a marker on this carrier where the step comes. No tile, no energy. */
  | { id: string; kind: 'mark'; carrierId: string }

export type FireStep = Extract<PlanStep, { kind: 'fire' }>
export type ScanStep = Extract<PlanStep, { kind: 'scan' }>
export type SeizeStep = Extract<PlanStep, { kind: 'seize' }>
export type MoveStep = Extract<PlanStep, { kind: 'move' }>

export interface StepContext {
  position: Position
  facing: Facing
}

export interface Target {
  id: string
  position: Position
}

/**
 * Whether a move is available, and what is in the way if it is not. Every
 * check is the one the validator makes (`game/validators.ts`), read off the
 * loadout as the player has planned it. `reason` is a clause, so a tooltip can
 * end a sentence with it.
 */
export interface MoveReadiness {
  ok: boolean
  reason: string
}

const READY: MoveReadiness = { ok: true, reason: '' }
const blocked = (reason: string): MoveReadiness => ({ ok: false, reason })

const BURN_INTENSITIES: BurnIntensity[] = ['soft', 'medium', 'hard']

/**
 * The tile each step uses. Each tile does one thing a turn, so a tile a step
 * fires or scans with is not powered as well: the action leaves its energy on
 * it, so a rack that fired is up and a sensor that scanned widens the range.
 */
export function tilesUsedBy(
  player: Player,
  steps: readonly PlanStep[]
): Record<SubsystemId, 'fire' | 'scan'> {
  const used: Record<SubsystemId, 'fire' | 'scan'> = {}
  for (const step of steps) {
    if (step.kind === 'fire') used[step.subsystemId] = 'fire'
    else if (step.kind === 'scan') {
      const sensor = player.ship.subsystems.find(s => s.type === 'sensor_array' && !s.isBroken)
      if (sensor) used[sensor.id] = 'scan'
    }
  }
  return used
}

/** The tile a power action may go on, or null: powerable, unbroken and not used by a step. */
export function powerableTile(
  player: Player,
  used: Record<SubsystemId, 'fire' | 'scan'>,
  subsystemId: SubsystemId
): Subsystem | null {
  const sub = player.ship.subsystems.find(s => s.id === subsystemId)
  if (!sub || sub.isBroken || !isPowerableType(sub.type) || used[subsystemId]) return null
  return sub
}

/**
 * The powers that stand: a choice on a tile a step now uses (or that broke)
 * is dropped rather than refused, since the step leaves its energy there.
 */
export function standingPowers(
  player: Player,
  powers: Record<SubsystemId, number>,
  used: Record<SubsystemId, 'fire' | 'scan'>
): Record<SubsystemId, number> {
  const out: Record<SubsystemId, number> = {}
  for (const [id, amount] of Object.entries(powers) as Array<[SubsystemId, number]>) {
    if (amount > 0 && powerableTile(player, used, id)) out[id] = amount
  }
  return out
}

/**
 * The cubes each step puts on the tile it uses: one legal figure per tile,
 * read off the engine's draws.
 */
export function drawsFor(player: Player, steps: readonly PlanStep[]): Record<SubsystemId, number> {
  const draws: Record<SubsystemId, number> = {}
  const take = (id: SubsystemId, cubes: number) => {
    const sub = player.ship.subsystems.find(s => s.id === id)
    if (!sub || sub.isBroken) return
    draws[id] = Math.max(draws[id] ?? 0, cubes)
  }
  for (const step of steps) {
    switch (step.kind) {
      case 'rotate':
        take('rotation', drawFor('rotation'))
        break
      case 'move':
        if (step.move.kind === 'burn')
          take('engines', drawFor('engines', BURN_COSTS[step.move.intensity].energy))
        else if (step.move.kind === 'jump')
          take('engines', drawFor('engines', WELL_TRANSFER_COSTS.energy))
        else if (step.move.scoop) take('scoop', drawFor('scoop'))
        break
      case 'fire': {
        const weapon = player.ship.subsystems.find(s => s.id === step.subsystemId)
        if (weapon) take(weapon.id, drawFor(weapon.type))
        if (step.compensateRecoil) take('engines', drawFor('engines', BURN_COSTS.soft.energy))
        break
      }
      case 'scan': {
        const sensor = player.ship.subsystems.find(s => s.type === 'sensor_array' && !s.isBroken)
        if (sensor) take(sensor.id, drawFor('sensor_array'))
        break
      }
    }
  }
  return draws
}

/**
 * The loadout a plan leaves: every tile starts empty, because the loadout is
 * cleared when the turn executes, then takes the plan's power or its step's
 * draw.
 */
export function loadoutFor(
  player: Player,
  powers: Record<SubsystemId, number>,
  draws: Record<SubsystemId, number>
): Subsystem[] {
  return player.ship.subsystems.map(s => {
    const allocatedEnergy = s.isBroken ? 0 : (powers[s.id] ?? draws[s.id] ?? 0)
    return { ...s, allocatedEnergy }
  })
}

/**
 * Where the ship is at the start of each step, and where the plan leaves it.
 * A rotation flips the facing, the move goes where the engine projects it,
 * and a railgun that is not compensated recoils one ring against its facing
 * (`recoilRing`). A coast holds a berth only when the ship began the turn on
 * it and is still there (`isMooredMidTurn`): a recoil onto a station drifts off.
 */
export function walkSteps(
  me: Player,
  steps: readonly PlanStep[],
  loadout: readonly Subsystem[],
  stations: Station[]
): { stepStart: StepContext[]; finalPosition: StepContext } {
  let position: Position = { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector }
  let facing: Facing = me.ship.facing
  const starts: StepContext[] = []
  for (const step of steps) {
    starts.push({ position, facing })
    switch (step.kind) {
      case 'rotate':
        facing = oppositeFacing(facing)
        break
      case 'move': {
        const move = step.move
        const shipHere = { ...me.ship, ...position, facing }
        if (move.kind === 'jump') {
          const jump = findJump(position, move.destinationWellId)
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
                  moored: isMooredMidTurn(stations, me.ship, position),
                })
          position = { wellId: p.wellId, ring: p.ring, sector: p.sector }
        }
        break
      }
      case 'fire': {
        const weapon = loadout.find(s => s.id === step.subsystemId)
        const recoils =
          weapon && getSubsystemConfig(weapon.type).weaponStats?.hasRecoil && !step.compensateRecoil
        if (recoils) {
          const ring = recoilRing({ ...position, facing })
          if (ring !== null) position = { ...position, ring }
        }
        break
      }
      case 'scan':
      case 'seize':
      case 'survey':
      case 'salvage':
      case 'mark':
        break
    }
  }
  return { stepStart: starts, finalPosition: { position, facing } }
}

/**
 * The rivals a step may be aimed at: on the board and not just back from
 * Home (RULES §Destruction and Respawn), the engine's `canBeScanned`.
 */
export function targetsFor(view: GameView): Target[] {
  return view.players
    .filter(p => !p.isMe && canBeScanned(p))
    .map(p => ({
      id: p.id,
      position: { wellId: p.ship!.wellId, ring: p.ship!.ring, sector: p.ship!.sector },
    }))
}

/** Whether a rival may be fired at at all: the engine's `canBeFiredAt`, a berth included. */
function firable(view: GameView, targetId: string): boolean {
  const player = view.players.find(p => p.id === targetId)
  return !!player && canBeFiredAt(player, view.stations)
}

/**
 * The targets a step reaches from where it starts. A shot needs the engine's
 * range and a target that may be fired at, from a ship that may fire (a
 * moored ship neither fires nor is fired at, missiles included, RULES
 * §Stations); a scan needs the same ring within range, and still reaches a
 * berth.
 */
export function targetsInRange(
  view: GameView,
  me: Player,
  step: PlanStep,
  at: StepContext,
  loadout: readonly Subsystem[],
  targets: readonly Target[]
): Target[] {
  if (step.kind === 'fire') {
    const weapon = loadout.find(s => s.id === step.subsystemId)
    if (!weapon || !canFireFrom(me.ship, at.position, view.stations)) return []
    const attacker = { ...at.position, facing: at.facing }
    return targets.filter(t => firable(view, t.id) && isInWeaponRange(weapon, attacker, t.position))
  }
  if (step.kind === 'scan') return targets.filter(t => inScanRange(at.position, t.position))
  return []
}

/**
 * Where a new shot goes in the sequence: after the move, unless only the
 * start of the move reaches anyone (a coast on a fast ring can carry the ship
 * out of every arc), and then right before it, after any rotation.
 */
export function shotIndex(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  shot: PlanStep,
  loadout: readonly Subsystem[]
): number {
  const moveIndex = steps.findIndex(s => s.kind === 'move')
  const { stepStart, finalPosition } = walkSteps(me, steps, loadout, view.stations)
  const targets = targetsFor(view)
  const reaches = (at: StepContext) =>
    targetsInRange(view, me, shot, at, loadout, targets).length > 0
  if (moveIndex < 0 || reaches(finalPosition) || !reaches(stepStart[moveIndex])) return steps.length
  return moveIndex
}

/**
 * A shot after the move that reaches nobody from there but would from where
 * the move starts: the sequence offers to fire it before the move instead.
 */
export function reachesOnlyBeforeMove(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  step: PlanStep,
  loadout: readonly Subsystem[]
): boolean {
  const moveIndex = steps.findIndex(s => s.kind === 'move')
  const index = steps.findIndex(s => s.id === step.id)
  if (step.kind !== 'fire' || moveIndex < 0 || index < moveIndex) return false
  const { stepStart } = walkSteps(me, steps, loadout, view.stations)
  const targets = targetsFor(view)
  const reaches = (at: StepContext) =>
    targetsInRange(view, me, step, at, loadout, targets).length > 0
  return !reaches(stepStart[index]) && reaches(stepStart[moveIndex])
}

/**
 * Targets this step may legally fire at but would not connect with: a
 * missile is launched at anyone in the well and only its own flight decides
 * whether it catches them.
 */
export function targetsOutOfReach(
  view: GameView,
  me: Player,
  step: PlanStep,
  at: StepContext,
  loadout: readonly Subsystem[],
  targets: readonly Target[]
): Target[] {
  if (step.kind !== 'fire') return []
  const weapon = loadout.find(s => s.id === step.subsystemId)
  if (!weapon) return []
  const attacker = { ...at.position, facing: at.facing }
  return targetsInRange(view, me, step, at, loadout, targets).filter(
    t => !canEngage(weapon, attacker, t.position)
  )
}

/**
 * Whether each move can be taken from the loadout as planned, so a control
 * the engine would refuse is not offered. The fuel asked about is the tank
 * at the start of the turn; the issues walk prices the plan in order.
 */
export function moveReadiness(
  me: Player,
  loadout: readonly Subsystem[],
  moveFrom: StepContext,
  move: MoveChoice
): {
  rotateReady: MoveReadiness
  burnReady: Record<BurnIntensity, MoveReadiness>
  jumpReady: MoveReadiness
} {
  const thrusters = loadout.find(s => s.id === 'rotation')
  const rotateReady =
    !thrusters || thrusters.isBroken
      ? blocked('the thrusters are broken')
      : thrusters.usedThisTurn
        ? blocked('the thrusters have already turned the ship')
        : READY

  const engines = loadout.find(s => s.id === 'engines')
  const fuel = me.ship.reactionMass
  // Phasing is part of the fuel bill, so the burn already being planned is
  // priced with the sectors it is shifting; the mode button asks about a
  // plain burn.
  const burnAdjustment = move.kind === 'burn' ? move.adjustment : 0
  const outward = moveFrom.facing === 'prograde' ? 'outward' : 'inward'
  const from = { ...moveFrom.position, facing: moveFrom.facing }
  const burnReady = Object.fromEntries(
    BURN_INTENSITIES.map(intensity => {
      const cost = BURN_COSTS[intensity]
      const rings = `${cost.rings} ring${cost.rings === 1 ? '' : 's'} ${outward}`
      const mass = calculateBurnMassCost(cost.mass, burnAdjustment)
      const state =
        !engines || engines.isBroken
          ? blocked('the engines are broken')
          : ringAfter(from, cost.rings) === null
            ? blocked(
                `there are not ${rings} from ring ${moveFrom.position.ring}: rotate to burn the other way`
              )
            : engines.usedThisTurn
              ? blocked('the engines have already burned this turn')
              : fuel < mass
                ? blocked(`it costs ${mass} fuel and ${fuel} is aboard`)
                : READY
      return [intensity, state]
    })
  ) as Record<BurnIntensity, MoveReadiness>

  let jumpReady = READY
  if (getJumpOptions(moveFrom.position).length === 0)
    jumpReady = blocked('jumps leave only from a lane end, and this sector is not one')
  else if (!engines || engines.isBroken) jumpReady = blocked('the engines are broken')
  else if (moveFrom.facing !== 'prograde' && !rotateReady.ok)
    jumpReady = blocked('a jump needs prograde facing and the ship cannot rotate')
  else if (engines.usedThisTurn) jumpReady = blocked('the engines have already burned this turn')
  else {
    const adjustment = move.kind === 'jump' ? move.adjustment : 0
    const compressor = hasWorkingCompressor({ ...me.ship, subsystems: [...loadout] })
    const mass = calculateJumpMassCost(adjustment, compressor)
    if (fuel < mass) jumpReady = blocked(`it costs ${mass} fuel and ${fuel} is aboard`)
  }
  return { rotateReady, burnReady, jumpReady }
}

/**
 * What the engine would refuse, walked in order. Fuel is spent *and earned*
 * as the turn plays out, so a scoop earlier in the sequence pays for a burn or
 * a recoil compensation later in it, exactly as the engine sees it. Heat is
 * not walked: energy refuses nothing, and a turn that lights more than the
 * ship can cool is legal and costs hull.
 */
export function planIssues(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  loadout: readonly Subsystem[],
  stepStart: readonly StepContext[],
  targets: readonly Target[]
): { projectedFuel: number; issues: string[] } {
  let fuel = me.ship.reactionMass
  const problems: string[] = []
  let engineUses = 0
  let reportedShortFuel = false
  const engines = loadout.find(s => s.id === 'engines')
  const enginesBroken = !engines || engines.isBroken
  const compressor = hasWorkingCompressor({ ...me.ship, subsystems: [...loadout] })
  const quiet = isQuietTurn(view.turn, me)
  const opening = isOpeningRound(view.turn)
  const seat = (id: string) => view.players.find(p => p.id === id)
  const nameOf = (id: string) => seat(id)?.name ?? id
  // A ship that just came back is off every target list until its own turn
  // is over, so a step still aimed at one is named rather than reported as
  // out of range.
  const untouchable = (id: string) => seat(id)?.recovering === true
  const freeCards = freePiracyCards(me.missions, me.cargo).length
  const seized = new Set<string>()
  // Items the plan's seizures take off each ship before a later step: a
  // carrier a pirate has emptied takes no Escort marker.
  const seizedFrom = new Map<string, number>()
  const start: Position = { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector }
  const markers = unplacedEscorts(me.missions).length
  const marked = new Set<string>()
  let surveys = 0
  let salvages = 0
  // Ships a shot before a step aims to hurt: a salvage naming no wreck takes
  // the one such a ship leaves if it dies in the salvage's sector.
  const shotAt: string[] = []

  const spend = (amount: number, what: string) => {
    if (amount > fuel && !reportedShortFuel) {
      reportedShortFuel = true
      problems.push(`Not enough fuel for ${what}: ${amount} needed, ${fuel} in the tank by then`)
    }
    fuel = Math.max(0, fuel - amount)
  }
  const inRange = (step: PlanStep, at: StepContext, id: string) =>
    targetsInRange(view, me, step, at, loadout, targets).some(t => t.id === id)

  steps.forEach((step, index) => {
    const at = stepStart[index]
    const facingShip = { ...at.position, facing: at.facing }
    switch (step.kind) {
      case 'rotate': {
        const thrusters = loadout.find(s => s.id === 'rotation')
        if (!thrusters || thrusters.isBroken)
          problems.push('Maneuvering thrusters are broken: no rotation')
        break
      }
      case 'move': {
        const move = step.move
        if (move.kind === 'burn') {
          const cost = BURN_COSTS[move.intensity]
          const range = getAdjustmentRange(ringVelocity(at.position.wellId, at.position.ring))
          engineUses++
          if (enginesBroken) problems.push('Engines are broken: no burn')
          if (move.adjustment < range.min || move.adjustment > range.max)
            problems.push(`Phasing must be between ${range.min} and +${range.max} from this ring`)
          if (ringAfter(facingShip, cost.rings) === null) {
            problems.push(
              `A ${move.intensity} burn ${at.facing === 'prograde' ? 'outward' : 'inward'} from ring ${
                at.position.ring
              } would leave the rings`
            )
          }
          spend(calculateBurnMassCost(cost.mass, move.adjustment), `a ${move.intensity} burn`)
        } else if (move.kind === 'jump') {
          engineUses++
          const option = findJump(at.position, move.destinationWellId)
          if (!option) problems.push('No transfer lane from here to that destination')
          else {
            const range = getJumpAdjustmentRange(option)
            if (move.adjustment < range.min || move.adjustment > range.max)
              problems.push(
                `Phasing a jump stays inside the arrival arc (${range.min} to +${range.max} from here)`
              )
          }
          if (enginesBroken) problems.push('Engines are broken: no jump')
          if (at.facing !== 'prograde')
            problems.push('A jump is a burn out of the well: face prograde (rotate first)')
          spend(calculateJumpMassCost(move.adjustment, compressor), 'a jump')
        } else if (move.scoop) {
          const scoop = loadout.find(s => s.id === 'scoop')
          if (!scoop || scoop.isBroken) problems.push('Fuel scoop is broken')
          // Fuel equal to this ring's velocity, up to the tank's capacity.
          else
            fuel = Math.min(
              MAX_REACTION_MASS,
              fuel + ringVelocity(at.position.wellId, at.position.ring)
            )
        }
        break
      }
      case 'fire': {
        const weapon = loadout.find(s => s.id === step.subsystemId)
        if (!weapon || !isWeaponType(weapon.type)) break
        const config = getSubsystemConfig(weapon.type)
        const name = slotWithSubsystem(weapon.id, weapon.type, hullOf(me))
        if (quiet)
          problems.push(
            opening
              ? 'No weapon fires in the first round'
              : 'Back from Home: no weapon of yours fires this turn'
          )
        // A salvo is one use of the tile, its energy once however big the
        // launch (RULES §Weapons → Missiles).
        if (weapon.isBroken) problems.push(`${name} is broken`)
        if (weapon.type === 'missiles') {
          const ammo = weapon.ammo ?? 0
          if (ammo <= 0) problems.push(`${name}: no missiles left aboard`)
          else if (step.count > ammo)
            problems.push(`${name}: ${step.count} missiles planned, ${ammo} aboard`)
          if (step.count < 1) problems.push(`${name}: a salvo launches at least one missile`)
        }
        const target = step.targetId ? seat(step.targetId) : undefined
        if (step.targetId && !config.weaponStats?.disrupts) shotAt.push(step.targetId)
        if (!canFireFrom(me.ship, at.position, view.stations))
          problems.push('A moored ship fires at nobody: burn off the berth first')
        else if (!step.targetId) problems.push(`${name}: pick a target`)
        else if (untouchable(step.targetId))
          problems.push(`${nameOf(step.targetId)} cannot be targeted until its turn back is over`)
        else if (
          target &&
          isOnBoard(target) &&
          !canBeFiredAt(target, view.stations)
        )
          problems.push(`${nameOf(step.targetId)} is moored: nobody fires at a ship at a berth`)
        else if (!inRange(step, at, step.targetId))
          problems.push(`${name}: target out of range from where you fire`)
        if (config.weaponStats?.hasRecoil) {
          if (step.compensateRecoil) {
            engineUses++
            if (enginesBroken)
              problems.push('Engines are broken: nothing to cancel the recoil with')
            spend(BURN_COSTS.soft.mass, 'recoil compensation')
          } else if (recoilRing(facingShip) === null) {
            problems.push('Railgun recoil would push you off the rings: compensate or rotate first')
          }
        }
        break
      }
      case 'scan': {
        const sensor = loadout.find(s => s.type === 'sensor_array')
        if (quiet)
          problems.push(
            opening
              ? 'Nobody scans in the first round'
              : 'Back from Home: you scan nobody this turn'
          )
        if (!sensor) problems.push('No sensor array aboard')
        else if (sensor.isBroken)
          problems.push(`${slotWithSubsystem(sensor.id, sensor.type, hullOf(me))} is broken`)
        if (!step.targetId) problems.push('Scan: pick a target on your ring within 3 sectors')
        else if (untouchable(step.targetId))
          problems.push(`${nameOf(step.targetId)} cannot be targeted until its turn back is over`)
        else if (!inRange(step, at, step.targetId))
          problems.push('Scan: the target must be on your ring within 3 sectors')
        if (!step.peekSlot) problems.push('Scan: choose which subsystem to look at')
        break
      }
      case 'seize': {
        // One item per free Piracy card, each a different item, and the item
        // is taken from where the ship is when the step comes.
        const victim = nameOf(step.victimId)
        const key = seizeKey(step)
        if (seized.has(key)) problems.push(`Seize: that item from ${victim} is named twice`)
        else if (seized.size >= freeCards)
          problems.push(
            freeCards === 0
              ? 'Seize: no Piracy card is free to take an item'
              : freeCards === 1
                ? 'Seize: one Piracy card takes one item'
                : `Seize: ${freeCards} Piracy cards take ${freeCards} items`
          )
        else if (quiet)
          problems.push(
            opening
              ? 'Nobody seizes in the first round'
              : 'Back from Home: you seize nothing this turn'
          )
        else if (untouchable(step.victimId))
          problems.push(`${victim} cannot be touched until its turn back is over`)
        else if (isMooredMidTurn(view.stations, me.ship, at.position))
          problems.push('A moored ship seizes nothing: burn off the berth first')
        else if (!seizableItems(view, me.id, at.position).some(i => seizeKey(i) === key))
          problems.push(`Seize: ${victim} is not in your sector with that item at this point`)
        if (!seized.has(key))
          seizedFrom.set(step.victimId, (seizedFrom.get(step.victimId) ?? 0) + 1)
        seized.add(key)
        break
      }
      // Survey, salvage and a marker touch nobody, so a quiet turn takes them.
      case 'survey': {
        surveys++
        if (surveys > 1) problems.push('One survey a turn')
        else if (!surveyToTake(me)) problems.push('Survey: no Survey card wants data')
        else if (!onSurveyRing(at.position))
          problems.push('Survey: you are not on Black Hole Ring 1 at this point')
        break
      }
      case 'salvage': {
        salvages++
        if (salvages > 1) problems.push('One wreck a turn')
        else if (!salvageToTake(me)) problems.push('Salvage: no Salvage card wants a black box')
        else if (step.wreckId === null) {
          // Naming none, it holds with a wreck there now or a kill before it
          // there: whether the shot kills is the dice's, not an issue.
          const prey = shotAt.some(id => {
            const ship = seat(id)?.ship
            return !!ship && isOnBoard(seat(id)!) && samePosition(ship, at.position)
          })
          if (!prey && !view.wrecks.some(w => samePosition(w, at.position)))
            problems.push(
              'Salvage: no wreck in your sector at this point, and no shot before it at a ship there'
            )
        } else if (!view.wrecks.some(w => w.id === step.wreckId))
          problems.push('Salvage: that wreck is not on the board')
        else if (!salvageableWrecks(me, view.wrecks, at.position).some(w => w.id === step.wreckId))
          problems.push('Salvage: the wreck is not in your sector at this point')
        break
      }
      case 'mark': {
        // One marker per undone Escort in hand, each on a different ship, put
        // on from where the ship is when the step comes.
        const carrier = nameOf(step.carrierId)
        const left = (seat(step.carrierId)?.cargoCount ?? 0) - (seizedFrom.get(step.carrierId) ?? 0)
        if (marked.has(step.carrierId)) problems.push(`Mark: ${carrier} is marked twice`)
        else if (marked.size >= markers)
          problems.push(
            markers === 0
              ? 'Mark: no Escort marker in hand'
              : markers === 1
                ? 'Mark: one Escort marker in hand'
                : `Mark: ${markers} Escort markers in hand`
          )
        else if (untouchable(step.carrierId))
          problems.push(`${carrier} cannot be touched until its turn back is over`)
        else if (isMooredMidTurn(view.stations, me.ship, at.position))
          problems.push('A moored ship marks nobody: burn off the berth first')
        else if (left <= 0) problems.push(`Mark: ${carrier} carries nothing at this point`)
        else if (!escortCandidates(view, me.id, at.position, start).includes(step.carrierId))
          problems.push(`Mark: ${carrier} cannot take your marker from where you are at this point`)
        marked.add(step.carrierId)
        break
      }
    }
  })

  if (engineUses > 1)
    problems.push('Engines act once per turn: burn/jump or recoil compensation, not both')
  return { projectedFuel: fuel, issues: problems }
}

/**
 * The lowest d10 face that is a critical for a fire step. A sensor with
 * energy on it widens the range: a powered one for every shot (power runs
 * first) and a scan for the shots after it. A salvo is no different: it
 * flies and attacks as it is launched, so it rolls with the sensor as the
 * steps before it left it.
 */
export function criticalFrom(
  me: Player,
  powers: Record<SubsystemId, number>,
  steps: readonly PlanStep[],
  step: PlanStep
): number {
  if (step.kind !== 'fire') return lowestCriticalFace([])
  const index = steps.findIndex(s => s.id === step.id)
  const before = index < 0 ? steps : steps.slice(0, index)
  return lowestCriticalFace(loadoutFor(me, powers, drawsFor(me, before)))
}

/**
 * A visit does one thing, load the crates waiting or sell one item, and a
 * station buys from each player once (RULES §Stations). Docking happens on
 * arrival only, so a ship that began the turn moored is holding its berth,
 * not visiting. Stations do not move during a turn, so where they are now is
 * where the plan meets them. Offered when there is something to do (doing
 * nothing keeps the station for later) or when the station has bought from
 * this player already, so the table can say so.
 */
export function dockOfferFor(
  view: GameView,
  me: Player,
  finalPosition: Position,
  projectedFuel: number
): (SaleOffer & { planetId: string }) | null {
  if (isDestroyed(me.ship) || isMooredAt(view.stations, me.ship)) return null
  const station = getStationAt(view.stations, finalPosition)
  if (!station) return null
  const offer = salesOnArrival(
    { cargo: me.cargo, missions: me.missions, reactionMass: projectedFuel, soldAt: me.soldAt },
    station.planetId
  )
  return offer.options.length > 0 || offer.soldHere ? { ...offer, planetId: station.planetId } : null
}

/** An item a seizure step may take, and whether the step goes before the move or after it. */
export type SeizeOption = SeizableItem & { before: boolean }

/**
 * Piracy is a "you may" (RULES §Missions), and an action in the sequence:
 * offered when a Piracy card is free and an undocked ship carrying cargo
 * shares the sector where the turn starts (taken before the move, ahead of
 * every shot) or where the move ends (taken right after it). The items and
 * the count come from the engine (`seizableItems`, `freePiracyCards`). Ships
 * do not move during a turn, so where they are now is where the plan meets
 * them.
 */
export function seizeOfferFor(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  stepStart: readonly StepContext[],
  finalPosition: StepContext
): { items: SeizeOption[]; cards: number } | null {
  if (isDestroyed(me.ship)) return null
  const { start, afterMove } = beforeAndAfterMove(me, steps, stepStart, finalPosition)
  const before = seizableItems(view, me.id, start).map(i => ({ ...i, before: true }))
  const after = seizableItems(view, me.id, afterMove)
    .filter(i => !before.some(b => seizeKey(b) === seizeKey(i)))
    .map(i => ({ ...i, before: false }))
  const items = [...before, ...after]
  return items.length > 0 ? { items, cards: freePiracyCards(me.missions, me.cargo).length } : null
}

/**
 * Where a new seizure, survey, salvage or marker goes: first of all when it
 * can be done where the turn starts, so no shot of the turn can take its
 * ship down first; otherwise right after the move, ahead of the shots after
 * it.
 */
export function placementIndex(steps: readonly PlanStep[], option: { before: boolean }): number {
  if (option.before) return 0
  return steps.findIndex(s => s.kind === 'move') + 1
}

/** Where the turn starts, and where the ship is right after the move. */
function beforeAndAfterMove(
  me: Player,
  steps: readonly PlanStep[],
  stepStart: readonly StepContext[],
  finalPosition: StepContext
): { start: Position; afterMove: Position } {
  const start: Position = { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector }
  const moveIndex = steps.findIndex(s => s.kind === 'move')
  return { start, afterMove: stepStart[moveIndex + 1]?.position ?? finalPosition.position }
}

/** The key a seizure is known by: the victim and the item. */
export const seizeKey = (item: Pick<SeizableItem, 'victimId' | 'cargoId'>) =>
  `${item.victimId}/${item.cargoId}`

/** Whether a survey step goes before the move or after it. */
export interface SurveyOption {
  before: boolean
}

/**
 * Survey is a "you may" (RULES §Missions), and an action in the sequence:
 * offered when a Survey card wants data and the ship is on Black Hole Ring 1
 * where the turn starts (taken before the move) or where the move ends (taken
 * right after it). The engine's `canSurvey` answers both.
 */
export function surveyOfferFor(
  me: Player,
  steps: readonly PlanStep[],
  stepStart: readonly StepContext[],
  finalPosition: StepContext
): SurveyOption | null {
  if (isDestroyed(me.ship)) return null
  const { start, afterMove } = beforeAndAfterMove(me, steps, stepStart, finalPosition)
  if (canSurvey(me, start)) return { before: true }
  if (canSurvey(me, afterMove)) return { before: false }
  return null
}

/** A wreck a salvage step may name, and whether the step goes before the move or after it. */
export type SalvageOption = Wreck & { before: boolean }

/**
 * A salvage that counts on a kill: `victimId` stands in the sector the ship
 * is in after the plan's last shot at it, so a salvage at `index` (right
 * after that shot) takes its black box if the shot destroys it.
 */
export interface KillSalvageOption {
  victimId: string
  index: number
}

/** What a salvage offer is known by: its wreck, or the ship it counts on dying. */
export const salvageOptionKey = (option: SalvageOption | KillSalvageOption): string =>
  'victimId' in option ? `if-dies:${option.victimId}` : `wreck:${option.id}`

/** The key of the offer a salvage step was made from. */
export const salvageStepKey = (step: Extract<PlanStep, { kind: 'salvage' }>): string =>
  step.wreckId === null ? `if-dies:${step.victimId}` : `wreck:${step.wreckId}`

/**
 * Salvage is a "you may" (RULES §Missions), and an action in the sequence:
 * offered when a Salvage card wants a black box and a wreck is on the sector
 * where the turn starts or where the move ends, moored or not
 * (`salvageableWrecks`). Wrecks drift only when the stations do, so where
 * they are now is where the plan meets them. A ship is settled the moment it
 * dies, so a ship a shot of the plan aims at, standing in the sector the ship
 * is in after that shot, is offered too (`kills`): a salvage right after the
 * shot takes its black box if the shot destroys it. Not where a wreck is
 * there already: one wreck a turn, and that one is taken first.
 */
export function salvageOfferFor(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  stepStart: readonly StepContext[],
  finalPosition: StepContext
): { wrecks: SalvageOption[]; kills: KillSalvageOption[] } | null {
  if (isDestroyed(me.ship) || !salvageToTake(me)) return null
  const { start, afterMove } = beforeAndAfterMove(me, steps, stepStart, finalPosition)
  const before = salvageableWrecks(me, view.wrecks, start).map(w => ({ ...w, before: true }))
  const after = salvageableWrecks(me, view.wrecks, afterMove)
    .filter(w => !before.some(b => b.id === w.id))
    .map(w => ({ ...w, before: false }))
  const wrecks = [...before, ...after]
  // The last shot at each ship that can hurt it (a disruptor takes no hull).
  const lastShot = new Map<string, number>()
  steps.forEach((step, index) => {
    if (step.kind !== 'fire' || !step.targetId) return
    const weapon = me.ship.subsystems.find(s => s.id === step.subsystemId)
    if (!weapon || !isWeaponType(weapon.type)) return
    if (getSubsystemConfig(weapon.type).weaponStats?.disrupts) return
    lastShot.set(step.targetId, index)
  })
  const kills: KillSalvageOption[] = []
  for (const [victimId, last] of lastShot) {
    const victim = view.players.find(p => p.id === victimId)
    if (!victim?.ship || !isOnBoard(victim)) continue
    const there = stepStart[last + 1]?.position ?? finalPosition.position
    if (!samePosition(victim.ship, there)) continue
    if (view.wrecks.some(w => samePosition(w, there))) continue
    kills.push({ victimId, index: last + 1 })
  }
  return wrecks.length > 0 || kills.length > 0 ? { wrecks, kills } : null
}

/** A carrier a marker step may go on, and whether the step goes before the move or after it. */
export interface MarkOption {
  carrierId: string
  before: boolean
}

/**
 * An Escort marker is a "you may" (RULES §Missions, Escort), and an action in
 * the sequence: offered when a marker is in hand and a carrier the engine
 * would let it go on (`escortCandidates`) shares the ring where the turn
 * starts (marked before the move) or where the move ends (right after it).
 * Mooring is judged against the berth the turn began on, as for a shot.
 */
export function markOfferFor(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  stepStart: readonly StepContext[],
  finalPosition: StepContext
): { carriers: MarkOption[]; markers: number } | null {
  if (isDestroyed(me.ship)) return null
  const { start, afterMove } = beforeAndAfterMove(me, steps, stepStart, finalPosition)
  const before = escortCandidates(view, me.id, start, start).map(carrierId => ({
    carrierId,
    before: true,
  }))
  const after = escortCandidates(view, me.id, afterMove, start)
    .filter(id => !before.some(b => b.carrierId === id))
    .map(carrierId => ({ carrierId, before: false }))
  const carriers = [...before, ...after]
  return carriers.length > 0 ? { carriers, markers: unplacedEscorts(me.missions).length } : null
}

/**
 * A repair needs the ship cold at its check: nothing carried in and no energy
 * anywhere on the loadout, which is the same sentence as the heat rule.
 */
export function repairableFor(me: Player, loadout: readonly Subsystem[]): SubsystemId[] {
  return me.ship.heat.currentHeat === 0 && heatFromCubes([...loadout]) === 0
    ? me.ship.subsystems.filter(s => s.isBroken).map(s => s.id)
    : []
}

/** Everything the preview says about a plan, computed once. */
export interface PlanPreview {
  used: Record<SubsystemId, 'fire' | 'scan'>
  /** The powers that stand (see {@link standingPowers}). */
  powers: Record<SubsystemId, number>
  /** My subsystems as the plan leaves them: an empty loadout plus the powers and the steps' draws. */
  loadout: Subsystem[]
  stepStart: StepContext[]
  finalPosition: StepContext
  /** Where the move step starts from, for jump options and phasing limits. */
  moveFrom: StepContext
  targets: Target[]
  projectedFuel: number
  issues: string[]
  dockOffer: (SaleOffer & { planetId: string }) | null
  seizeOffer: { items: SeizeOption[]; cards: number } | null
  surveyOffer: SurveyOption | null
  salvageOffer: { wrecks: SalvageOption[]; kills: KillSalvageOption[] } | null
  markOffer: { carriers: MarkOption[]; markers: number } | null
  repairable: SubsystemId[]
}

export function previewPlan(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  powerChoices: Record<SubsystemId, number>
): PlanPreview {
  const used = tilesUsedBy(me, steps)
  const powers = standingPowers(me, powerChoices, used)
  const loadout = loadoutFor(me, powers, drawsFor(me, steps))
  const { stepStart, finalPosition } = walkSteps(me, steps, loadout, view.stations)
  const moveIndex = steps.findIndex(s => s.kind === 'move')
  const moveFrom =
    moveIndex >= 0
      ? stepStart[moveIndex]
      : {
          position: { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector },
          facing: me.ship.facing,
        }
  const targets = targetsFor(view)
  const { projectedFuel, issues } = planIssues(view, me, steps, loadout, stepStart, targets)
  return {
    used,
    powers,
    loadout,
    stepStart,
    finalPosition,
    moveFrom,
    targets,
    projectedFuel,
    issues,
    dockOffer: dockOfferFor(view, me, finalPosition.position, projectedFuel),
    seizeOffer: seizeOfferFor(view, me, steps, stepStart, finalPosition),
    surveyOffer: surveyOfferFor(me, steps, stepStart, finalPosition),
    salvageOffer: salvageOfferFor(view, me, steps, stepStart, finalPosition),
    markOffer: markOfferFor(view, me, steps, stepStart, finalPosition),
    repairable: repairableFor(me, loadout),
  }
}

/** The choices made around the steps, each sent only while the preview still offers it. */
export interface PlanExtras {
  repair: SubsystemId | null
  /** The sale picked: an option's `sale`, or `SELL_NOTHING`; null for the default. */
  dockSale: string | null
}

/**
 * The actions the plan is sent as. Power comes first, in loadout order: a
 * sensor powered now widens every shot the turn takes, and a wall or a rack
 * is up whatever else happens. A step still missing its target is not sent,
 * and neither is a repair or a sale the preview no longer offers.
 */
export function planActions(
  me: Player,
  steps: readonly PlanStep[],
  preview: Pick<PlanPreview, 'powers' | 'stepStart' | 'repairable' | 'dockOffer'>,
  extras: PlanExtras
): PlayerAction[] {
  const list: PlayerAction[] = []
  let sequence = 0
  for (const sub of me.ship.subsystems) {
    const amount = preview.powers[sub.id]
    if (!amount) continue
    list.push({
      playerId: me.id,
      type: 'power',
      sequence: ++sequence,
      data: { subsystemId: sub.id, amount },
    })
  }
  steps.forEach((step, index) => {
    const at = preview.stepStart[index]
    switch (step.kind) {
      case 'rotate':
        list.push({
          playerId: me.id,
          type: 'rotate',
          sequence: ++sequence,
          data: { targetFacing: oppositeFacing(at.facing) },
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
      case 'seize':
        list.push({
          playerId: me.id,
          type: 'seize',
          sequence: ++sequence,
          data: { victimId: step.victimId, cargoId: step.cargoId },
        })
        break
      case 'survey':
        list.push({ playerId: me.id, type: 'survey', sequence: ++sequence, data: {} })
        break
      case 'salvage':
        list.push({
          playerId: me.id,
          type: 'salvage',
          sequence: ++sequence,
          data: step.wreckId === null ? {} : { wreckId: step.wreckId },
        })
        break
      case 'mark':
        list.push({
          playerId: me.id,
          type: 'escort_mark',
          sequence: ++sequence,
          data: { carrierId: step.carrierId },
        })
        break
    }
  })
  if (extras.repair !== null && preview.repairable.includes(extras.repair))
    list.push({ playerId: me.id, type: 'repair', data: { subsystemId: extras.repair } })
  // Without a pick the engine makes the default sale, which is what the control shows lit.
  const sale = extras.dockSale
  const offered =
    sale === SELL_NOTHING
      ? (preview.dockOffer?.options.length ?? 0) > 0
      : preview.dockOffer?.options.some(o => o.sale === sale)
  if (sale !== null && offered)
    list.push({ playerId: me.id, type: 'dock_sale', data: { sale } })
  return list
}
