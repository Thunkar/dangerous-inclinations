/**
 * Stations orbit each planet on STATION_RING and advance at the end of every
 * round. A ship is docked when it ends its turn on a station's sector.
 */
import type { GravityWell, Position, Station } from "../models/game.ts";
import { PLANETS, STATION_RING } from "../models/gravityWells.ts";
import { driftPosition } from "./geometry.ts";

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
