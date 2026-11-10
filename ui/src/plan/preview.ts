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
  StepRefusal,
  Subsystem,
  SubsystemId,
  TurnWalk,
  WalkPoint,
  Wreck,
} from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  BURN_INTENSITIES,
  SCAN_SECTOR_RANGE,
  SELL_NOTHING,
  WELL_TRANSFER_COSTS,
  canBeTargeted,
  canSurvey,
  coldAtCheck,
  isTouchable,
  canEngage,
  canFireFrom,
  drawFor,
  escortCandidates,
  fill,
  freePiracyCards,
  getJumpOptions,
  getStationAt,
  getSubsystemConfig,
  inScanRange,
  isDestroyed,
  isInWeaponRange,
  isMooredAt,
  isOnBoard,
  isPowerableType,
  isWeaponType,
  lowestCriticalFace,
  oppositeFacing,
  refusal,
  refusalText,
  salesOnArrival,
  salvageToTake,
  salvageableWrecks,
  scoopYield,
  samePosition,
  seizableItems,
  unplacedEscorts,
  walkTurn,
} from '@dangerous-inclinations/engine'
import { hullOf, slotWithSubsystem } from '../utils/slots'
import { ACTIONS } from '../text/actions'

const I = ACTIONS.issues

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
 * Whether a move is available, and what is in the way if it is not: the
 * engine's own reason, from its walk of the plan with that move in it.
 */
export interface MoveReadiness {
  ok: boolean
  reason: string
}

const READY: MoveReadiness = { ok: true, reason: '' }
const blocked = (reason: string): MoveReadiness => ({ ok: false, reason })

/**
 * The tile each step uses. Each tile does one thing a turn, so a tile a step
 * fires or scans with is not powered as well: the action leaves its energy on
 * it, so a rack that fired is up and a sensor that scanned widens the range.
 */
