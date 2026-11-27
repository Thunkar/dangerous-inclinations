/**
 * The jump drive's fold (RULES §Movement, Fold): the turn's whole move puts
 * the ship on a sector of its own well, or between the black hole and a
 * planet, never on a station (any of its sectors), with no drift. It puts the drive's energy
 * on it and the fold's energy on the engines like any action, and costs the fold's fuel.
 */
import type { Position, ShipState, Station } from '../models/game.ts'
import { COMPRESSED_JUMP_MASS, SECTORS_PER_RING, WELL_TRANSFER_COSTS } from '../models/rings.ts'
import type { Subsystem, SubsystemId } from '../models/subsystems.ts'
import { getSubsystemConfig } from '../models/subsystems.ts'
import { BLACK_HOLE_ID, GRAVITY_WELLS, getGravityWell, getMaxRing } from '../models/gravityWells.ts'
import type { EventDraft } from '../models/events.ts'
import { positionOf, samePosition } from './geometry.ts'
import { useSubsystem, workingCompressors } from './ship.ts'
import { getStationInReach } from './stations.ts'

/**
 * Fuel a fold costs, read off the drive's config so `--tiles=` reaches it: the
 * engines' share of it is a jump's, so a working compressor cuts it as it cuts
 * a jump (8 less the 2 it saves on a lane).
 */
export function foldFuel(ship: Pick<ShipState, 'subsystems'>): number {
  return workingCompressors(ship).length > 0 ? compressedFoldFuel() : baseFoldFuel()
}

/** A fold's fuel without a compressor: the drive's share and the engines'. */
export function baseFoldFuel(): number {
  return getSubsystemConfig('jump_drive').fold!.foldFuel
}

/** A fold's fuel with a working compressor, which cuts the engines' share as it cuts a jump. */
export function compressedFoldFuel(): number {
  return baseFoldFuel() - (WELL_TRANSFER_COSTS.mass - COMPRESSED_JUMP_MASS)
}

/** The jump drive aboard, whatever its state. */
export function jumpDriveOf(ship: Pick<ShipState, 'subsystems'>): Subsystem | undefined {
  return ship.subsystems.find(s => s.type === 'jump_drive')
}

/** A position on the board: a well that exists, a ring it has and a sector on it. */
export function isBoardPosition(p: { wellId: string; ring: number; sector: number }): boolean {
  return (
    getGravityWell(p.wellId) !== undefined &&
    Number.isInteger(p.ring) &&
    p.ring >= 1 &&
    p.ring <= getMaxRing(p.wellId) &&
    Number.isInteger(p.sector) &&
    p.sector >= 0 &&
    p.sector < SECTORS_PER_RING
  )
}

/** A fold from `from` may land in `to`'s well: its own, or across the black hole's, never planet to planet. */
export function foldReaches(from: { wellId: string }, to: { wellId: string }): boolean {
  return from.wellId === to.wellId || from.wellId === BLACK_HOLE_ID || to.wellId === BLACK_HOLE_ID
}

/** A station spans this sector: no fold lands there, so a fold never docks. */
export function isStationSector(stations: Station[], p: Position): boolean {
  return getStationInReach(stations, p) !== undefined
}

/**
 * Every sector a fold from `from` may land on: on the board, in reach, not a
 * station's and not where the ship already is. The board lights these while a
 * fold is being picked, so it never offers a sector the referee refuses.
 */
export function foldDestinations(stations: Station[], from: Position): Position[] {
  return GRAVITY_WELLS.flatMap(well =>
    well.rings.flatMap(ring =>
      Array.from({ length: SECTORS_PER_RING }, (_, sector) => ({
        wellId: well.id,
        ring: ring.ring,
        sector,
      }))
    )
  ).filter(
    to =>
      isBoardPosition(to) &&
      foldReaches(from, to) &&
      !isStationSector(stations, to) &&
      !samePosition(from, to)
  )
}

/** Energy a fold puts on the engines, read off the drive's config so `--tiles=` reaches it. */
export function foldEngines(): number {
  return getSubsystemConfig('jump_drive').fold!.foldEngines
}

/** Put the ship down at `to` (validated), spend the fold's fuel and power the drive and the engines. */
export function applyFold(
  ship: ShipState,
  playerId: string,
  to: Position
): {
  ship: ShipState
  events: EventDraft[]
  heat: number
  engineHeat: number
  massSpent: number
  from: Position
  driveId: SubsystemId
} {
  const from = positionOf(ship)
  const drive = jumpDriveOf(ship)!
  const massSpent = foldFuel(ship)
  const moved: ShipState = {
    ...ship,
    wellId: to.wellId,
    ring: to.ring,
    sector: to.sector,
    reactionMass: ship.reactionMass - massSpent,
  }
  const used = useSubsystem(moved, playerId, drive.id, 'folded')
  const lit = useSubsystem(used.ship, playerId, 'engines', 'fired', foldEngines())
  // A compressor that paid for the fold does its job as on a jump: it flips face-up.
  let out = lit.ship
  const compressorEvents: EventDraft[] = []
  if (massSpent < baseFoldFuel()) {
    for (const compressor of workingCompressors(out)) {
      const r = useSubsystem(out, playerId, compressor.id, 'compressed_jump')
      out = r.ship
      compressorEvents.push(...r.events)
    }
  }
  return {
    ship: out,
    events: [...used.events, ...lit.events, ...compressorEvents],
    heat: used.heat + lit.heat,
    engineHeat: lit.heat,
    massSpent,
    from,
    driveId: drive.id,
  }
}
