import { Box } from '@mui/material'
import type { Facing } from '@dangerous-inclinations/engine'
import { MINIMAP_CONFIG } from '../utils'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import { GRAVITY_WELLS, getGravityWell } from '@dangerous-inclinations/engine'
import { getGravityWellVisual, getRingRadius } from '@/constants/visualConfig'

interface MinimapProps {
  pendingFacing?: Facing
  zoom: number
  pan: { x: number; y: number }
}

/**
 * Minimap showing overview of the game board with ships and viewport indicator
 */
export function Minimap({ pendingFacing, zoom, pan }: MinimapProps) {
  const { gameState } = useGame()
  const { boardSize, scaleFactor, getGravityWellPosition, getSectorRotationOffset } =
    useBoardContext()

  // Get players and activePlayerIndex from gameState
  const players = gameState.players
  const activePlayerIndex = gameState.activePlayerIndex

  const minimapSize = MINIMAP_CONFIG.SIZE

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: MINIMAP_CONFIG.MARGIN,
        right: MINIMAP_CONFIG.MARGIN,
        width: minimapSize,
        height: minimapSize,
        bgcolor: 'rgba(0, 0, 0, 0.7)',
        border: '2px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <svg width={minimapSize} height={minimapSize} viewBox={`0 0 ${boardSize} ${boardSize}`}>
        {/* Render all gravity wells on minimap */}
        {GRAVITY_WELLS.map(well => {
          const wellPosition = getGravityWellPosition(well.id)
          const wellVisual = getGravityWellVisual(well.id)

          return (
            <g key={`minimap-${well.id}`}>
              {/* Gravity well center */}
              <circle
                cx={wellPosition.x}
                cy={wellPosition.y}
                r={(wellVisual?.radius ?? 40) / 2}
                fill={wellVisual?.color ?? '#666'}
                opacity={0.7}
              />
              {/* Rings */}
              {well.rings.map(config => {
                const radius = (getRingRadius(well.id, config.ring) ?? 100) * scaleFactor
                return (
                  <circle
                    key={`minimap-${well.id}-ring-${config.ring}`}
                    cx={wellPosition.x}
                    cy={wellPosition.y}
                    r={radius}
                    fill="none"
                    stroke="#666"
                    strokeWidth={2}
                  />
                )
              })}
            </g>
          )
        })}

        {/* Ships on minimap */}
        {players.map((player, index) => {
          const minimapWell = getGravityWell(player.ship.wellId)
          if (!minimapWell) return null

          const ringConfig = minimapWell.rings.find(r => r.ring === player.ship.ring)
          if (!ringConfig) return null

          // Get gravity well position for this ship
          const wellPosition = getGravityWellPosition(player.ship.wellId)

          const radius = (getRingRadius(player.ship.wellId, ringConfig.ring) ?? 100) * scaleFactor
          // Visual sector same as logical sector
          const minimapVisualSector = player.ship.sector
          const rotationOffset = getSectorRotationOffset(player.ship.wellId)
          const angle =
            ((minimapVisualSector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset
          const x = wellPosition.x + radius * Math.cos(angle)
          const y = wellPosition.y + radius * Math.sin(angle)
          const minimapShipSize = 6

          // Use pending facing if available, otherwise use committed facing
          const effectiveFacing =
            index === activePlayerIndex && pendingFacing ? pendingFacing : player.ship.facing
          const directionAngle =
            effectiveFacing === 'prograde' ? angle + Math.PI / 2 : angle - Math.PI / 2

          return (
            <image
              key={player.id}
              href="/assets/ship.png"
              x={-minimapShipSize}
              y={-minimapShipSize}
              width={minimapShipSize * 2}
              height={minimapShipSize * 2}
              opacity={0.8}
              style={{ filter: `drop-shadow(0 0 2px ${player.color})` }}
              transform={`translate(${x}, ${y}) rotate(${(directionAngle * 180) / Math.PI})`}
            />
          )
        })}

        {/* Viewport indicator - matches the viewBox calculation in GameBoard */}
        {(() => {
          const viewBoxSize = boardSize / zoom
          const viewBoxX = (boardSize - viewBoxSize) / 2 + pan.x
          const viewBoxY = (boardSize - viewBoxSize) / 2 + pan.y
          return (
            <rect
              x={viewBoxX}
              y={viewBoxY}
              width={viewBoxSize}
              height={viewBoxSize}
              fill="none"
              stroke="#fff"
              strokeWidth={3}
              opacity={0.5}
            />
          )
        })()}
      </svg>
    </Box>
  )
}
