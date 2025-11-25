import type { TransferPoint } from '../../../types/game'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'

interface TransferSectorsProps {
  transferPoints: TransferPoint[]
}

/**
 * Renders Venn diagram-style overlapping regions for transfer sectors
 * between gravity wells
 */
export function TransferSectors({
  transferPoints,
}: TransferSectorsProps) {
  const { gameState } = useGame()
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset, getSectorAngleDirection } =
    useBoardContext()

  return (
    <>
      {transferPoints.map((tp, idx) => {
        // Only render each overlap once (skip reverse direction)
        if (tp.fromWellId > tp.toWellId) return null

        const fromWell = gameState.gravityWells.find(w => w.id === tp.fromWellId)
        const toWell = gameState.gravityWells.find(w => w.id === tp.toWellId)
        if (!fromWell || !toWell) return null

        const fromPosition = getGravityWellPosition(tp.fromWellId)
        const toPosition = getGravityWellPosition(tp.toWellId)

        // Get outermost ring configs (not hardcoded to Ring 5)
        const fromOutermostRing = fromWell.rings[fromWell.rings.length - 1]
        const toOutermostRing = toWell.rings[toWell.rings.length - 1]
        if (!fromOutermostRing || !toOutermostRing) return null

        const fromRadius = fromOutermostRing.radius * scaleFactor
        const toRadius = toOutermostRing.radius * scaleFactor

        // Get rotation offsets and direction multipliers
        const fromRotationOffset = getSectorRotationOffset(tp.fromWellId)
        const toRotationOffset = getSectorRotationOffset(tp.toWellId)
        const fromDirection = getSectorAngleDirection(tp.fromWellId)
        const toDirection = getSectorAngleDirection(tp.toWellId)

        // Calculate sector CENTER angles (use i + 0.5 to get center of sector)
        // Apply direction multiplier for planets (which rotate counterclockwise)
        const fromSectorCenterAngle =
          fromDirection * ((tp.fromSector + 0.5) / fromOutermostRing.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          fromRotationOffset
        const toSectorCenterAngle =
          toDirection * ((tp.toSector + 0.5) / toOutermostRing.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          toRotationOffset

        // Calculate sector BOUNDARY angles
        const sectorHalfWidth = Math.PI / fromOutermostRing.sectors // Half of one sector's angular width
        const fromSectorStartAngle = fromSectorCenterAngle - fromDirection * sectorHalfWidth
        const fromSectorEndAngle = fromSectorCenterAngle + fromDirection * sectorHalfWidth
        const toSectorStartAngle = toSectorCenterAngle - toDirection * sectorHalfWidth
        const toSectorEndAngle = toSectorCenterAngle + toDirection * sectorHalfWidth

        // Calculate arc boundary points on black hole ring
        const fromStartX = fromPosition.x + fromRadius * Math.cos(fromSectorStartAngle)
        const fromStartY = fromPosition.y + fromRadius * Math.sin(fromSectorStartAngle)
        const fromEndX = fromPosition.x + fromRadius * Math.cos(fromSectorEndAngle)
        const fromEndY = fromPosition.y + fromRadius * Math.sin(fromSectorEndAngle)

        // Calculate arc boundary points on planet ring
        const toStartX = toPosition.x + toRadius * Math.cos(toSectorStartAngle)
        const toStartY = toPosition.y + toRadius * Math.sin(toSectorStartAngle)
        const toEndX = toPosition.x + toRadius * Math.cos(toSectorEndAngle)
        const toEndY = toPosition.y + toRadius * Math.sin(toSectorEndAngle)

        // Determine arc sweep flags based on rotation direction
        // For clockwise (black hole): sweep-flag = 1
        // For counterclockwise (planets): sweep-flag = 0
        const fromSweepFlag = fromDirection > 0 ? 1 : 0
        const toSweepFlag = toDirection > 0 ? 1 : 0

        return (
          <g key={`transfer-overlap-${idx}`}>
            {/* Draw the lens-shaped overlap region using two circular arcs */}
            <path
              d={`
                  M ${fromStartX} ${fromStartY}
                  A ${fromRadius} ${fromRadius} 0 0 ${fromSweepFlag} ${fromEndX} ${fromEndY}
                  L ${toEndX} ${toEndY}
                  A ${toRadius} ${toRadius} 0 0 ${toSweepFlag === 1 ? 0 : 1} ${toStartX} ${toStartY}
                  Z
                `}
              fill="#FFD700"
              opacity={0.25}
              stroke="#FFD700"
              strokeWidth={2}
            />
          </g>
        )
      })}
    </>
  )
}
