import type { GravityWell as GravityWellType, TransferPoint } from '../../../types/game'
import { useBoardContext } from '../context'
import { getGravityWell } from '../../../constants/gravityWells'

/**
 * Lighten a hex color by a given amount (0-1)
 */
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount))
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * amount))
  const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Darken a hex color by a given amount (0-1)
 */
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.floor((num >> 16) * (1 - amount)))
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00ff) * (1 - amount)))
  const b = Math.max(0, Math.floor((num & 0x0000ff) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Get the color for a transfer sector based on its associated planet
 * Outbound (to planet) uses lightened planet color
 * Return (from planet) uses darkened planet color
 */
function getTransferSectorColor(
  wellId: string,
  sector: number,
  transferPoints: TransferPoint[]
): string | null {
  // Find the transfer point(s) for this sector
  for (const tp of transferPoints) {
    // Outbound from blackhole to planet
    if (tp.fromWellId === wellId && tp.fromSector === sector) {
      const planet = getGravityWell(tp.toWellId)
      const baseColor = planet?.color || '#FFD700'
      return lightenColor(baseColor, 0.3)
    }
    // Arrival at blackhole from planet (return journey)
    if (tp.toWellId === wellId && tp.toSector === sector) {
      const planet = getGravityWell(tp.fromWellId)
      const baseColor = planet?.color || '#FFD700'
      return darkenColor(baseColor, 0.2)
    }
    // Outbound from planet to blackhole (return journey - launch side)
    if (tp.fromWellId === wellId && tp.fromWellId !== 'blackhole' && tp.fromSector === sector) {
      const planet = getGravityWell(tp.fromWellId)
      const baseColor = planet?.color || '#FFD700'
      return darkenColor(baseColor, 0.2)
    }
    // Arrival at planet from blackhole (outbound journey - arrival side)
    if (tp.toWellId === wellId && tp.toWellId !== 'blackhole' && tp.toSector === sector) {
      const planet = getGravityWell(tp.toWellId)
      const baseColor = planet?.color || '#FFD700'
      return lightenColor(baseColor, 0.3)
    }
  }
  return null
}

interface GravityWellProps {
  well: GravityWellType
  wellColor: string
  wellRadius: number
  transferPoints: TransferPoint[]
}

/**
 * Renders a single gravity well with its center, rings, sectors, and transfer indicators
 */
export function GravityWell({
  well,
  wellColor,
  wellRadius,
  transferPoints,
}: GravityWellProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()

  const position = getGravityWellPosition(well.id)

  return (
    <g key={well.id}>
      {/* Gravity well center */}
      <circle cx={position.x} cy={position.y} r={wellRadius} fill={wellColor} opacity={0.9} />
      <circle
        cx={position.x}
        cy={position.y}
        r={wellRadius + 5}
        fill="none"
        stroke={wellColor}
        strokeWidth={2}
        opacity={0.6}
      />

      {/* Rings */}
      {well.rings.map(config => {
        const radius = config.radius * scaleFactor

        return (
          <g key={`${well.id}-ring-${config.ring}`}>
            {/* Ring circle */}
            <circle
              cx={position.x}
              cy={position.y}
              r={radius}
              fill="none"
              stroke="#666"
              strokeWidth={1.5}
            />

            {/* Ring label */}
            <text
              x={position.x}
              y={position.y - radius - 8}
              textAnchor="middle"
              fontSize={12}
              fill="#999"
              fontWeight="bold"
            >
              R{config.ring} (v{config.velocity})
            </text>

            {/* Sector tick marks on the ring */}
            {Array.from({ length: config.sectors }).map((_, i) => {
              // Check if this sector is a transfer point
              // Transfer points are on the outermost ring (Ring 4 for blackhole, Ring 3 for planets)
              const outermostRing = well.rings[well.rings.length - 1]
              const isTransferSector =
                config.ring === outermostRing.ring &&
                transferPoints.some(
                  tp =>
                    (tp.fromWellId === well.id && tp.fromSector === i) ||
                    (tp.toWellId === well.id && tp.toSector === i)
                )

              // Get rotation offset for this well (planets rotate to point sector 0 at black hole)
              const rotationOffset = getSectorRotationOffset(well.id)
              // Calculate angle (all wells rotate clockwise, direction = 1)
              const angle = (i / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

              // Draw short tick marks on the inner edge of the ring
              const tickLength = i === 0 ? 12 : 8 // Longer tick for sector 0
              const x1 = position.x + (radius - tickLength) * Math.cos(angle)
              const y1 = position.y + (radius - tickLength) * Math.sin(angle)
              const x2 = position.x + radius * Math.cos(angle)
              const y2 = position.y + radius * Math.sin(angle)

              // Sector number position - in the MIDDLE of the sector (between tick marks)
              // Add 0.5 to position between sector boundaries, plus rotation offset
              const sectorCenterAngle =
                ((i + 0.5) / config.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                rotationOffset
              const sectorLabelRadius = radius - 25
              const sectorLabelX = position.x + sectorLabelRadius * Math.cos(sectorCenterAngle)
              const sectorLabelY = position.y + sectorLabelRadius * Math.sin(sectorCenterAngle)

              // Calculate sector arc boundaries for highlighting
              const sectorStartAngle =
                (i / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
              const sectorEndAngle =
                ((i + 1) / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

              // Get transfer sector color (null if not a transfer sector)
              const transferColor = isTransferSector
                ? getTransferSectorColor(well.id, i, transferPoints)
                : null

              return (
                <g key={i}>
                  {/* Highlight transfer sectors with a colored arc along the ring */}
                  {isTransferSector && transferColor && (
                    <path
                      d={`
                          M ${position.x + radius * Math.cos(sectorStartAngle)} ${position.y + radius * Math.sin(sectorStartAngle)}
                          A ${radius} ${radius} 0 0 1 ${position.x + radius * Math.cos(sectorEndAngle)} ${position.y + radius * Math.sin(sectorEndAngle)}
                        `}
                      fill="none"
                      stroke={transferColor}
                      strokeWidth={6}
                      opacity={0.7}
                    />
                  )}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={i === 0 ? '#666' : '#888'}
                    strokeWidth={i === 0 ? 2 : 1}
                  />
                  {/* Show sector number for all sectors (logical sector number) */}
                  <text
                    x={sectorLabelX}
                    y={sectorLabelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={7}
                    fill={transferColor || '#666'}
                    opacity={isTransferSector ? 1 : 0.6}
                    fontWeight={isTransferSector ? 'bold' : 'normal'}
                  >
                    {i}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}