function tilesUsedBy(
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
function standingPowers(
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
function drawsFor(player: Player, steps: readonly PlanStep[]): Record<SubsystemId, number> {
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
function loadoutFor(
  player: Player,
  powers: Record<SubsystemId, number>,
  draws: Record<SubsystemId, number>
): Subsystem[] {
  return player.ship.subsystems.map(s => {
    const allocatedEnergy = s.isBroken ? 0 : (powers[s.id] ?? draws[s.id] ?? 0)
    return { ...s, allocatedEnergy }
  })
}

/** The facing each step starts with: only a rotation turns the ship. */
function facingsBefore(me: Player, steps: readonly PlanStep[]): Facing[] {
  let facing = me.ship.facing
  return steps.map(step => {
    const before = facing
    if (step.kind === 'rotate') facing = oppositeFacing(facing)
    return before
  })
}

/**
 * The action a step is sent as, at its place in the sequence. A shot or a
 * scan still missing its target, or a scan its slot, is walked with an empty
 * name, so it is drawn where it goes and refused for that reason alone
 * (`issuesOf` says which choice is missing); `planActions` does not send it.
 */
function stepAction(me: Player, step: PlanStep, facing: Facing, sequence: number): PlayerAction {
  const playerId = me.id
  switch (step.kind) {
    case 'rotate':
      return { playerId, type: 'rotate', sequence, data: { targetFacing: oppositeFacing(facing) } }
    case 'move':
      return step.move.kind === 'coast'
        ? { playerId, type: 'coast', sequence, data: { activateScoop: step.move.scoop } }
        : step.move.kind === 'burn'
          ? {
              playerId,
              type: 'burn',
              sequence,
              data: { burnIntensity: step.move.intensity, sectorAdjustment: step.move.adjustment },
            }
          : {
              playerId,
              type: 'well_transfer',
              sequence,
              data: {
                destinationWellId: step.move.destinationWellId,
                sectorAdjustment: step.move.adjustment,
              },
            }
    case 'fire': {
      // Only a missiles tile takes a count: the engine refuses one on any
      // other weapon, so it is sent for a launcher and nothing else.
      const weapon = me.ship.subsystems.find(s => s.id === step.subsystemId)
      return {
        playerId,
        type: 'fire_weapon',
        sequence,
        data: {
          subsystemId: step.subsystemId,
          targetPlayerId: step.targetId ?? '',
          criticalTarget: step.criticalTarget,
          ...(step.compensateRecoil ? { compensateRecoil: true } : {}),
          ...(weapon?.type === 'missiles' ? { count: step.count } : {}),
        },
      }
    }
    case 'scan':
      return {
        playerId,
        type: 'scan',
        sequence,
        data: { targetPlayerId: step.targetId ?? '', peekSlot: step.peekSlot ?? '' },
      }
    case 'seize':
      return {
        playerId,
        type: 'seize',
        sequence,
        data: { victimId: step.victimId, cargoId: step.cargoId },
      }
    case 'survey':
      return { playerId, type: 'survey', sequence, data: {} }
    case 'salvage':
      return {
        playerId,
        type: 'salvage',
        sequence,
        data: step.wreckId === null ? {} : { wreckId: step.wreckId },
      }
    case 'mark':
      return { playerId, type: 'escort_mark', sequence, data: { carrierId: step.carrierId } }
  }
}

/** Power first, in loadout order: a sensor powered now widens every shot the turn takes. */
function powerActionsFor(me: Player, powers: Record<SubsystemId, number>): PlayerAction[] {
  return me.ship.subsystems
    .filter(sub => (powers[sub.id] ?? 0) > 0)
    .map((sub, index) => ({
      playerId: me.id,
      type: 'power',
      sequence: index + 1,
      data: { subsystemId: sub.id, amount: powers[sub.id] },
    }))
}

/**
 * The engine's walk of the plan (`walkTurn`): its powers, then every step in
 * order. `offset` is where the steps start among the actions walked.
 */
function walkPlan(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  powers: Record<SubsystemId, number>
): { walk: TurnWalk; offset: number } {
  const power = powerActionsFor(me, powers)
  const facings = facingsBefore(me, steps)
  const actions = [
    ...power,
    ...steps.map((step, i) => stepAction(me, step, facings[i], power.length + i + 1)),
  ]
  return { walk: walkTurn(view, actions), offset: power.length }
}

const contextOf = (point: WalkPoint): StepContext => ({
  position: point.position,
  facing: point.facing,
})

/** Where the ship is at the start of each step, and where the plan leaves it: the engine's walk. */
function stepStarts(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[]
): { stepStart: StepContext[]; finalPosition: StepContext } {
  const { walk, offset } = walkPlan(view, me, steps, {})
  return {
    stepStart: steps.map((_, i) => contextOf(walk.at[offset + i])),
    finalPosition: contextOf(walk.end),
  }
}

/**
 * What the engine would refuse, walked in order, in its words with the
 * table's slot names, and a salvage that can only come to nothing. A step
 * still missing a choice says which one instead.
 */
function issuesOf(
  me: Player,
  steps: readonly PlanStep[],
  walk: TurnWalk,
  offset: number
): string[] {
  const hull = hullOf(me)
  const slotName = (sub: { id: SubsystemId; type: Subsystem['type'] }) =>
    slotWithSubsystem(sub.id, sub.type, hull)
  const text = (r: StepRefusal): string => {
    const step = r.step === null ? undefined : steps[r.step - offset]
    if (step?.kind === 'fire' && step.targetId === null && r.code === 'noPlayer') {
      const weapon = me.ship.subsystems.find(s => s.id === step.subsystemId)
      return fill(I.pickTarget, { slot: weapon ? slotName(weapon) : step.subsystemId })
    }
    if (step?.kind === 'scan' && step.targetId === null && r.code === 'noPlayer')
      return fill(I.scanPick, { range: SCAN_SECTOR_RANGE })
    if (step?.kind === 'scan' && step.peekSlot === null && r.code === 'peekNotSlot')
      return I.scanPeek
    return refusalText(r, slotName)
  }
  return [
    ...walk.refusals.map(text),
    ...walk.warnings.filter(w => w.code === 'salvageNothing').map(text),
  ]
}

/**
 * The rivals a step may be aimed at: on the board and not just back from
 * Home (RULES §Destruction and Respawn), the engine's `isTouchable`.
 */
function targetsFor(view: GameView): Target[] {
  return view.players
    .filter(p => !p.isMe && isTouchable(p))
    .map(p => ({
      id: p.id,
      position: { wellId: p.ship!.wellId, ring: p.ship!.ring, sector: p.ship!.sector },
    }))
}

/** Whether a rival may be fired at or scanned at all: the engine's `canBeTargeted`, a berth included. */
function targetable(view: GameView, targetId: string): boolean {
  const player = view.players.find(p => p.id === targetId)
  return !!player && canBeTargeted(player, view.stations)
}

/**
 * The targets a step reaches from where it starts. A shot needs the engine's
 * range and a target that may be fired at, from a ship that may fire (a
 * moored ship neither fires nor is fired at, missiles included, RULES
 * §Stations); a scan needs the railgun's box at the scan range (the same
 * ring, ahead as the step faces, or the same sector) and a target that is
 * not moored either, though a moored ship may scan.
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
    return targets.filter(
      t => targetable(view, t.id) && isInWeaponRange(weapon, attacker, t.position)
    )
  }
  if (step.kind === 'scan') {
    const scanner = { ...at.position, facing: at.facing }
    return targets.filter(t => targetable(view, t.id) && inScanRange(scanner, t.position))
  }
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
  const { stepStart, finalPosition } = stepStarts(view, me, steps)
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
  const { stepStart } = stepStarts(view, me, steps)
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
 * The steps with the rotation (if one is wanted) just before the move: a
 * turn has one, and a move that needs a facing takes it from there.
 */
export function withRotation(
  steps: readonly PlanStep[],
  rotate: boolean,
  newId: () => string
): PlanStep[] {
  const next: PlanStep[] = steps.filter(s => s.kind !== 'rotate')
  const moveIndex = Math.max(
    0,
    next.findIndex(s => s.kind === 'move')
  )
  if (rotate) next.splice(moveIndex, 0, { id: newId(), kind: 'rotate' })
  return next
}

/**
 * Whether each control would make a turn the engine takes, so one it would
 * refuse is not offered: the plan is walked with the rotation put in, or
 * with each move in place of the one planned (a jump with its rotation to
 * prograde, as its button puts it in), and the first refusal at that step is
 * the reason. Fuel is the tank as the plan reaches the move.
 */
export function moveReadiness(
  view: GameView,
  me: Player,
  steps: readonly PlanStep[],
  powers: Record<SubsystemId, number>
): {
  rotateReady: MoveReadiness
  burnReady: Record<BurnIntensity, MoveReadiness>
  jumpReady: MoveReadiness
} {
  const newId = () => 'readiness'
  /** The first refusal at a step of this kind, walked with `plan`. */
  const readiness = (plan: PlanStep[], kinds: PlanStep['kind'][]): MoveReadiness => {
    const { walk, offset } = walkPlan(view, me, plan, powers)
    const refused = walk.refusals.find(
      r => r.step !== null && kinds.includes(plan[r.step - offset]?.kind)
    )
    return refused
      ? blocked(issuesOf(me, plan, { ...walk, refusals: [refused] }, offset)[0])
      : READY
  }
  const withMove = (move: MoveChoice) =>
    steps.map(s => (s.kind === 'move' ? { ...s, move } : s)) as PlanStep[]
  const planned = steps.find((s): s is MoveStep => s.kind === 'move')?.move

  const rotateReady = readiness(withRotation(steps, true, newId), ['rotate'])
  const burnReady = Object.fromEntries(
    BURN_INTENSITIES.map(intensity => [
      intensity,
      readiness(
        withMove({
          kind: 'burn',
          intensity,
          // Phasing is part of the fuel bill, so the burn already planned is
          // priced with the sectors it shifts; the mode button asks about a plain burn.
          adjustment: planned?.kind === 'burn' ? planned.adjustment : 0,
        }),
        ['move']
      ),
    ])
  ) as Record<BurnIntensity, MoveReadiness>

  const moveIndex = steps.findIndex(s => s.kind === 'move')
  const moveFrom = moveIndex >= 0 ? stepStarts(view, me, steps).stepStart[moveIndex] : undefined
  const options = getJumpOptions(moveFrom?.position ?? me.ship)
  const lane =
    planned?.kind === 'jump'
      ? (options.find(o => o.destination.wellId === planned.destinationWellId) ?? options[0])
      : options[0]
  const jumpReady = !lane
    ? blocked(refusalText(refusal('noLane')))
    : readiness(
        withRotation(
          withMove({
            kind: 'jump',
            destinationWellId: lane.destination.wellId,
            adjustment: planned?.kind === 'jump' ? planned.adjustment : 0,
          }),
          me.ship.facing !== 'prograde',
          newId
        ),
        ['move', 'rotate']
      )
  return { rotateReady, burnReady, jumpReady }
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
function dockOfferFor(
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
  return offer.options.length > 0 || offer.soldHere
    ? { ...offer, planetId: station.planetId }
    : null
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
function seizeOfferFor(
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
function surveyOfferFor(
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
function salvageOfferFor(
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
function markOfferFor(
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
function repairableFor(me: Player, loadout: readonly Subsystem[]): SubsystemId[] {
  return coldAtCheck({ ...me.ship, subsystems: [...loadout] })
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
  /** Fuel a coast with the scoop would take aboard where the move starts. */
  scoopGain: number
  issues: string[]
  /**
   * What the engine takes but the dice may undo, by step id: the codes of
   * its walk's warnings (`walkTurn`), such as a seizure after a shot at the
   * same ship.
   */
  warnings: Record<string, string[]>
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
  const { walk, offset } = walkPlan(view, me, steps, powers)
  const stepStart = steps.map((_, i) => contextOf(walk.at[offset + i]))
  const finalPosition = contextOf(walk.end)
  const moveIndex = steps.findIndex(s => s.kind === 'move')
  const moveFrom =
    moveIndex >= 0
      ? stepStart[moveIndex]
      : {
          position: { wellId: me.ship.wellId, ring: me.ship.ring, sector: me.ship.sector },
          facing: me.ship.facing,
        }
  const targets = targetsFor(view)
  const projectedFuel = walk.end.fuel
  const fuelAtMove = moveIndex >= 0 ? walk.at[offset + moveIndex].fuel : me.ship.reactionMass
  const scoop = me.ship.subsystems.find(s => s.id === 'scoop')
  const scoopGain = scoop && !scoop.isBroken ? scoopYield(moveFrom.position, fuelAtMove) : 0
  const issues = issuesOf(me, steps, walk, offset)
  const warnings: Record<string, string[]> = {}
  for (const w of walk.warnings) {
    const step = w.step === null ? undefined : steps[w.step - offset]
    if (step) (warnings[step.id] ??= []).push(w.code)
  }
  return {
    used,
    powers,
    loadout,
    stepStart,
    finalPosition,
    moveFrom,
    targets,
    projectedFuel,
    scoopGain,
    issues,
    warnings,
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
 * The actions the plan is sent as: the ones the engine walked, numbered
 * again without a step still missing its target, and a repair or a sale only
 * while the preview still offers it.
 */
export function planActions(
  me: Player,
  steps: readonly PlanStep[],
  preview: Pick<PlanPreview, 'powers' | 'repairable' | 'dockOffer'>,
  extras: PlanExtras
): PlayerAction[] {
  const facings = facingsBefore(me, steps)
  const list: PlayerAction[] = powerActionsFor(me, preview.powers)
  steps.forEach((step, i) => {
    if (step.kind === 'fire' && !step.targetId) return
    if (step.kind === 'scan' && (!step.targetId || !step.peekSlot)) return
    list.push(stepAction(me, step, facings[i], list.length + 1))
  })
  if (extras.repair !== null && preview.repairable.includes(extras.repair))
    list.push({ playerId: me.id, type: 'repair', data: { subsystemId: extras.repair } })
  // Without a pick the engine makes the default sale, which is what the control shows lit.
  const sale = extras.dockSale
  const offered =
    sale === SELL_NOTHING
      ? (preview.dockOffer?.options.length ?? 0) > 0
      : preview.dockOffer?.options.some(o => o.sale === sale)
  if (sale !== null && offered) list.push({ playerId: me.id, type: 'dock_sale', data: { sale } })
  return list
}
