/**
 * Why an action is refused, asked of the table (game/table.ts) and the acting
 * player as they stand when the action comes up. Every check returns
 * refusals (game/refusals.ts), empty when the action is legal, and never
 * mutates anything. The referee asks them of the state right before applying
 * each action (actionProcessors.ts), so range, fuel and "one thing a turn"
 * see the ship as it is at that point in the sequence; the walk of a planned
 * turn (walk.ts) asks the same ones of a seat's view, with the acting ship
 * moved along as the turn would move it. One set of rules, two readers.
 */
import type {
  Player,
  PlayerAction,
  PowerAction,
  RotateAction,
  CoastAction,
  BurnAction,
  FireWeaponAction,
  RepairAction,
  DockSaleAction,
  EscortMarkAction,
  SalvageAction,
  SeizeAction,
  SurveyAction,
  ScanAction,
  WellTransferAction,
  Position,
} from '../models/game.ts'
import {
  MOVE_ACTION_TYPES,
  PLAYER_ACTION_TYPES,
  isOpeningRound,
  isQuietTurn,
  isTacticalAction,
} from '../models/game.ts'
import { getSubsystemConfig, isPowerableType, isWeaponType } from '../models/subsystems.ts'
import {
  BURN_COSTS,
  getAdjustmentRange,
  calculateBurnMassCost,
  calculateJumpMassCost,
} from '../models/rings.ts'
import { findJump, getJumpAdjustmentRange } from '../models/gravityWells.ts'
import { SCAN_SECTOR_RANGE, SURVEY_RING } from '../models/missions.ts'
import { positionOf, ringVelocity, samePosition } from './geometry.ts'
import { findSubsystem, hasWorkingCompressor, isOnBoard, requestedDraw } from './ship.ts'
import { recoilRing, ringAfter } from './movement.ts'
import { canBeTargeted, isTouchable, canFireFrom, isInWeaponRange } from './targeting.ts'
import { findReadySensor, inScanRange } from './scan.ts'
import { isMooredAt, isMooredMidTurn } from './stations.ts'
import { freePiracyCards, seizableAt } from './piracy.ts'
import { escortableAt, unplacedEscorts } from './escort.ts'
import { onSurveyRing, surveyToTake } from './survey.ts'
import { salvageToTake } from './salvage.ts'
import { seatPosition, type TableSeat, type TurnTable } from './table.ts'
import {
  directionWord,
  refusal,
  subsystemRefusal,
  type Refusal,
  type StepRefusal,
} from './refusals.ts'

/** What an action of the turn needs to know about the turn itself. */
export interface TurnContext {
  /** Where the acting ship began its turn: it is moored only while it holds that berth. */
  start: Position
}

/**
 * The turn as a whole, before any action is taken: the actions are known and
 * sequenced, one move, one repair, one sale, one survey, one wreck, each
 * marker on a different ship and each seizure a different item, and a repair
 * and a sale that can be named at all. `actor` is the ship as the turn
 * starts. The first group that fails is the answer; a refusal that one action
 * owes (a second survey, a repair) names it by its index in `actions`.
 */
