/**
 * A planned turn walked from a seat's own view: where the ship is as each
 * action comes up, and what the referee would refuse. The table's plan
 * (ui/src/plan/preview.ts) and an agent's turn builder (agent/intent.ts) both
 * ask this before they send a turn, so a turn either of them calls legal is
 * one `executeTurn` takes.
 *
 * Every check is the referee's own (game/validators.ts), asked of the table
 * as the view shows it (game/table.ts) and of the acting ship moved along the
 * way the processors move it: a rotation turns it, a coast drifts it (a berth
 * held since the turn began holds), a burn drifts it and changes ring, a jump
 * lands it, a railgun that is not compensated recoils it a ring, and every
 * action puts its cubes on the subsystem it uses, so "one thing a turn" and
 * "the engines once a turn" read as the referee reads them. Fuel is spent
 * and scooped in order, never below an empty tank. What the walk cannot know
 * is the dice: a shot that destroys its target makes the referee skip what
 * comes after at that ship, and a salvage naming no wreck takes one only if a
 * shot before it kills in its sector. Those are warnings, not refusals.
 *
 * A refused action still moves the ship as it would, so a plan with a
 * mistake in it is drawn where it goes; it gains nothing (a broken scoop
 * scoops no fuel).
 */
import type { Facing, Player, PlayerAction, Position } from '../models/game.ts'
import { MOVE_ACTION_TYPES, isTacticalAction } from '../models/game.ts'
import { getSubsystemConfig, isWeaponType } from '../models/subsystems.ts'
import { BURN_COSTS, WELL_TRANSFER_COSTS, calculateJumpMassCost } from '../models/rings.ts'
import { findJump, phasedJumpDestination } from '../models/gravityWells.ts'
import { withItemAboard } from '../models/missions.ts'
import { orList } from '../utils/fill.ts'
import type { GameView } from './view.ts'
import { positionOf, samePosition } from './geometry.ts'
import {
  clearLoadout,
  findSubsystem,
  hasWorkingCompressor,
  requestedDraw,
  updateSubsystem,
  useSubsystem,
  workingCompressors,
} from './ship.ts'
import {
  applyBurn,
  applyOrbitalMovement,
  applyRotation,
  recoilRing,
  scoopYield,
} from './movement.ts'
import { isMooredMidTurn } from './stations.ts'
import { freePiracyCards, lootFor } from './piracy.ts'
import { unplacedEscorts, withMarkerOn } from './escort.ts'
import { seatPosition, tableOfView, type TurnTable } from './table.ts'
import { refusalsFor, turnRefusals } from './validators.ts'
import { refusal, type Refusal, type StepRefusal } from './refusals.ts'

/** Where the ship is, which way it faces and the fuel aboard. */
export interface WalkPoint {
  position: Position
  facing: Facing
  fuel: number
}

export interface TurnWalk {
  /**
   * Where the ship is as each action comes up, by its index in the list
   * walked. A repair and a sale have no place in the sequence: theirs is
   * where the turn starts.
   */
  at: WalkPoint[]
  /** Where the turn leaves the ship, a coast included if it names no move. */
  end: WalkPoint
  /** What the referee would refuse. */
  refusals: StepRefusal[]
  /** What the referee takes but may come to nothing, on the dice. */
  warnings: StepRefusal[]
}

const pointOf = (ship: Player['ship']): WalkPoint => ({
  position: positionOf(ship),
  facing: ship.facing,
  fuel: ship.reactionMass,
})

