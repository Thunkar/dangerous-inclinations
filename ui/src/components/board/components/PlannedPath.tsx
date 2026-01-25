import { useMemo } from 'react'
import { GRAVITY_WELLS, type MovementPlan } from '@dangerous-inclinations/engine'
import { useBoardContext } from '../context/BoardContext'
import { getRingRadius } from '@/constants/visualConfig'

interface PlannedPathProps {
  plan: MovementPlan
  showWaypoints?: boolean
  showTurnNumbers?: boolean
  opacity?: number
}

interface WaypointPosition {
  x: number
  y: number
  turn: number
  actionType: string
  sectorAdjustment: number
  massCost: number
}

/**
 * Calculate screen position for an orbital position
 */
function calculatePosition(
  wellId: string,
  ring: number,
  sector: number,
  getGravityWellPosition: (wellId: string) => { x: number; y: number },
  getSectorRotationOffset: (wellId: string) => number,
  scaleFactor: number
): { x: number; y: number } {
  const well = GRAVITY_WELLS.find(w => w.id === wellId)
  if (!well) return { x: 0, y: 0 }

  const ringConfig = well.rings.find(r => r.ring === ring)
  if (!ringConfig) return { x: 0, y: 0 }

  const wellPos = getGravityWellPosition(wellId)
  const rotationOffset = getSectorRotationOffset(wellId)
  const radius = (getRingRadius(wellId, ring) ?? 100) * scaleFactor
  const angle = ((sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

  return {
    x: wellPos.x + radius * Math.cos(angle),
    y: wellPos.y + radius * Math.sin(angle),
  }
}

/**
 * Generate SVG path data for an arc between two points on the same ring
 */
function generateArcPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  radius: number
): string {
  // Calculate if we should draw the long or short arc
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x)

  let angleDiff = endAngle - startAngle
  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

  // Use short arc (sweep flag = 0 if going counterclockwise, 1 if clockwise)
  const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0
  const sweepFlag = angleDiff > 0 ? 1 : 0

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`
}

/**
 * Get color for action type
 */
function getActionColor(actionType: string): string {
  switch (actionType) {
    case 'coast':
      return '#4ade80' // Green
    case 'burn_prograde':
    case 'burn_retrograde':
      return '#fb923c' // Orange
    case 'well_transfer':
      return '#a855f7' // Purple
    default:
      return '#60a5fa' // Blue
  }
}

/**
 * Renders a planned movement path on the game board
 */
export function PlannedPath({
  plan,
  showWaypoints = true,
  showTurnNumbers = true,
  opacity = 0.7,
}: PlannedPathProps) {
  const { getGravityWellPosition, getSectorRotationOffset, scaleFactor } = useBoardContext()

  // Calculate all waypoint positions
  const waypoints = useMemo(() => {
    const positions: WaypointPosition[] = []

    // Add origin
    positions.push({
      ...calculatePosition(
        plan.origin.wellId,
        plan.origin.ring,
        plan.origin.sector,
        getGravityWellPosition,
        getSectorRotationOffset,
        scaleFactor
      ),
      turn: 0,
      actionType: 'start',
      sectorAdjustment: 0,
      massCost: 0,
    })

    // Add each step's destination
    let turn = 1
    for (const step of plan.steps) {
      positions.push({
        ...calculatePosition(
          step.to.wellId,
          step.to.ring,
          step.to.sector,
          getGravityWellPosition,
          getSectorRotationOffset,
          scaleFactor
        ),
        turn,
        actionType: step.actionType,
        sectorAdjustment: step.sectorAdjustment,
        massCost: step.massCost,
      })
      turn++
    }

    return positions
  }, [plan, getGravityWellPosition, getSectorRotationOffset, scaleFactor])

  // Generate path segments
  const pathSegments = useMemo(() => {
    const segments: Array<{
      path: string
      color: string
      actionType: string
    }> = []

    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i]
      const end = waypoints[i + 1]
      const step = plan.steps[i]

      if (!step) continue

      let pathData: string

      if (step.from.wellId === step.to.wellId && step.from.ring === step.to.ring) {
        // Same ring - draw arc
        const wellPos = getGravityWellPosition(step.from.wellId)
        const radius = (getRingRadius(step.from.wellId, step.from.ring) ?? 100) * scaleFactor
        pathData = generateArcPath(start, end, wellPos, radius)
      } else if (step.actionType === 'well_transfer') {
        // Well transfer - draw curved line away from black hole
        const bhPos = getGravityWellPosition('blackhole')
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2

        // Curve outward from black hole
        const dx = midX - bhPos.x
        const dy = midY - bhPos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const curveOffset = 50 * scaleFactor

        const controlX = midX + (dx / dist) * curveOffset
        const controlY = midY + (dy / dist) * curveOffset

        pathData = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`
      } else {
        // Ring transfer - draw straight line
        pathData = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
      }

      segments.push({
        path: pathData,
        color: getActionColor(step.actionType),
        actionType: step.actionType,
      })
    }

    return segments
  }, [waypoints, plan.steps, getGravityWellPosition, scaleFactor])

  if (waypoints.length < 2) return null

  return (
    <g className="planned-path" opacity={opacity}>
      {/* Path segments */}
      {pathSegments.map((segment, i) => (
        <path
          key={`path-${i}`}
          d={segment.path}
          fill="none"
          stroke={segment.color}
          strokeWidth={3}
          strokeDasharray="8 4"
          strokeLinecap="round"
        />
      ))}

      {/* Waypoint markers */}
      {showWaypoints &&
        waypoints.map((wp, i) => (
          <g key={`waypoint-${i}`}>
            {/* Outer ring */}
            <circle
              cx={wp.x}
              cy={wp.y}
              r={i === 0 ? 8 : i === waypoints.length - 1 ? 10 : 6}
              fill={i === 0 ? '#3b82f6' : i === waypoints.length - 1 ? '#22c55e' : getActionColor(wp.actionType)}
              stroke="white"
              strokeWidth={2}
            />

            {/* Turn number */}
            {showTurnNumbers && i > 0 && (
              <text
                x={wp.x}
                y={wp.y + 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight="bold"
                fill="white"
              >
                {wp.turn}
              </text>
            )}

            {/* Sector adjustment indicator */}
            {wp.sectorAdjustment !== 0 && (
              <g>
                <rect
                  x={wp.x + 8}
                  y={wp.y - 4}
                  width={28}
                  height={12}
                  rx={2}
                  fill="rgba(96, 165, 250, 0.9)"
                />
                <text
                  x={wp.x + 22}
                  y={wp.y + 5}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight="bold"
                  fill="white"
                >
                  {wp.sectorAdjustment > 0 ? '+' : ''}{wp.sectorAdjustment}
                </text>
              </g>
            )}

            {/* Mass cost indicator for burns */}
            {wp.massCost > 0 && i > 0 && (
              <text
                x={wp.x}
                y={wp.y + 18}
                textAnchor="middle"
                fontSize={8}
                fill="#fb923c"
                fontWeight="bold"
              >
                -{wp.massCost}M
              </text>
            )}

            {/* Start/End labels */}
            {i === 0 && (
              <text
                x={wp.x}
                y={wp.y - 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill="#3b82f6"
              >
                START
              </text>
            )}
            {i === waypoints.length - 1 && (
              <text
                x={wp.x}
                y={wp.y - 16}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill="#22c55e"
              >
                DEST
              </text>
            )}
          </g>
        ))}

      {/* Plan summary label */}
      <g transform={`translate(${waypoints[0].x + 20}, ${waypoints[0].y - 30})`}>
        <rect x={0} y={0} width={80} height={24} rx={4} fill="rgba(0,0,0,0.7)" />
        <text x={40} y={16} textAnchor="middle" fontSize={10} fill="white">
          {plan.totalTurns}T / {plan.totalMassCost}M
        </text>
      </g>
    </g>
  )
}