export function turnRefusals(
  table: TurnTable,
  actor: Player,
  actions: readonly PlayerAction[]
): StepRefusal[] {
  const whole = (r: Refusal): StepRefusal => ({ ...r, step: null })
  const at = (index: number, r: Refusal): StepRefusal => ({ ...r, step: index })
  const shape: StepRefusal[] = []
  actions.forEach((a, index) => {
    const type = (a as { type?: unknown } | null)?.type
    if (!a || typeof a !== 'object' || !PLAYER_ACTION_TYPES.has(type as PlayerAction['type']))
      shape.push(at(index, refusal('unknownAction', { type: String(type) })))
    if (!a?.data || typeof a.data !== 'object')
      shape.push(at(index, refusal('noData', { type: String(type) })))
  })
  if (shape.length > 0) return shape

  const tactical = actions.filter(isTacticalAction)
  const missing = tactical.filter(a => a.sequence === undefined)
  if (missing.length > 0) return [whole(refusal('unsequenced', { count: missing.length }))]
  const order: StepRefusal[] = []
  const sequences = tactical.map(a => a.sequence!).sort((a, b) => a - b)
  if (new Set(sequences).size !== sequences.length) order.push(whole(refusal('duplicateSequence')))
  const gap = sequences.findIndex((s, i) => s !== i + 1)
  if (gap >= 0)
    order.push(whole(refusal('brokenSequence', { expected: gap + 1, found: sequences[gap] })))
  if (tactical.filter(a => MOVE_ACTION_TYPES.has(a.type)).length > 1)
    order.push(whole(refusal('twoMoves')))
  if (order.length > 0) return order

  const indexed = actions.map((action, index) => ({ action, index }))
  const repairs = indexed.filter(
    (x): x is { action: RepairAction; index: number } => x.action.type === 'repair'
  )
  // One tile a turn: a cold ship's crew get to one thing, not to the loadout.
  if (repairs.length > 1) return [at(repairs[1].index, refusal('twoRepairs'))]
  for (const { action, index } of repairs) {
    const refused = repairRefusals(actor, action)
    if (refused.length > 0) return refused.map(r => at(index, r))
  }
  // One visit, one sale: the sale is named once and read at docking (turns.ts).
  const sales = indexed.filter(
    (x): x is { action: DockSaleAction; index: number } => x.action.type === 'dock_sale'
  )
  if (sales.length > 1) return [at(sales[1].index, refusal('twoSales'))]
  for (const { action, index } of sales) {
    const refused = saleRefusals(action)
    if (refused.length > 0) return refused.map(r => at(index, r))
  }

  const nameOf = (id: string) => table.seats.find(s => s.id === id)?.name ?? id
  // Each marker names a different ship, and each seizure a different item.
  // Whether each one holds is asked at its place in the sequence.
  const marked = new Set<string>()
  const seized = new Set<string>()
  let surveys = 0
  let salvages = 0
  for (const { action: a, index } of indexed) {
    if (a.type === 'escort_mark') {
      if (marked.has(a.data.carrierId))
        return [at(index, refusal('markTwice', { name: nameOf(a.data.carrierId) }))]
      marked.add(a.data.carrierId)
    } else if (a.type === 'seize') {
      const key = `${a.data.victimId}/${a.data.cargoId}`
      if (seized.has(key))
        return [
          at(index, refusal('seizeTwice', { name: nameOf(a.data.victimId), item: a.data.cargoId })),
        ]
      seized.add(key)
    } else if (a.type === 'survey') {
      // One dive a turn and one wreck a turn (RULES §Missions): two of a
      // kind are two jobs, so a second card needs a second turn.
      if (++surveys > 1) return [at(index, refusal('surveyTwice'))]
    } else if (a.type === 'salvage') {
      if (++salvages > 1) return [at(index, refusal('salvageTwice'))]
    }
  }
  return []
}

/** Why `actor` may not take `action` at this point in its turn; empty when it may. */
export function refusalsFor(table: TurnTable, actor: Player, action: PlayerAction): Refusal[] {
  switch (action.type) {
    case 'power':
      return powerRefusals(actor, action)
    case 'rotate':
      return rotateRefusals(actor, action)
    case 'coast':
      return coastRefusals(actor, action)
    case 'burn':
      return burnRefusals(actor, action)
    case 'well_transfer':
      return jumpRefusals(actor, action)
    case 'fire_weapon':
      return fireRefusals(table, actor, action)
    case 'scan':
      return scanRefusals(table, actor, action)
    case 'seize':
      return seizeRefusals(table, actor, action)
    case 'escort_mark':
      return markRefusals(table, actor, action)
    case 'survey':
      return surveyRefusals(actor, action)
    case 'salvage':
      return salvageRefusals(table, actor, action)
    case 'repair':
      return repairRefusals(actor, action)
    case 'dock_sale':
      return saleRefusals(action)
  }
}

/**
 * Powering one of the tiles that work on other players' turns (RULES §Energy
 * and Heat). `amount` is what the tile holds once powered; absent is its
 * minimum. Allowed on a quiet turn: a wall or a rack answers other players,
 * and nobody is reached by it.
 *
 * Each tile does one thing a turn, so a tile already used or powered this turn
 * is refused, and the other way round a rack powered this turn cannot fire and
 * a sensor powered this turn cannot scan (both are `usedThisTurn`). Firing the
 * rack or scanning with the sensor leaves it up anyway.
 */
