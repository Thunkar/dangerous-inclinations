import { useState } from 'react'
import { useBoardContext } from '../context'
import { GRAVITY_WELLS, type OrbitalPosition } from '@dangerous-inclinations/engine'
import { getRingRadius } from '@/constants/visualConfig'

interface SelectableSectorsProps {
  onSelectSector: (position: OrbitalPosition) => void
}

/**
 * Renders clickable sectors across all gravity wells when selecting a destination
 */
export function SelectableSectors({ onSelectSector }: SelectableSectorsProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()
  const [hoveredSector, setHoveredSector] = useState<string | null>(null)

  return (
    <g>
      {GRAVITY_WELLS.map(well => {
        const position = getGravityWellPosition(well.id)
        const rotationOffset = getSectorRotationOffset(well.id)

        return well.rings.map(ringConfig => {
          const radius = (getRingRadius(well.id, ringConfig.ring) ?? 100) * scaleFactor
          const innerRadius = radius - 15
          const outerRadius = radius + 8

          return Array.from({ length: ringConfig.sectors }).map((_, sector) => {
            const key = `${well.id}:${ringConfig.ring}:${sector}`
            const isHovered = hoveredSector === key

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

            const arcPath = `
              M ${startInnerX} ${startInnerY}
              A ${innerRadius} ${innerRadius} 0 0 1 ${endInnerX} ${endInnerY}
              L ${endOuterX} ${endOuterY}
              A ${outerRadius} ${outerRadius} 0 0 0 ${startOuterX} ${startOuterY}
              Z
            `

            return (
              <path
                key={key}
                d={arcPath}
                fill={isHovered ? 'rgba(76, 175, 80, 0.5)' : 'rgba(76, 175, 80, 0.15)'}
                stroke={isHovered ? '#4caf50' : 'rgba(76, 175, 80, 0.3)'}
                strokeWidth={isHovered ? 2 : 0.5}
                style={{ cursor: 'pointer' }}
                onClick={e => {
                  e.stopPropagation()
                  onSelectSector({
                    wellId: well.id,
                    ring: ringConfig.ring,
                    sector,
                  })
                }}
                onMouseEnter={() => setHoveredSector(key)}
                onMouseLeave={() => setHoveredSector(null)}
              />
            )
          })
        })
      })}
    </g>
  )
}
