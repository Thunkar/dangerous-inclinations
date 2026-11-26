/**
 * Stations orbit each planet on STATION_RING and advance at the end of every
 * round. A station spans its centre sector and DOCKING_REACH sectors either
 * side of it on its ring. A ship docks when it arrives on any of them, and
 * stays docked on that sector: a moored ship rides its station round,
 * keeping its place on it, instead of drifting on its own (RULES §Stations,
 * Moored).
 */
import type { GameState, GravityWell, Position, Station } from '../models/game.ts'
import type { EventDraft } from '../models/events.ts'
import {
  DOCKING_REACH,
  PLANETS,
  STATION_INITIAL_SECTOR,
  STATION_RING,
} from '../models/gravityWells.ts'
import { driftPosition, positionOf, samePosition, sectorDistance, wrapSector } from './geometry.ts'
import { isPowered } from '../models/subsystems.ts'
import { findSubsystem, isOnBoard } from './ship.ts'
import { scoopYield } from './movement.ts'

export function createInitialStations(planets: GravityWell[] = PLANETS): Station[] {
  return planets.map(planet => ({
    id: `station-${planet.id}`,
    planetId: planet.id,
    ring: STATION_RING,
    sector: STATION_INITIAL_SECTOR,
  }))
}

function updateStationPositions(stations: Station[]): Station[] {
  return stations.map(station => ({
    ...station,
    sector: driftPosition({ wellId: station.planetId, ring: station.ring, sector: station.sector })
      .sector,
  }))
}

/**
 * Every sector a station can stand on: from its starting sector, stepping its
 * ring's drift once a round until the ring comes back round. All three
 * stations step together, so this is the one clock they all read.
 */
export function stationSectors(): number[] {
  const sectors: number[] = []
  let sector = STATION_INITIAL_SECTOR
  while (!sectors.includes(sector)) {
    sectors.push(sector)
    sector = driftPosition({ wellId: PLANETS[0].id, ring: STATION_RING, sector }).sector
  }
  return sectors
}

export function getStationForPlanet(stations: Station[], planetId: string): Station | undefined {
  return stations.find(s => s.planetId === planetId)
}

/** The station whose centre is on this sector: where its token stands. */
export function getStationAt(stations: Station[], position: Position): Station | undefined {
  return stations.find(
    s => s.planetId === position.wellId && s.ring === position.ring && s.sector === position.sector
  )
}

export function stationPosition(station: Station): Position {
  return { wellId: station.planetId, ring: station.ring, sector: station.sector }
}

/**
 * `pos` is on the station centred on `station`: the same well, the same ring
 * and within DOCKING_REACH sectors. A ship ending its turn there docks.
 */
export function inDockingReach(station: Position, pos: Position): boolean {
  return (
    pos.wellId === station.wellId &&
    pos.ring === station.ring &&
    sectorDistance(pos.sector, station.sector) <= DOCKING_REACH
  )
}

/** The station `position` is on, if any: the one a ship arriving there docks at. */
export function getStationInReach(stations: Station[], position: Position): Station | undefined {
  return stations.find(s => inDockingReach(stationPosition(s), position))
}

/**
 * Moored: sitting on a station, on any of its sectors. Docking is derived
 * from position (on the table the ship token is on the station token), so
 * there is no separate "docked" flag that could go stale.
 */
export function isMooredAt(stations: Station[], position: Position): boolean {
  return getStationInReach(stations, position) !== undefined
}

/**
 * Moored during the ship's own actions (RULES §Stations, Moored): it was on a
 * station when its turn began and has not left its sector. A ship that
 * arrives is not moored until it docks at the end of its turn, so it may fire
 * after its move and a railgun's recoil onto the berth moors nothing. Stations
 * do not move during a turn and no move can leave a sector and come back to
 * it (a burn changes ring and every drift is at least one sector), so "still
 * on the start's sector" is "has not left it". Every ship that is not acting
 * is moored exactly when {@link isMooredAt} says so.
 */
export function isMooredMidTurn(stations: Station[], start: Position, at: Position): boolean {
  return isMooredAt(stations, positionOf(start)) && samePosition(positionOf(start), positionOf(at))
}

/**
 * End of the round: every station advances, and the ships moored to them go
 * with it, each keeping its sector's offset from the centre. A destroyed
 * ship is off the board and rides nothing. Wrecks drift in the same step,
 * each by its own ring's speed (RULES §Missions, Salvage).
 *
 * A rider whose scoop still has energy on it, unbroken, takes its fuel now:
 * the berth moves the ship, so the scoop pays on the ride, not on the coast
 * that held the berth (RULES §Stations, Moored). Not a ship that docked this
 * round: its scoop ran on a coast before the dock and paid there.
 */
export function advanceStations(state: GameState): { state: GameState; events: EventDraft[] } {
  const stations = updateStationPositions(state.stations)
  const riders: string[] = []
  const scooped: EventDraft[] = []
  const players = state.players.map(before => {
    const player = { ...before, dockedThisRound: false }
    if (!isOnBoard(player)) return player
    const station = getStationInReach(state.stations, positionOf(player.ship))
    if (!station) return player
    const moved = stations.find(s => s.id === station.id)!
    riders.push(player.id)
    let ship = {
      ...player.ship,
      sector: wrapSector(player.ship.sector + moved.sector - station.sector),
    }
    const scoop = findSubsystem(ship, 'scoop')
    if (scoop && isPowered(scoop) && !scoop.isBroken && !before.dockedThisRound) {
      const amount = scoopYield(ship, ship.reactionMass)
      ship = { ...ship, reactionMass: ship.reactionMass + amount }
      scooped.push({ type: 'fuel_scooped', playerId: player.id, amount })
    }
    return { ...player, ship }
  })
  const wrecks = state.wrecks.map(wreck => ({ ...wreck, ...driftPosition(wreck) }))
  return {
    state: { ...state, stations, players, wrecks },
    events: [{ type: 'stations_moved', riders, wrecks }, ...scooped],
  }
}