function powerRefusals(actor: Player, action: PowerAction): Refusal[] {
  const sub = findSubsystem(actor.ship, action.data.subsystemId)
  if (!sub) return [refusal('noSubsystem', { id: action.data.subsystemId })]
  if (!isPowerableType(sub.type)) return [subsystemRefusal('notPowerable', sub)]
  if (sub.isBroken) return [subsystemRefusal('broken', sub)]
  if (sub.usedThisTurn) return [subsystemRefusal('used', sub)]
  const config = getSubsystemConfig(sub.type)
  const amount = requestedDraw(sub.type, action.data.amount)
  if (!Number.isInteger(amount)) return [subsystemRefusal('wholeCubes', sub)]
  const refused: Refusal[] = []
  if (amount < config.minEnergy)
    refused.push(subsystemRefusal('tooFewCubes', sub, { min: config.minEnergy }))
  if (amount > config.maxEnergy)
    refused.push(subsystemRefusal('tooManyCubes', sub, { max: config.maxEnergy }))
  // Nothing else to check: nothing caps what a ship lights, and what the tile
  // costs is heat at the owner's check, which is their business.
  return refused
}

function rotateRefusals(actor: Player, action: RotateAction): Refusal[] {
  const facing = action.data.targetFacing
  if (facing !== 'prograde' && facing !== 'retrograde')
    return [refusal('unknownFacing', { facing: String(facing) })]
  if (actor.ship.facing === facing) return [refusal('alreadyFacing', { facing })]
  const rotation = findSubsystem(actor.ship, 'rotation')
  if (!rotation) return [refusal('noSubsystem', { id: 'rotation' })]
  if (rotation.isBroken) return [refusal('thrustersBroken')]
  if (rotation.usedThisTurn) return [refusal('thrustersUsed')]
  return []
}

function coastRefusals(actor: Player, action: CoastAction): Refusal[] {
  if (!action.data.activateScoop) return []
  const scoop = findSubsystem(actor.ship, 'scoop')
  if (!scoop || scoop.isBroken) return [refusal('scoopBroken')]
  if (scoop.usedThisTurn) return [refusal('scoopUsed')]
  return []
}

/** The engines go once a turn: for a burn, a jump or a railgun's recoil compensation. */
function enginesRefusals(actor: Player, use: 'burn' | 'jump' | 'recoil'): Refusal[] {
  const engines = findSubsystem(actor.ship, 'engines')
  if (!engines || engines.isBroken)
    return [
      refusal(
        use === 'burn'
          ? 'enginesBrokenBurn'
          : use === 'jump'
            ? 'enginesBrokenJump'
            : 'enginesBrokenRecoil'
      ),
    ]
  // The burn powers them itself, so all that is left to ask is whether they
  // have already gone once this turn.
  if (engines.usedThisTurn) return [refusal('enginesUsed')]
  return []
}

function burnRefusals(actor: Player, action: BurnAction): Refusal[] {
  const ship = actor.ship
  const intensity = action.data.burnIntensity
  const cost = BURN_COSTS[intensity]
  const adjustment = action.data.sectorAdjustment
  const refused = enginesRefusals(actor, 'burn')
  if (!Number.isInteger(adjustment)) {
    refused.push(refusal('wholePhasing'))
  } else {
    const { min, max } = getAdjustmentRange(ringVelocity(ship.wellId, ship.ring))
    if (adjustment < min || adjustment > max) refused.push(refusal('phasing', { min, max }))
  }
  // A burn changes exactly its number of rings; there is no partial burn off the edge.
  if (ringAfter(ship, cost.rings) === null)
    refused.push(
      refusal('burnOffRings', { intensity, direction: directionWord(ship.facing), ring: ship.ring })
    )
  const mass = calculateBurnMassCost(cost.mass, adjustment)
  if (ship.reactionMass < mass)
    refused.push(refusal('burnFuel', { intensity, mass, fuel: ship.reactionMass }))
  return refused
}

function jumpRefusals(actor: Player, action: WellTransferAction): Refusal[] {
  const ship = actor.ship
  const jump = findJump(positionOf(ship), action.data.destinationWellId)
  if (!jump) return [refusal('noLane')]
  const adjustment = action.data.sectorAdjustment
  const refused = enginesRefusals(actor, 'jump')
  if (ship.facing !== 'prograde') refused.push(refusal('jumpFacing'))
  // Phasing a jump is bounded by the arrival arc, not by the ring's velocity:
  // a jump has no drift to brake against (RULES §Jump).
  if (!Number.isInteger(adjustment)) {
    refused.push(refusal('wholePhasing'))
  } else {
    const { min, max } = getJumpAdjustmentRange(jump)
    if (adjustment < min || adjustment > max) refused.push(refusal('jumpPhasing', { min, max }))
  }
  const mass = calculateJumpMassCost(adjustment, hasWorkingCompressor(ship))
  if (ship.reactionMass < mass) refused.push(refusal('jumpFuel', { mass, fuel: ship.reactionMass }))
  return refused
}