/** Walk `actions` for the viewing seat, from where its ship stands at the start of its turn. */
export function walkTurn(view: GameView, actions: readonly PlayerAction[]): TurnWalk {
  const me = view.me
  if (!me) throw new Error('A spectator plans no turn')
  const start = positionOf(me.ship)
  let table: TurnTable = tableOfView(view, start)
  // The turn starts by clearing the loadout, as `executeTurn` does.
  let actor: Player = { ...me, ship: clearLoadout(me.ship) }

  const refusals: StepRefusal[] = turnRefusals(table, actor, actions)
  /** Actions the turn as a whole already refuses (a second survey, a marker named twice). */
  const owed = new Set(refusals.map(r => r.step))
  const warnings: StepRefusal[] = []
  const at: WalkPoint[] = actions.map(() => pointOf(actor.ship))
  // An action the engine cannot read is not walked: the ship stays put.
  if (refusals.some(r => r.code === 'unknownAction' || r.code === 'noData'))
    return { at, end: pointOf(actor.ship), refusals, warnings }
  const order = actions
    .map((_, index) => index)
    .filter(index => isTacticalAction(actions[index]))
    .sort((a, b) => (actions[a].sequence ?? 0) - (actions[b].sequence ?? 0))
  /** Ships a shot of the turn may hurt: a disruptor takes no hull. */
  const shotAt = new Set<string>()

  for (const index of order) {
    const action = actions[index]
    at[index] = pointOf(actor.ship)
    const refused = owed.has(index) ? [] : refusalsFor(table, actor, action)
    refusals.push(...refused.map(r => ({ ...r, step: index })))
    if (refused.length === 0 && !owed.has(index))
      warnings.push(...warningsFor(table, actor, action, shotAt).map(r => ({ ...r, step: index })))
    ;({ actor, table } = applyOwn(table, actor, action))
    if (action.type === 'fire_weapon') {
      const weapon = findSubsystem(actor.ship, action.data.subsystemId)
      if (weapon && !getSubsystemConfig(weapon.type).weaponStats?.disrupts)
        shotAt.add(action.data.targetPlayerId)
    }
  }
  // Orbital drift is not optional: a turn without a movement action coasts.
  if (!order.some(index => MOVE_ACTION_TYPES.has(actions[index].type)))
    actor = coast(table, actor, false)
  return { at, end: pointOf(actor.ship), refusals, warnings }
}

/** What the referee takes but the dice may undo: a step at a ship a shot before it may destroy. */
function warningsFor(
  table: TurnTable,
  actor: Player,
  action: PlayerAction,
  shotAt: ReadonlySet<string>
): Refusal[] {
  const nameOf = (id: string) => table.seats.find(s => s.id === id)?.name ?? id
  switch (action.type) {
    case 'seize':
      return shotAt.has(action.data.victimId)
        ? [refusal('seizeAfterShot', { name: nameOf(action.data.victimId) })]
        : []
    case 'escort_mark':
      return shotAt.has(action.data.carrierId)
        ? [refusal('markAfterShot', { name: nameOf(action.data.carrierId) })]
        : []
    case 'salvage': {
      if (action.data.wreckId !== undefined) return []
      // Naming none, it takes what is in the sector when it comes: a wreck
      // there now, or the one a kill before it leaves.
      const here = positionOf(actor.ship)
      if (table.wrecks.some(w => samePosition(w, here))) return []
      const prey = table.seats.filter(s => {
        const there = seatPosition(s)
        return shotAt.has(s.id) && there !== null && samePosition(there, here)
      })
      return prey.length > 0
        ? [refusal('salvageIfKill', { names: orList(prey.map(s => s.name)) })]
        : [refusal('salvageNothing')]
    }
    default:
      return []
  }
}

function coast(table: TurnTable, actor: Player, scoop: boolean): Player {
  // A berth held since the turn began holds; one the turn put the ship on drifts.
  const moored = isMooredMidTurn(table.stations, table.start, actor.ship)
  let ship = applyOrbitalMovement(actor.ship, moored)
  if (scoop) {
    const working = findSubsystem(ship, 'scoop')?.isBroken === false
    ship = useSubsystem(ship, actor.id, 'scoop').ship
    // A berth's scoop pays when the station moves, after the turn.
    if (working && !moored)
      ship = { ...ship, reactionMass: ship.reactionMass + scoopYield(ship, ship.reactionMass) }
  }
  return { ...actor, ship }
}

