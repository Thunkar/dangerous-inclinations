import type { GravityWell, TransferPoint, GravityWellId } from '../types/game'

/**
 * Fixed transfer sectors for elliptic orbits between black hole and planets
 *
 * Each planet has TWO transfer trajectories:
 * 1. OUTBOUND (Black Hole → Planet): Elliptic transfer requiring engines at level 3
 * 2. RETURN (Planet → Black Hole): Elliptic transfer requiring engines at level 3
 *
 * These sectors are FIXED (do not change based on orbital position) and represent
 * realistic Hohmann-like transfer orbits between gravity wells.
 *
 * NOTE: Planets are at FIXED positions (velocity = 0), so transfer sectors remain constant.
 * This simplifies tabletop gameplay - players can reference a fixed transfer point chart.
 */

/**
 * Define fixed transfer sectors for each planet
 * Format: { planetId, outbound: {from, to}, return: {from, to} }
 */
const FIXED_TRANSFER_SECTORS: Record<
  string,
  {
    outbound: { bhSector: number; planetSector: number }
    return: { planetSector: number; bhSector: number }
  }
> = {
  'planet-alpha': {
    outbound: { bhSector: 17, planetSector: 7 }, // BH R4 S17 → Alpha R3 S7
    return: { planetSector: 16, bhSector: 6 }, // Alpha R3 S16 → BH R4 S6
  },
  'planet-beta': {
    outbound: { bhSector: 1, planetSector: 7 }, // BH R4 S1 → Beta R3 S7
    return: { planetSector: 16, bhSector: 14 }, // Beta R3 S16 → BH R4 S14
  },
  'planet-gamma': {
    outbound: { bhSector: 9, planetSector: 7 }, // BH R4 S9 → Gamma R3 S7
    return: { planetSector: 16, bhSector: 22 }, // Gamma R3 S16 → BH R4 S22
  },
}

/**
 * Calculate transfer points using fixed elliptic transfer sectors
 *
 * @param gravityWells - All gravity wells in the system
 * @returns Array of transfer points with fixed launch/arrival sectors
 */
export function calculateTransferPoints(gravityWells: GravityWell[]): TransferPoint[] {
  const transferPoints: TransferPoint[] = []

  // Find the black hole
  const blackHole = gravityWells.find(w => w.type === 'blackhole')
  if (!blackHole || blackHole.rings.length < 4) {
    return transferPoints
  }

  // Get the black hole's outermost ring (Ring 4)
  const blackHoleOutermostRing = blackHole.rings[3] // Ring 4 (index 3)

  // Get planets
  const planets = gravityWells.filter(w => w.type === 'planet')

  // Create transfer points for each planet using fixed sectors
  for (const planet of planets) {
    if (!planet.orbitalPosition || planet.rings.length < 3) {
      continue
    }

    // Get the planet's outermost ring (Ring 3)
    const planetOutermostRing = planet.rings[2] // Ring 3 (index 2)

    // Get fixed transfer sectors for this planet
    const transferSectors = FIXED_TRANSFER_SECTORS[planet.id]
    if (!transferSectors) {
      console.warn(`No fixed transfer sectors defined for planet ${planet.id}`)
      continue
    }

    // OUTBOUND: Black hole -> Planet (elliptic trajectory)
    transferPoints.push({
      fromWellId: blackHole.id,
      toWellId: planet.id,
      fromRing: blackHoleOutermostRing.ring, // Ring 4
      toRing: planetOutermostRing.ring, // Ring 3
      fromSector: transferSectors.outbound.bhSector,
      toSector: transferSectors.outbound.planetSector,
      requiredEngineLevel: 3, // Requires engines at level 3
    })

    // RETURN: Planet -> Black hole (elliptic trajectory)
    transferPoints.push({
      fromWellId: planet.id,
      toWellId: blackHole.id,
      fromRing: planetOutermostRing.ring, // Ring 3
      toRing: blackHoleOutermostRing.ring, // Ring 4
      fromSector: transferSectors.return.planetSector,
      toSector: transferSectors.return.bhSector,
      requiredEngineLevel: 3, // Requires engines at level 3
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
  return transferPoints.filter(
    tp => tp.fromWellId === shipWellId && tp.fromRing === shipRing && tp.fromSector === shipSector
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