/**
 * The refusal a quiet turn owes the player, or null. Two turns are quiet: the
 * opening round, and a ship's first turn back from Home. The reasons read
 * differently because a player who cannot fire deserves to know which one it
 * is (RULES §A Turn, §Destruction and Respawn).
 */
function quietRefusal(
  table: TurnTable,
  actor: Player,
  what: 'fire' | 'scan' | 'seize'
): Refusal | null {
  if (!isQuietTurn(table.turn, actor)) return null
  const opening = isOpeningRound(table.turn)
  switch (what) {
    case 'fire':
      return refusal(opening ? 'openingNoFire' : 'backNoFire')
    case 'scan':
      return refusal(opening ? 'openingNoScan' : 'backNoScan')
    case 'seize':
      return refusal(opening ? 'openingNoSeize' : 'backNoSeize')
  }
}

/**
 * The seat an action names: a rival at the table, on the board and not just
 * back from Home (RULES §Destruction and Respawn). A ship that returns to a
 * sector everyone knows must not be a free kill, so a shot, a scan, a seizure
 * and a marker are all refused at it.
 */
function rivalAt(
  table: TurnTable,
  actor: Player,
  id: unknown
): { refused: Refusal[]; seat?: TableSeat } {
  const seat = typeof id === 'string' ? table.seats.find(s => s.id === id) : undefined
  if (!seat) return { refused: [refusal('noPlayer', { id: String(id) })] }
  if (seat.id === actor.id) return { refused: [refusal('selfTarget')] }
  if (!isOnBoard(seat)) return { refused: [refusal('offBoard', { name: seat.name })] }
  if (!isTouchable(seat)) return { refused: [refusal('untouchable', { name: seat.name })] }
  return { refused: [], seat }
}

function fireRefusals(table: TurnTable, actor: Player, action: FireWeaponAction): Refusal[] {
  const ship = actor.ship
  const quiet = quietRefusal(table, actor, 'fire')
  if (quiet) return [quiet]
  // A moored ship neither fires nor is fired at (RULES §Stations, Moored). A
  // ship is moored from the moment it docks at the end of the turn it arrives
  // until it leaves the sector: one that began the turn at a berth fires once
  // it has burned off, and one arriving this turn fires before and after its move.
  if (!canFireFrom(table.start, positionOf(ship), table.stations)) return [refusal('mooredNoFire')]
  const weapon = findSubsystem(ship, action.data.subsystemId)
  if (!weapon) return [refusal('noSubsystem', { id: action.data.subsystemId })]
  if (!isWeaponType(weapon.type)) return [subsystemRefusal('notWeapon', weapon)]
  if (weapon.isBroken) return [subsystemRefusal('broken', weapon)]
  const config = getSubsystemConfig(weapon.type)

  const refused: Refusal[] = []
  if (weapon.usedThisTurn) refused.push(subsystemRefusal('used', weapon))
  // A salvo is any number of the tile's remaining rounds in one action; every
  // other weapon fires once, so a count on one is a mistake worth refusing.
  const count = action.data.count
  if (weapon.type === 'missiles') {
    const ammo = weapon.ammo ?? 0
    if (ammo <= 0) refused.push(subsystemRefusal('noMissiles', weapon))
    else if (count !== undefined) {
      if (!Number.isInteger(count) || count < 1)
        refused.push(subsystemRefusal('emptySalvo', weapon))
      else if (count > ammo)
        refused.push(subsystemRefusal('tooManyMissiles', weapon, { count, ammo }))
    }
  } else if (count !== undefined && count !== 1) {
    refused.push(subsystemRefusal('notSalvo', weapon))
  }

  const { refused: named, seat: target } = rivalAt(table, actor, action.data.targetPlayerId)
  refused.push(...named)
  if (target) {
    // A berth is safe: no weapon reaches it, missiles included.
    if (!canBeTargeted(target, table.stations))
      refused.push(refusal('mooredTarget', { name: target.name }))
    if (!isInWeaponRange(weapon, ship, seatPosition(target)!))
      refused.push(subsystemRefusal('outOfRange', weapon, { name: target.name }))
    if (!target.slots.includes(action.data.criticalTarget))
      refused.push(
        refusal('noCriticalSlot', { name: target.name, critical: action.data.criticalTarget })
      )
  }

  if (config.weaponStats?.hasRecoil) {
    if (action.data.compensateRecoil) {
      refused.push(...enginesRefusals(actor, 'recoil'))
      if (ship.reactionMass < BURN_COSTS.soft.mass)
        refused.push(refusal('recoilFuel', { mass: BURN_COSTS.soft.mass, fuel: ship.reactionMass }))
    } else if (recoilRing(ship) === null) {
      refused.push(refusal('recoilOffRings'))
    }
  }
  return refused
}