/** What an action does to the acting ship, its hand and the seats it takes from: the processors' own steps. */
function applyOwn(
  table: TurnTable,
  actor: Player,
  action: PlayerAction
): { actor: Player; table: TurnTable } {
  const id = actor.id
  let ship = actor.ship
  const spend = (mass: number) => ({ ...ship, reactionMass: Math.max(0, ship.reactionMass - mass) })
  switch (action.type) {
    case 'power': {
      const sub = findSubsystem(ship, action.data.subsystemId)
      if (sub)
        ship = updateSubsystem(ship, sub.id, {
          allocatedEnergy: requestedDraw(sub.type, action.data.amount),
          usedThisTurn: true,
        })
      break
    }
    case 'rotate':
      ship = useSubsystem(applyRotation(ship, action.data.targetFacing), id, 'rotation').ship
      break
    case 'coast':
      return { actor: coast(table, actor, action.data.activateScoop), table }
    case 'burn': {
      const intensity = action.data.burnIntensity
      const burned = applyBurn(applyOrbitalMovement(ship), intensity, action.data.sectorAdjustment)
      ship = { ...burned.ship, reactionMass: Math.max(0, burned.ship.reactionMass) }
      ship = useSubsystem(ship, id, 'engines', 'fired', BURN_COSTS[intensity].energy).ship
      break
    }
    case 'well_transfer': {
      const lane = findJump(positionOf(ship), action.data.destinationWellId)
      const landing = lane && phasedJumpDestination(lane, action.data.sectorAdjustment)
      if (!landing) break
      const mass = calculateJumpMassCost(action.data.sectorAdjustment, hasWorkingCompressor(ship))
      ship = { ...spend(mass), ...landing }
      ship = useSubsystem(ship, id, 'engines', 'fired', WELL_TRANSFER_COSTS.energy).ship
      for (const compressor of workingCompressors(ship))
        ship = useSubsystem(ship, id, compressor.id, 'compressed_jump').ship
      break
    }
    case 'fire_weapon': {
      const weapon = findSubsystem(ship, action.data.subsystemId)
      if (!weapon || !isWeaponType(weapon.type)) break
      ship = useSubsystem(ship, id, weapon.id, 'fired').ship
      if (weapon.type === 'missiles') {
        const salvo = Math.max(1, Math.trunc(action.data.count ?? 1))
        ship = updateSubsystem(ship, weapon.id, s => ({ ammo: Math.max(0, (s.ammo ?? 0) - salvo) }))
      }
      if (getSubsystemConfig(weapon.type).weaponStats?.hasRecoil) {
        if (action.data.compensateRecoil) {
          ship = useSubsystem(ship, id, 'engines', 'fired', BURN_COSTS.soft.energy).ship
          ship = spend(BURN_COSTS.soft.mass)
        } else ship = { ...ship, ring: recoilRing(ship) ?? ship.ring }
      }
      break
    }
    case 'scan': {
      const sensor = ship.subsystems.find(s => s.type === 'sensor_array')
      if (sensor) ship = useSubsystem(ship, id, sensor.id, 'scanned').ship
      break
    }
    case 'seize': {
      const { victimId, cargoId } = action.data
      if (freePiracyCards(actor.missions, actor.cargo).length === 0) break
      return {
        actor: { ...actor, cargo: withItemAboard(actor.cargo, lootFor(actor)) },
        table: {
          ...table,
          seats: table.seats.map(s =>
            s.id === victimId ? { ...s, items: s.items.filter(i => i.cargoId !== cargoId) } : s
          ),
        },
      }
    }
    case 'escort_mark': {
      const carrierId = action.data.carrierId
      if (unplacedEscorts(actor.missions).length === 0) break
      return {
        actor: { ...actor, missions: withMarkerOn(actor.missions, carrierId) },
        table: {
          ...table,
          seats: table.seats.map(s => (s.id === carrierId ? { ...s, escorted: true } : s)),
        },
      }
    }
    // A survey and a salvage go once a turn (`turnRefusals`), so what they
    // take aboard changes nothing the rest of the turn asks.
    default:
      break
  }
  return { actor: { ...actor, ship }, table }
}
