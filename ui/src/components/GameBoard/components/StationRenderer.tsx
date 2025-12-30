import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import { GRAVITY_WELLS } from '@dangerous-inclinations/engine'
import { getRingRadius, getGravityWellVisual } from '@/constants/visualConfig'

/**
 * Renders orbital stations around planets
 * Stations are shown as small diamond shapes on Ring 1 of each planet
 */
export function StationRenderer() {
  const { gameState } = useGame()
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()

  if (!gameState.stations || gameState.stations.length === 0) {
    return null
  }

  return (
    <g className="stations">
      {gameState.stations.map(station => {
        const well = GRAVITY_WELLS.find(w => w.id === station.planetId)
        if (!well) return null

        const ringConfig = well.rings.find(r => r.ring === station.ring)
        if (!ringConfig) return null

        const wellPos = getGravityWellPosition(station.planetId)
        const rotationOffset = getSectorRotationOffset(station.planetId)
        const radius = (getRingRadius(station.planetId, station.ring) ?? 100) * scaleFactor

        // Position at the center of the sector (same as ships)
        const angle =
          ((station.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

        const x = wellPos.x + radius * Math.cos(angle)
        const y = wellPos.y + radius * Math.sin(angle)

        // Get planet color for the station
        const wellVisual = getGravityWellVisual(station.planetId)
        const stationColor = wellVisual?.color || '#FFD700'

        // Station size
        const size = 12

        return (
          <g key={station.id}>
            {/* Station diamond shape */}
            <polygon
              points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
              fill={stationColor}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              opacity={0.9}
            />
            {/* Inner accent */}
            <polygon
              points={`${x},${y - size * 0.5} ${x + size * 0.5},${y} ${x},${y + size * 0.5} ${x - size * 0.5},${y}`}
              fill="#FFFFFF"
              opacity={0.3}
            />
            {/* Station label */}
            <text
              x={x}
              y={y + size + 12}
              textAnchor="middle"
              fontSize={8}
              fill="#FFFFFF"
              fontWeight="bold"
              opacity={0.8}
            >
              Station
            </text>
          </g>
        )
      })}
    </g>
  )
}