function scanRefusals(table: TurnTable, actor: Player, action: ScanAction): Refusal[] {
  const ship = actor.ship
  const quiet = quietRefusal(table, actor, 'scan')
  if (quiet) return [quiet]
  const sensor = ship.subsystems.find(s => s.type === 'sensor_array')
  if (!sensor) return [refusal('noSensor')]
  if (!findReadySensor(ship)) return [subsystemRefusal(sensor.isBroken ? 'broken' : 'used', sensor)]
  const { refused, seat: target } = rivalAt(table, actor, action.data.targetPlayerId)
  if (!target) return refused
  // A berth is safe from scans too (RULES §Stations); a moored ship may still scan.
  if (!canBeTargeted(target, table.stations))
    refused.push(refusal('mooredScan', { name: target.name }))
  if (!inScanRange(ship, seatPosition(target)!))
    refused.push(refusal('scanRange', { name: target.name, range: SCAN_SECTOR_RANGE }))
  // Naming a slot you already know is fine: the scan peeks the next face-down
  // slot instead (see choosePeekSlot in scan.ts).
  if (!target.loadout.includes(action.data.peekSlot))
    refused.push(refusal('peekNotSlot', { peek: String(action.data.peekSlot) }))
  return refused
}

/**
 * Naming the tile a cold ship's crew will fix. Refused when the slot is not
 * broken (there is nothing to do) or when the ship is already carrying heat,
 * because heat only rises during a turn: a ship that starts hot cannot be cold
 * at its check, and a repair it can never earn should not be submittable.
 */
function repairRefusals(actor: Player, action: RepairAction): Refusal[] {
  const sub = findSubsystem(actor.ship, action.data.subsystemId)
  if (!sub) return [refusal('noSubsystem', { id: action.data.subsystemId })]
  if (!sub.isBroken) return [subsystemRefusal('notBroken', sub)]
  const heat = actor.ship.heat.currentHeat
  if (heat > 0) return [refusal('repairHot', { heat })]
  return []
}

/**
 * Naming what a visit sells. Only the name is checked: whether the turn
 * arrives anywhere, and what the station would buy there, is known when it
 * docks, and a sale it cannot make falls back to the default
 * (game/docking.ts).
 */
function saleRefusals(action: DockSaleAction): Refusal[] {
  const sale = action.data?.sale
  if (typeof sale !== 'string' || sale.length === 0)
    return [refusal('badSale', { sale: String(sale) })]
  return []
}

/**
 * An Escort marker at its point in the sequence (RULES §Missions, Escort): a
 * marker is in hand, the carrier is a rival on the escort's ring there with
 * cargo aboard and no marker on it, it is not just back from Home, and
 * neither ship is moored (the escort by the berth it began the turn on, as
 * for firing). Allowed on a quiet turn: a marker is neither a shot, a scan
 * nor a seizure. A carrier destroyed earlier in the turn is skipped before
 * this is asked (actionProcessors.ts).
 */
