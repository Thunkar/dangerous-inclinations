/**
 * Stations orbit each planet on STATION_RING and advance at the end of every
 * round. A ship is docked when it ends its turn on a station's sector, and it
 * stays docked: a moored ship rides its station round instead of drifting on
 * its own (RULES §Moored).
 */
import type { GameState, GravityWell, Position, Station } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { PLANETS, STATION_RING } from "../models/gravityWells.ts";
import { driftPosition, positionOf } from "./geometry.ts";
import { isDestroyed } from "./ship.ts";

export const STATION_INITIAL_SECTOR = 0;

export function createInitialStations(planets: GravityWell[] = PLANETS): Station[] {
  return planets.map((planet) => ({
    id: `station-${planet.id}`,
    planetId: planet.id,
    ring: STATION_RING,
    sector: STATION_INITIAL_SECTOR,
  }));
}

export function updateStationPositions(stations: Station[]): Station[] {
  return stations.map((station) => ({
    ...station,
    sector: driftPosition({ wellId: station.planetId, ring: station.ring, sector: station.sector })
      .sector,
  }));
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
 * Moored: sitting on a station's sector. Docking is derived from position —
 * on the table the ship token is on the station token — so there is no
 * separate "docked" flag that could go stale.
 */
export function isMooredAt(stations: Station[], position: Position): boolean {
  return getStationAt(stations, position) !== undefined;
}

/**
 * End of the round: every station advances, and the ships moored to them go
 * with it. A destroyed ship is off the board and rides nothing.
 */
export function advanceStations(state: GameState): { state: GameState; events: EventDraft[] } {
  const stations = updateStationPositions(state.stations);
  const riders: string[] = [];
  const players = state.players.map((player) => {
    if (!player.hasDeployed || isDestroyed(player.ship)) return player;
    const station = getStationAt(state.stations, positionOf(player.ship));
    if (!station) return player;
    const moved = stations.find((s) => s.id === station.id)!;
    riders.push(player.id);
    return { ...player, ship: { ...player.ship, sector: moved.sector } };
  });
  return {
    state: { ...state, stations, players },
    events: [{ type: "stations_moved", riders }],
  };
}
