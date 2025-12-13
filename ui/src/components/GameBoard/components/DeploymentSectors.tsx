import { useState } from 'react'
import { useBoardContext } from '../context'
import { getGravityWell } from '@dangerous-inclinations/engine'
import { DEPLOYMENT_CONSTANTS } from '@dangerous-inclinations/engine'
import { getRingRadius } from '@/constants/visualConfig'

interface DeploymentSectorsProps {
  availableSectors: number[]
  onSelectSector: (sector: number) => void
}

/**
 * Renders clickable deployment sectors on Ring 4 of the Black Hole
 */
export function DeploymentSectors({ availableSectors, onSelectSector }: DeploymentSectorsProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()
  const [hoveredSector, setHoveredSector] = useState<number | null>(null)

  const blackhole = getGravityWell('blackhole')
  if (!blackhole) return null

  const position = getGravityWellPosition('blackhole')
  const rotationOffset = getSectorRotationOffset('blackhole')

  // Get Ring 4 config (deployment ring)
  const ringConfig = blackhole.rings.find(r => r.ring === DEPLOYMENT_CONSTANTS.RING)
  if (!ringConfig) return null

  const radius = (getRingRadius('blackhole', ringConfig.ring) ?? 305) * scaleFactor
  const innerRadius = radius - 20 // Arc inner edge
  const outerRadius = radius + 10 // Arc outer edge

  return (
    <g>
      {availableSectors.map(sector => {
        const isHovered = hoveredSector === sector

        // Calculate sector arc
        const sectorStartAngle =
          (sector / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
        const sectorEndAngle =
          ((sector + 1) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

        // Create arc path
        const startInnerX = position.x + innerRadius * Math.cos(sectorStartAngle)
        const startInnerY = position.y + innerRadius * Math.sin(sectorStartAngle)
        const endInnerX = position.x + innerRadius * Math.cos(sectorEndAngle)
        const endInnerY = position.y + innerRadius * Math.sin(sectorEndAngle)
        const startOuterX = position.x + outerRadius * Math.cos(sectorStartAngle)
        const startOuterY = position.y + outerRadius * Math.sin(sectorStartAngle)
        const endOuterX = position.x + outerRadius * Math.cos(sectorEndAngle)
        const endOuterY = position.y + outerRadius * Math.sin(sectorEndAngle)

        // Calculate center of sector for label
        const sectorCenterAngle = (sectorStartAngle + sectorEndAngle) / 2
        const labelRadius = (innerRadius + outerRadius) / 2
        const labelX = position.x + labelRadius * Math.cos(sectorCenterAngle)
        const labelY = position.y + labelRadius * Math.sin(sectorCenterAngle)

        const arcPath = `
          M ${startInnerX} ${startInnerY}
          A ${innerRadius} ${innerRadius} 0 0 1 ${endInnerX} ${endInnerY}
          L ${endOuterX} ${endOuterY}
          A ${outerRadius} ${outerRadius} 0 0 0 ${startOuterX} ${startOuterY}
          Z
        `

        return (
          <g
            key={sector}
            style={{ cursor: 'pointer' }}
            onClick={e => {
              e.stopPropagation()
              onSelectSector(sector)
            }}
            onMouseEnter={() => setHoveredSector(sector)}
            onMouseLeave={() => setHoveredSector(null)}
          >
            {/* Sector arc */}
            <path
              d={arcPath}
              fill={isHovered ? 'rgba(33, 150, 243, 0.6)' : 'rgba(33, 150, 243, 0.3)'}
              stroke={isHovered ? '#2196f3' : 'rgba(33, 150, 243, 0.6)'}
              strokeWidth={isHovered ? 2 : 1}
            />
            {/* Sector label */}
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isHovered ? 10 : 8}
              fill={isHovered ? '#fff' : '#2196f3'}
              fontWeight={isHovered ? 'bold' : 'normal'}
              style={{ pointerEvents: 'none' }}
            >
              S{sector}
            </text>
          </g>
        )
      })}
    </g>
  )
}