function markRefusals(table: TurnTable, actor: Player, action: EscortMarkAction): Refusal[] {
  const { refused, seat: carrier } = rivalAt(table, actor, action.data.carrierId)
  if (refused.some(r => r.code === 'noPlayer' || r.code === 'selfTarget')) return refused
  if (unplacedEscorts(actor.missions).length === 0) return [refusal('markNone')]
  if (!carrier) return refused
  const at = positionOf(actor.ship)
  const there = seatPosition(carrier)!
  const name = carrier.name
  if (isMooredMidTurn(table.stations, table.start, at)) return [refusal('mooredNoMark')]
  if (carrier.escorted) return [refusal('markAlready', { name })]
  if (there.wellId !== at.wellId || there.ring !== at.ring) return [refusal('markRing', { name })]
  if (isMooredAt(table.stations, there)) return [refusal('markMoored', { name })]
  if (carrier.items.length === 0) return [refusal('markEmpty', { name })]
  // Every check above is the list's, said item by item; this is the list
  // itself, so the two cannot drift.
  if (!escortableAt(table, actor.id, actor.missions, at).includes(carrier.id))
    return [refusal('markRefused', { name })]
  return []
}

/**
 * A dive at its point in the sequence (RULES §Missions, Survey): the ship is
 * on Black Hole Ring 1 there and an undone Survey has no data aboard. Allowed
 * on a quiet turn: it touches nobody. One dive a turn is checked over the
 * whole turn (`turnRefusals`).
 */
function surveyRefusals(actor: Player, _action: SurveyAction): Refusal[] {
  if (!surveyToTake(actor)) return [refusal('surveyNoCard')]
  if (!onSurveyRing(positionOf(actor.ship))) return [refusal('surveyRing', { ring: SURVEY_RING })]
  return []
}

/**
 * A salvage at its point in the sequence (RULES §Missions, Salvage): an
 * undone Salvage has no black box aboard, and a wreck it names is on the
 * ship's sector there, moored or not. One that names none takes the first
 * wreck there, and finding none is skipped rather than refused
 * (actionProcessors.ts): whether the shot before it killed is the dice's.
 * Allowed on a quiet turn: a wreck is nobody. One wreck a turn is checked
 * over the whole turn (`turnRefusals`).
 */
function salvageRefusals(table: TurnTable, actor: Player, action: SalvageAction): Refusal[] {
  const wreckId = action.data?.wreckId
  if (wreckId !== undefined && typeof wreckId !== 'string')
    return [refusal('wreckGone', { wreck: String(wreckId) })]
  if (!salvageToTake(actor)) return [refusal('salvageNoCard')]
  if (wreckId === undefined) return []
  const wreck = table.wrecks.find(w => w.id === wreckId)
  if (!wreck) return [refusal('wreckGone', { wreck: wreckId })]
  if (!samePosition(wreck, positionOf(actor.ship))) return [refusal('wreckAway')]
  return []
}

/**
 * A seizure at its point in the sequence (RULES §Missions, Piracy): the item
 * is aboard a rival in the pirate's sector there, neither ship is moored (the
 * pirate by the berth it began the turn on, as for firing), the rival is not
 * just back from Home, and a Piracy card is free to take it. Refused on a
 * quiet turn, as a shot and a scan are: the opening round and a ship's first
 * turn back from Home reach nobody. A ship destroyed earlier in the turn is
 * skipped before this is asked (actionProcessors.ts).
 */
function seizeRefusals(table: TurnTable, actor: Player, action: SeizeAction): Refusal[] {
  const { refused, seat: victim } = rivalAt(table, actor, action.data.victimId)
  if (refused.some(r => r.code === 'noPlayer' || r.code === 'selfTarget')) return refused
  const item = action.data.cargoId
  const quiet = quietRefusal(table, actor, 'seize')
  if (quiet) return [quiet]
  if (freePiracyCards(actor.missions, actor.cargo).length === 0) return [refusal('seizeNoCard')]
  if (!victim) return refused
  const at = positionOf(actor.ship)
  const there = seatPosition(victim)!
  const name = victim.name
  if (isMooredMidTurn(table.stations, table.start, at)) return [refusal('mooredNoSeize')]
  if (!samePosition(there, at)) return [refusal('seizeAway', { name })]
  if (isMooredAt(table.stations, there)) return [refusal('seizeMoored', { name })]
  if (typeof item !== 'string' || !victim.items.some(i => i.cargoId === item))
    return [refusal('seizeNoItem', { name, item: String(item) })]
  // Every check above is the list's, said item by item; this is the list
  // itself, so the two cannot drift.
  if (!seizableAt(table, actor.id, at).some(i => i.victimId === victim.id && i.cargoId === item))
    return [refusal('seizeRefused', { name, item })]
  return []
}
