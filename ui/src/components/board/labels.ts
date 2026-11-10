/**
 * What the board says in words (the strings are in `text/board.ts`): the
 * hover text of a ship, a wreck, a Home, a station, a lane and the sectors a click can
 * pick, and the caption under a ring. Both renderers print these, so a
 * tooltip reads the same on the flat board and the 3D one.
 */
import type { Position, TransferLane } from '@dangerous-inclinations/engine'
import { fill, getWellName } from '@dangerous-inclinations/engine'
import type { HomeMarker, ShipToken, StationMarker } from './model'
import { placeLabel } from '../../utils/route'
import { BOARD_TEXT as T } from '../../text/board'

export function shipLabel(
  ship: Pick<ShipToken, 'name' | 'hitPoints' | 'maxHitPoints' | 'heat' | 'facing' | 'escorts'>
): string {
  const escorted =
    ship.escorts.length > 0
      ? fill(T.escorted, { names: ship.escorts.map(e => e.name).join(T.nameJoin) })
      : ''
  return fill(T.ship, {
    name: ship.name,
    hull: ship.hitPoints,
    maxHull: ship.maxHitPoints,
    heat: ship.heat,
    facing: ship.facing,
    escorted,
  })
}

export function wreckLabel(position: Position): string {
  return fill(T.wreck, { place: placeLabel(position) })
}

export function homeLabel(home: Pick<HomeMarker, 'name' | 'position'>): string {
  return fill(T.home, { name: home.name, place: placeLabel(home.position) })
}

export function stationLabel(station: Pick<StationMarker, 'planetId' | 'soldBy'>): string {
  const soldTo =
    station.soldBy.length > 0
      ? fill(T.soldTo, { names: station.soldBy.map(s => s.name).join(T.nameJoin) })
      : ''
  return fill(T.station, { planet: getWellName(station.planetId), soldTo })
}

export function deployLabel(position: Position): string {
  return fill(T.deploy, { place: placeLabel(position) })
}

export function routeCellLabel(position: Position): string {
  return fill(T.routeCell, { place: placeLabel(position) })
}

/** "beta-a" → "A". The two lanes to a planet are told apart by their letter. */
export function laneLetter(laneId: string): string {
  return laneId.slice(-1).toUpperCase()
}

export function laneLabel(lane: TransferLane): string {
  const span = (arc: TransferLane['blackHoleArc']) =>
    fill(T.lane.span, {
      ring: arc.ring,
      first: arc.startSector,
      last: arc.startSector + arc.length - 1,
    })
  const bh = span(lane.blackHoleArc)
  const pl = span(lane.planetArc)
  const planet = getWellName(lane.planetId)
  const letter = laneLetter(lane.id)
  return lane.direction === 'outbound'
    ? fill(T.lane.outbound, { planet, letter, from: bh, to: pl })
    : fill(T.lane.inbound, { planet, letter, from: pl, to: bh })
}

/** The caption a ring carries: its number and its velocity, in the board's capitals. */
export function ringCaption(ring: number, velocity: number): string {
  return fill(T.ring, { ring, velocity })
}
