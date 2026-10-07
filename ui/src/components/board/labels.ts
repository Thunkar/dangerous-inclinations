/**
 * What the board says in words: the hover text of a ship, a wreck, a lane
 * and the sectors a click can pick, and the caption under a ring. Both
 * renderers print these, so a tooltip reads the same on the flat board and
 * the 3D one.
 */
import type { Position, TransferLane } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'
import type { ShipToken } from './model'
import { placeLabel } from '../../utils/route'

export function shipLabel(
  ship: Pick<ShipToken, 'name' | 'hitPoints' | 'maxHitPoints' | 'heat' | 'facing' | 'escorts'>
): string {
  const escorted =
    ship.escorts.length > 0 ? ` · escorted by ${ship.escorts.map(e => e.name).join(', ')}` : ''
  return `${ship.name} · hull ${ship.hitPoints}/${ship.maxHitPoints}, heat ${ship.heat}, facing ${ship.facing}${escorted}`
}

export function wreckLabel(position: Position): string {
  return `Wreck · ${placeLabel(position)} · a Salvage holder can take its black box`
}

export function deployLabel(position: Position): string {
  return `Place your ship here · ${placeLabel(position)}. This sector becomes your Home.`
}

export function routeCellLabel(position: Position): string {
  return `Route to ${placeLabel(position)}`
}

/** "beta-a" → "A". The two lanes to a planet are told apart by their letter. */
export function laneLetter(laneId: string): string {
  return laneId.slice(-1).toUpperCase()
}

export function laneLabel(lane: TransferLane): string {
  const bh = lane.blackHoleArc
  const pl = lane.planetArc
  const span = (arc: typeof bh) =>
    `R${arc.ring} S${arc.startSector}–${arc.startSector + arc.length - 1}`
  const planet = getWellName(lane.planetId)
  return lane.direction === 'outbound'
    ? `${planet} lane ${laneLetter(lane.id)} · one way: jump from Black Hole ${span(bh)} to ${planet} ${span(pl)}`
    : `${planet} lane ${laneLetter(lane.id)} · one way: jump from ${planet} ${span(pl)} to Black Hole ${span(bh)}`
}

/** The caption a ring carries: its number and its velocity, in the board's capitals. */
export function ringCaption(ring: number, velocity: number): string {
  return `R${ring} · V${velocity}`
}
