/**
 * The table as the rules of an action read it. The referee reads it off the
 * state (`tableOf`) at each action of a turn; the walk of a planned turn
 * (game/walk.ts) reads it off the acting seat's view (`tableOfView`), which
 * shows the same things: where every ship is, who is just back from Home,
 * every slot's id, what each hold carries by its id and who carries an Escort
 * marker. So the checks in game/validators.ts, and the piracy and Escort
 * questions, are asked once, of either.
 */
import type { GameState, Position, Station, Wreck } from '../models/game.ts'
import type { SubsystemId } from '../models/subsystems.ts'
import type { HoldItemKind } from '../models/missions.ts'
import { aboard, holdItemKind } from '../models/missions.ts'
import type { GameView } from './view.ts'
import type { Seat } from './targeting.ts'
import { positionOf } from './geometry.ts'
import { isOnBoard } from './ship.ts'
import { markedBy } from './escort.ts'

/** A seat as an action at it reads it. */
export interface TableSeat extends Seat {
  id: string
  name: string
  /** Every subsystem aboard: a critical may name any of them. */
  slots: SubsystemId[]
  /** The loadout's slots: a scan peeks at one of them. */
  loadout: SubsystemId[]
  /** What the hold carries, by id. */
  items: { cargoId: string; kind: HoldItemKind }[]
  /** Someone's Escort marker is on this ship. */
  escorted: boolean
}

export interface TurnTable {
  turn: number
  stations: Station[]
  wrecks: Wreck[]
  seats: TableSeat[]
  /** Where the acting ship began its turn: it is moored only while it holds that berth. */
  start: Position
}

/** Where a seat's ship is, or null when it is not on the board. */
export function seatPosition(seat: Seat): Position | null {
  return isOnBoard(seat) ? positionOf(seat.ship as Position) : null
}

/** The table off the state, for an action of the turn that began at `start`. */
export function tableOf(state: GameState, start: Position): TurnTable {
  return {
    turn: state.turn,
    stations: state.stations,
    wrecks: state.wrecks,
    start,
    seats: state.players.map(p => ({
      id: p.id,
      name: p.name,
      hasDeployed: p.hasDeployed,
      recovering: p.recovering,
      ship: p.ship,
      slots: p.ship.subsystems.map(s => s.id),
      loadout: p.ship.subsystems.filter(s => s.slotGroup !== undefined).map(s => s.id),
      items: aboard(p.cargo).map(c => ({ cargoId: c.id, kind: holdItemKind(c) })),
      escorted: state.players.some(other => markedBy(other).has(p.id)),
    })),
  }
}

/** The same table off a seat's view: everything an action at a rival reads is public. */
export function tableOfView(view: GameView, start: Position): TurnTable {
  return {
    turn: view.turn,
    stations: view.stations,
    wrecks: view.wrecks,
    start,
    seats: view.players.map(p => ({
      id: p.id,
      name: p.name,
      hasDeployed: p.hasDeployed,
      recovering: p.recovering,
      ship: p.ship,
      slots: [...p.fixed.map(s => s.id), ...p.slots.map(s => s.id)],
      loadout: p.slots.map(s => s.id),
      items: p.hold,
      escorted: p.escortedBy.length > 0,
    })),
  }
}
