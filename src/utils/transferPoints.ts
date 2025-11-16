import type { GravityWell, TransferPoint, GravityWellId } from '../types/game'

/**
 * Calculate which sectors connect between gravity wells based on planetary positions
 *
 * Transfer points occur where:
 * - Black hole Ring 4 (outermost) touches Planet Ring 3 (outermost)
 * - This is always a single sector on each ring since the rings are tangent
 *
 * NOTE: Planets are at FIXED positions (velocity = 0), so transfer sectors remain constant.
 * This simplifies tabletop gameplay - players can reference a fixed transfer point chart.
 *
 * @param gravityWells - All gravity wells in the system
 * @returns Array of bidirectional transfer points (constant for static planets)
 */
export function calculateTransferPoints(gravityWells: GravityWell[]): TransferPoint[] {
  const transferPoints: TransferPoint[] = []

  // Find the black hole
  const blackHole = gravityWells.find(w => w.type === 'blackhole')
  if (!blackHole || blackHole.rings.length < 1) {
    return transferPoints
  }

  // Get the black hole's outermost ring (Ring 4)
  const blackHoleOutermostRing = blackHole.rings[blackHole.rings.length - 1]

  // Get planets
  const planets = gravityWells.filter(w => w.type === 'planet')

  // Calculate transfer points for each planet
  for (const planet of planets) {
    if (!planet.orbitalPosition || planet.rings.length < 1) {
      continue
    }

    // Get the planet's outermost ring (Ring 3)
    const planetOutermostRing = planet.rings[planet.rings.length - 1]

    // The planet's angle determines which sector on the black hole it touches
    // Convert planet angle (0-360 degrees) to a sector on black hole's outermost ring
    // Planet angle 0° = top (12 o'clock), going clockwise
    // Black hole sector 0 is also at top (12 o'clock)
    const blackHoleSectors = blackHoleOutermostRing.sectors
    const angleNormalized = (planet.orbitalPosition.angle % 360) / 360 // 0-1
    // We want the sector whose CENTER points at the planet
    const blackHoleSector = Math.floor(angleNormalized * blackHoleSectors) % blackHoleSectors

    // The planet's transfer sector is the one closest to the black hole
    // By convention, sector 0 on a planet always faces the black hole
    const planetSector = 0

    // Create bidirectional transfer points
    // Black hole -> Planet
    transferPoints.push({
      fromWellId: blackHole.id,
      toWellId: planet.id,
      fromRing: blackHoleOutermostRing.ring, // Ring 4
      toRing: planetOutermostRing.ring, // Ring 3
      fromSector: blackHoleSector,
      toSector: planetSector,
    })

    // Planet -> Black hole
    transferPoints.push({
      fromWellId: planet.id,
      toWellId: blackHole.id,
      fromRing: planetOutermostRing.ring, // Ring 3
      toRing: blackHoleOutermostRing.ring, // Ring 4
      fromSector: planetSector,
      toSector: blackHoleSector,
    })
  }

  return transferPoints
}

/**
 * Check if a ship is in a position where it can transfer to another gravity well
 * Returns all available transfer destinations from the ship's current position
 *
 * Ships can transfer from:
 * - Black hole Ring 4 (outermost) → Planet Ring 3 (outermost)
 * - Planet Ring 3 (outermost) → Black hole Ring 4 (outermost)
 *
 * @param shipWellId - The gravity well the ship is currently in
 * @param shipRing - The ring the ship is on
 * @param shipSector - The sector the ship is in
 * @param transferPoints - All calculated transfer points
 * @returns Array of available transfer points
 */
export function getAvailableWellTransfers(
  shipWellId: GravityWellId,
  shipRing: number,
  shipSector: number,
  transferPoints: TransferPoint[]
): TransferPoint[] {
  // Find all transfer points from this well/ring/sector
  // Transfer points are configured with the correct ring numbers (4 for blackhole, 3 for planets)
  return transferPoints.filter(tp =>
    tp.fromWellId === shipWellId &&
    tp.fromRing === shipRing &&
    tp.fromSector === shipSector
  )
}

/**
 * Update planetary orbital positions by advancing them according to their velocities
 *
 * NOTE: Currently planets have velocity = 0 (static positions) to simplify gameplay.
 * This function is kept for potential future use if we want to add slow planetary drift.
 *
 * @param gravityWells - Current gravity wells
 * @returns Updated gravity wells (currently unchanged since planets are static)
 */
export function advancePlanetaryOrbits(gravityWells: GravityWell[]): GravityWell[] {
  return gravityWells.map(well => {
    // Only update planets (not the black hole) if they have non-zero velocity
    if (well.type === 'planet' && well.orbitalPosition && well.orbitalPosition.velocity !== 0) {
      const newAngle = (well.orbitalPosition.angle + well.orbitalPosition.velocity) % 360

      return {
        ...well,
        orbitalPosition: {
          ...well.orbitalPosition,
          angle: newAngle,
        },
      }
    }

    return well
  })
}

/**
 * Get the name of a gravity well by its ID
 * Useful for UI display
 */
export function getWellName(wellId: GravityWellId, gravityWells: GravityWell[]): string {
  const well = gravityWells.find(w => w.id === wellId)
  return well?.name || wellId
}
