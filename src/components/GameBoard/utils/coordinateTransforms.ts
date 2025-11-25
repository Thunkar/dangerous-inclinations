import type { GravityWell } from '../../../types/game'
import {
  getGravityWellPosition,
  getSectorRotationOffset,
  getSectorAngleDirection,
} from './gravityWellGeometry'

export interface SectorPositionParams {
  wellId: string
  ring: number
  sector: number
  gravityWells: GravityWell[]
  centerX: number
  centerY: number
  scaleFactor: number
}

/**
 * Convert sector position to SVG coordinates
 */
export function sectorToCoordinates(params: SectorPositionParams): { x: number; y: number } {
  const { wellId, ring, sector, gravityWells, centerX, centerY, scaleFactor } = params

  const well = gravityWells.find(w => w.id === wellId)
  if (!well) return { x: centerX, y: centerY }

  const ringConfig = well.rings.find(r => r.ring === ring)
  if (!ringConfig) return { x: centerX, y: centerY }

  const wellPosition = getGravityWellPosition(wellId, gravityWells, centerX, centerY, scaleFactor)
  const radius = ringConfig.radius * scaleFactor
  const rotationOffset = getSectorRotationOffset(wellId, gravityWells)
  const direction = getSectorAngleDirection(wellId, gravityWells)

  const angle = calculateSectorAngle({
    sector,
    sectorCount: ringConfig.sectors,
    direction,
    rotationOffset,
  })

  const x = wellPosition.x + radius * Math.cos(angle)
  const y = wellPosition.y + radius * Math.sin(angle)

  return { x, y }
}

export interface SectorAngleParams {
  sector: number
  sectorCount: number
  direction: number
  rotationOffset: number
}

/**
 * Calculate angle for a sector (in radians)
 * Sector center is at (sector + 0.5) / sectorCount
 */
export function calculateSectorAngle(params: SectorAngleParams): number {
  const { sector, sectorCount, direction, rotationOffset } = params
  return (
    direction * ((sector + 0.5) / sectorCount) * 2 * Math.PI - Math.PI / 2 + rotationOffset
  )
}
