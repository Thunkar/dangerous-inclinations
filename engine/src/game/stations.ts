/**
 * Stations orbit each planet on STATION_RING and advance at the end of every
 * round. A ship is docked when it ends its turn on a station's sector, and it
 * stays docked: a moored ship rides its station round instead of drifting on
 * its own (RULES §Stations, Moored).
 */
import type { GameState, GravityWell, Position, Station } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { PLANETS, STATION_RING } from "../models/gravityWells.ts";
import { driftPosition, positionOf, samePosition } from "./geometry.ts";
import { isOnBoard } from "./ship.ts";

export const STATION_INITIAL_SECTOR = 0;

export function createInitialStations(planets: GravityWell[] = PLANETS): Station[] {
  return planets.map((planet) => ({
    id: `station-${planet.id}`,
    planetId: planet.id,
    ring: STATION_RING,
    sector: STATION_INITIAL_SECTOR,
  }));
}

function updateStationPositions(stations: Station[]): Station[] {
  return stations.map((station) => ({
    ...station,
    sector: driftPosition({ wellId: station.planetId, ring: station.ring, sector: station.sector })
      .sector,
  }));
}

/**
 * Every sector a station can stand on: from its starting sector, stepping its
 * ring's drift once a round until the ring comes back round. All three
 * stations step together, so this is the one clock they all read.
 */
export function stationSectors(): number[] {
  const sectors: number[] = [];
  let sector = STATION_INITIAL_SECTOR;
  while (!sectors.includes(sector)) {
    sectors.push(sector);
    sector = driftPosition({ wellId: PLANETS[0].id, ring: STATION_RING, sector }).sector;
  }
  return sectors;
}

export function getStationForPlanet(stations: Station[], planetId: string): Station | undefined {
  return stations.find((s) => s.planetId === planetId);
}

export function getStationAt(stations: Station[], position: Position): Station | undefined {
  return stations.find(
    (s) =>
      s.planetId === position.wellId && s.ring === position.ring && s.sector === position.sector
  );
}

export function stationPosition(station: Station): Position {
  return { wellId: station.planetId, ring: station.ring, sector: station.sector };
}

/**
 * Moored: sitting on a station's sector. Docking is derived from position
 * (on the table the ship token is on the station token), so there is no
 * separate "docked" flag that could go stale.
 */
export function isMooredAt(stations: Station[], position: Position): boolean {
  return getStationAt(stations, position) !== undefined;
}

/**
 * Moored during the ship's own actions (RULES §Stations, Moored): it was on a
 * station's sector when its turn began and has not left it. A ship that
 * arrives is not moored until it docks at the end of its turn, so it may fire
 * after its move and a railgun's recoil onto the berth moors nothing. Stations
 * do not move during a turn and no move can leave a sector and come back to
 * it (a burn changes ring and every drift is at least one sector), so "still
 * on the start's sector" is "has not left it". Every ship that is not acting
 * is moored exactly when {@link isMooredAt} says so.
 */
export function isMooredMidTurn(stations: Station[], start: Position, at: Position): boolean {
  return isMooredAt(stations, positionOf(start)) && samePosition(positionOf(start), positionOf(at));
}

/**
 * End of the round: every station advances, and the ships moored to them go
 * with it. A destroyed ship is off the board and rides nothing. Wrecks drift
 * in the same step, each by its own ring's speed (RULES §Missions, Salvage).
 */
export function advanceStations(state: GameState): { state: GameState; events: EventDraft[] } {
  const stations = updateStationPositions(state.stations);
  const riders: string[] = [];
  const players = state.players.map((player) => {
    if (!isOnBoard(player)) return player;
    const station = getStationAt(state.stations, positionOf(player.ship));
    if (!station) return player;
    const moved = stations.find((s) => s.id === station.id)!;
    riders.push(player.id);
    return { ...player, ship: { ...player.ship, sector: moved.sector } };
  });
  const wrecks = state.wrecks.map((wreck) => ({ ...wreck, ...driftPosition(wreck) }));
  return {
    state: { ...state, stations, players, wrecks },
    events: [{ type: "stations_moved", riders, wrecks }],
  };
}
