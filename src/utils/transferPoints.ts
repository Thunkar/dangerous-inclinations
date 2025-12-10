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
 *
 * 6 Planets at 60° intervals (24 sectors = 15° each):
 * - Alpha: 0° (sector 0 points toward planet)
 * - Beta: 60° (sector 4)
 * - Gamma: 120° (sector 8)
 * - Delta: 180° (sector 12)
 * - Epsilon: 240° (sector 16)
 * - Zeta: 300° (sector 20)
 *
 * Outbound (BH → Planet): Launch from sector slightly behind planet direction
 * Return (Planet → BH): Launch from sector pointing back toward BH
 *
 * Each planet's outbound/return sectors are offset by ~2 sectors from the direct line
 * to create elliptic transfer trajectories.
 */
const FIXED_TRANSFER_SECTORS: Record<
  string,
  {
    outbound: { bhSector: number; planetSector: number }
    return: { planetSector: number; bhSector: number }
  }
> = {
  // Alpha at 0° (BH sector 0 points toward Alpha, planet sector 0 points toward BH)
  // Outbound: BH -4 sectors, Planet +5 sectors from midpoint (moved 1 sector away)
  // Return: Planet -6 sectors, BH +3 sectors from midpoint (moved 1 sector away)
  'planet-alpha': {
    outbound: { bhSector: 20, planetSector: 5 }, // BH R5 S20 → Alpha R3 S5
    return: { planetSector: 18, bhSector: 3 }, // Alpha R3 S18 → BH R5 S3
  },
  // Beta at 60° (BH sector 4 points toward Beta)
  'planet-beta': {
    outbound: { bhSector: 0, planetSector: 5 }, // BH R5 S0 → Beta R3 S5
    return: { planetSector: 18, bhSector: 7 }, // Beta R3 S18 → BH R5 S7
  },
  // Gamma at 120° (BH sector 8 points toward Gamma)
  'planet-gamma': {
    outbound: { bhSector: 4, planetSector: 5 }, // BH R5 S4 → Gamma R3 S5
    return: { planetSector: 18, bhSector: 11 }, // Gamma R3 S18 → BH R5 S11
  },
  // Delta at 180° (BH sector 12 points toward Delta)
  'planet-delta': {
    outbound: { bhSector: 8, planetSector: 5 }, // BH R5 S8 → Delta R3 S5
    return: { planetSector: 18, bhSector: 15 }, // Delta R3 S18 → BH R5 S15
  },
  // Epsilon at 240° (BH sector 16 points toward Epsilon)
  'planet-epsilon': {
    outbound: { bhSector: 12, planetSector: 5 }, // BH R5 S12 → Epsilon R3 S5
    return: { planetSector: 18, bhSector: 19 }, // Epsilon R3 S18 → BH R5 S19
  },
  // Zeta at 300° (BH sector 20 points toward Zeta)
  'planet-zeta': {
    outbound: { bhSector: 16, planetSector: 5 }, // BH R5 S16 → Zeta R3 S5
    return: { planetSector: 18, bhSector: 23 }, // Zeta R3 S18 → BH R5 S23
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
  if (!blackHole || blackHole.rings.length < 5) {
    return transferPoints
  }

  // Get the black hole's outermost ring (Ring 5)
  const blackHoleOutermostRing = blackHole.rings[4] // Ring 5 (index 4)

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
