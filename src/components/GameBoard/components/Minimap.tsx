import { Box } from '@mui/material'
import type { Player, Facing } from '../../../types/game'
import { MINIMAP_CONFIG } from '../utils'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'

interface MinimapProps {
  players: Player[]
  activePlayerIndex: number
  pendingFacing?: Facing
  zoom: number
  pan: { x: number; y: number }
}

/**
 * Minimap showing overview of the game board with ships and viewport indicator
 */
export function Minimap({
  players,
  activePlayerIndex,
  pendingFacing,
  zoom,
  pan,
}: MinimapProps) {
  const { gameState } = useGame()
  const { boardSize, centerX, centerY, scaleFactor, getGravityWellPosition, getSectorRotationOffset, getVisualSector } =
    useBoardContext()

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
        {gameState.gravityWells.map(well => {
          const wellPosition = getGravityWellPosition(well.id)

          return (
            <g key={`minimap-${well.id}`}>
              {/* Gravity well center */}
              <circle
                cx={wellPosition.x}
                cy={wellPosition.y}
                r={well.radius / 2}
                fill={well.color}
                opacity={0.7}
              />
              {/* Rings */}
              {well.rings.map(config => {
                const radius = config.radius * scaleFactor
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
          const minimapWell = gameState.gravityWells.find(w => w.id === player.ship.wellId)
          if (!minimapWell) return null

          const ringConfig = minimapWell.rings.find(r => r.ring === player.ship.ring)
          if (!ringConfig) return null

          // Get gravity well position for this ship
          const wellPosition = getGravityWellPosition(player.ship.wellId)

          const radius = ringConfig.radius * scaleFactor
          const minimapVisualSector = getVisualSector(
            player.ship.wellId,
            player.ship.sector,
            ringConfig.sectors
          )
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

        {/* Viewport indicator */}
        <rect
          x={centerX - boardSize / 2 / zoom - pan.x / zoom}
          y={centerY - boardSize / 2 / zoom - pan.y / zoom}
          width={boardSize / zoom}
          height={boardSize / zoom}
          fill="none"
          stroke="#fff"
          strokeWidth={3}
          opacity={0.5}
        />
      </svg>
    </Box>
  )
}
