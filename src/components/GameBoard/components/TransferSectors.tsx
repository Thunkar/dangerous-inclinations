import type { TransferPoint } from '../../../types/game'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'

interface TransferSectorsProps {
  transferPoints: TransferPoint[]
}

/**
 * Renders elliptic transfer trajectories between gravity wells
 * Each transfer point gets its own arc showing the launch and arrival sectors
 */
export function TransferSectors({
  transferPoints,
}: TransferSectorsProps) {
  const { gameState } = useGame()
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()

  return (
    <>
      {transferPoints.map((tp, idx) => {
        const fromWell = gameState.gravityWells.find(w => w.id === tp.fromWellId)
        const toWell = gameState.gravityWells.find(w => w.id === tp.toWellId)
        if (!fromWell || !toWell) return null

        const fromPosition = getGravityWellPosition(tp.fromWellId)
        const toPosition = getGravityWellPosition(tp.toWellId)

        // Get outermost ring configs
        const fromOutermostRing = fromWell.rings[fromWell.rings.length - 1]
        const toOutermostRing = toWell.rings[toWell.rings.length - 1]
        if (!fromOutermostRing || !toOutermostRing) return null

        const fromRadius = fromOutermostRing.radius * scaleFactor
        const toRadius = toOutermostRing.radius * scaleFactor

        // Get rotation offsets (all wells rotate clockwise, direction = 1)
        const fromRotationOffset = getSectorRotationOffset(tp.fromWellId)
        const toRotationOffset = getSectorRotationOffset(tp.toWellId)

        // Calculate sector CENTER angles for launch and arrival sectors
        const fromSectorCenterAngle =
          ((tp.fromSector + 0.5) / fromOutermostRing.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          fromRotationOffset
        const toSectorCenterAngle =
          ((tp.toSector + 0.5) / toOutermostRing.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          toRotationOffset

        // Calculate launch and arrival points
        const launchX = fromPosition.x + fromRadius * Math.cos(fromSectorCenterAngle)
        const launchY = fromPosition.y + fromRadius * Math.sin(fromSectorCenterAngle)
        const arrivalX = toPosition.x + toRadius * Math.cos(toSectorCenterAngle)
        const arrivalY = toPosition.y + toRadius * Math.sin(toSectorCenterAngle)

        // Determine color based on direction
        const isOutbound = tp.fromWellId === 'blackhole'
        const color = isOutbound ? '#FFD700' : '#00CED1' // Gold for outbound, cyan for return

        // Calculate elliptic arc control points
        // For a realistic Hohmann-like transfer, the trajectory curves outward (away from black hole)
        const midX = (launchX + arrivalX) / 2
        const midY = (launchY + arrivalY) / 2

        // Calculate distance between launch and arrival points
        const dx = arrivalX - launchX
        const dy = arrivalY - launchY
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Get the black hole position (always the gravitational center)
        const bhPosition = getGravityWellPosition('blackhole')

        // Vector from midpoint AWAY from black hole (outward direction)
        const awayFromBlackHoleX = midX - bhPosition.x
        const awayFromBlackHoleY = midY - bhPosition.y
        const awayDist = Math.sqrt(awayFromBlackHoleX * awayFromBlackHoleX + awayFromBlackHoleY * awayFromBlackHoleY)

        // Curve outward (away from black hole) by 15% of transfer distance
        const curveOffset = distance * 0.15

        const controlX = midX + (awayFromBlackHoleX / awayDist) * curveOffset
        const controlY = midY + (awayFromBlackHoleY / awayDist) * curveOffset

        // Calculate arrow direction - point from control point toward arrival sector
        // This shows the direction of travel along the transfer trajectory
        const toArrivalX = arrivalX - controlX
        const toArrivalY = arrivalY - controlY
        const arrowAngle = Math.atan2(toArrivalY, toArrivalX) * (180 / Math.PI)

        return (
          <g key={`transfer-${tp.fromWellId}-${tp.toWellId}-${idx}`}>
            {/* Elliptic transfer arc */}
            <path
              d={`M ${launchX} ${launchY} Q ${controlX} ${controlY} ${arrivalX} ${arrivalY}`}
              fill="none"
              stroke={color}
              strokeWidth={3}
              opacity={0.6}
              strokeDasharray="8 4"
            />

            {/* Launch sector marker */}
            <circle
              cx={launchX}
              cy={launchY}
              r={6}
              fill={color}
              opacity={0.8}
              stroke="#ffffff"
              strokeWidth={2}
            />

            {/* Arrival sector marker */}
            <circle
              cx={arrivalX}
              cy={arrivalY}
              r={6}
              fill={color}
              opacity={0.8}
              stroke="#ffffff"
              strokeWidth={2}
            />

            {/* Arrow at midpoint to show direction */}
            <g transform={`translate(${controlX}, ${controlY}) rotate(${arrowAngle})`}>
              <circle r={8} fill={color} opacity={0.6} />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="bold"
              >
                →
              </text>
            </g>
          </g>
        )
      })}
    </>
  )
}
