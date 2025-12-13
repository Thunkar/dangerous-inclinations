/**
 * Station System for Dangerous Inclinations
 *
 * Each planet has an orbital station at Ring 1.
 * Stations orbit at Ring 1's velocity (4 sectors per round).
 * Station positions update at the END of each round (after all players act).
 * Ships dock by being at the same ring/sector as a station.
 */

import type { Station, GravityWell } from '../types/game'

/**
 * Station constants
 */
export const STATION_CONSTANTS = {
  RING: 1, // Stations always orbit at Ring 1
  INITIAL_SECTOR: 0, // All stations start at sector 0
  SECTORS_PER_RING: 24, // Standard sector count
} as const

/**
 * Create initial stations for all planets
 * Each planet gets one station at Ring 1, Sector 0
 */
export function createInitialStations(gravityWells: GravityWell[]): Station[] {
  return gravityWells
    .filter(well => well.type === 'planet')
    .map(planet => ({
      id: `station-${planet.id}`,
      planetId: planet.id,
      ring: STATION_CONSTANTS.RING,
      sector: STATION_CONSTANTS.INITIAL_SECTOR,
    }))
}

/**
 * Update station positions based on orbital velocity
 * Called at the end of each round (when turn wraps to player 0)
 * Ring 1 velocity is 4, so stations move 4 sectors per round
 */
export function updateStationPositions(stations: Station[], gravityWells: GravityWell[]): Station[] {
  return stations.map(station => {
    // Find the planet's ring configuration
    const planet = gravityWells.find(w => w.id === station.planetId)
    if (!planet) return station

    const ringConfig = planet.rings.find(r => r.ring === station.ring)
    if (!ringConfig) return station

    // Move station by ring velocity, wrapping around
    const newSector = (station.sector + ringConfig.velocity) % ringConfig.sectors

    return {
      ...station,
      sector: newSector,
    }
  })
}

/**
 * Get a station at a specific position
 * Returns undefined if no station is at that location
 */
export function getStationAtPosition(
  stations: Station[],
  wellId: string,
  ring: number,
  sector: number
): Station | undefined {
  return stations.find(
    station =>
      station.planetId === wellId &&
      station.ring === ring &&
      station.sector === sector
  )
}

/**
 * Get the station for a specific planet
 */
export function getStationForPlanet(stations: Station[], planetId: string): Station | undefined {
  return stations.find(station => station.planetId === planetId)
}

/**
 * Check if a ship is at a station's position
 * Ship must be in the same gravity well, ring, and sector
 */
export function isShipAtStation(
  stations: Station[],
  wellId: string,
  ring: number,
  sector: number
): boolean {
  return getStationAtPosition(stations, wellId, ring, sector) !== undefined
}

/**
 * Get all stations that a ship is currently docked at
 * (Usually just 0 or 1, but could be more with overlapping rings)
 */
export function getStationsAtShipPosition(
  stations: Station[],
  wellId: string,
  ring: number,
  sector: number
): Station[] {
  return stations.filter(
    station =>
      station.planetId === wellId &&
      station.ring === ring &&
      station.sector === sector
  )
}
