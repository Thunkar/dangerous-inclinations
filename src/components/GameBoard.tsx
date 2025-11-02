import { Box } from '@mui/material'
import { RING_CONFIGS } from '../constants/rings'
import type { Player } from '../types/game'

interface GameBoardProps {
  players: Player[]
  activePlayerIndex: number
}

export function GameBoard({ players, activePlayerIndex }: GameBoardProps) {
  const boardSize = 900
  const centerX = boardSize / 2
  const centerY = boardSize / 2

  return (
    <Box
      sx={{
        width: boardSize,
        height: boardSize,
        position: 'relative',
        margin: '0 auto',
      }}
    >
      <svg width={boardSize} height={boardSize}>
        {/* Black hole center */}
        <circle cx={centerX} cy={centerY} r={20} fill="#000" />
        <circle cx={centerX} cy={centerY} r={25} fill="none" stroke="#333" strokeWidth={2} />

        {/* Rings */}
        {RING_CONFIGS.map(config => {
          const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[7].radius
          const radius = config.radius * scaleFactor

          return (
            <g key={config.ring}>
              {/* Ring circle */}
              <circle
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="#666"
                strokeWidth={1.5}
              />

              {/* Ring label */}
              <text
                x={centerX}
                y={centerY - radius - 8}
                textAnchor="middle"
                fontSize={12}
                fill="#999"
                fontWeight="bold"
              >
                R{config.ring} (v{config.velocity})
              </text>

              {/* Sector tick marks on the ring */}
              {Array.from({ length: config.sectors }).map((_, i) => {
                // Start angle at top (12 o'clock) and go clockwise
                const angle = (i / config.sectors) * 2 * Math.PI - Math.PI / 2

                // Draw short tick marks on the inner edge of the ring
                const tickLength = i === 0 ? 12 : 8 // Longer tick for sector 0
                const x1 = centerX + (radius - tickLength) * Math.cos(angle)
                const y1 = centerY + (radius - tickLength) * Math.sin(angle)
                const x2 = centerX + radius * Math.cos(angle)
                const y2 = centerY + radius * Math.sin(angle)

                return (
                  <g key={i}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={i === 0 ? '#666' : '#888'}
                      strokeWidth={i === 0 ? 2 : 1}
                    />
                    {/* Show sector number for sector 0 and every 10th sector */}
                    {(i === 0 || (i % 10 === 0 && config.sectors > 30)) && (
                      <text
                        x={centerX + (radius - 18) * Math.cos(angle)}
                        y={centerY + (radius - 18) * Math.sin(angle)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={8}
                        fill="#999"
                      >
                        {i}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Ships */}
        {players.map((player, index) => {
          const ringConfig = RING_CONFIGS.find(r => r.ring === player.ship.ring)
          if (!ringConfig) return null

          const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[7].radius
          const radius = ringConfig.radius * scaleFactor
          // Position ship in the MIDDLE of the sector
          // Add 0.5 to center it between sector boundaries
          const angle =
            ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2
          const x = centerX + radius * Math.cos(angle)
          const y = centerY + radius * Math.sin(angle)

          const isActive = index === activePlayerIndex
          const shipSize = isActive ? 14 : 12

          // Direction indicator - tangent to the orbit (perpendicular to radius)
          // Prograde = clockwise (add 90°), Retrograde = counter-clockwise (subtract 90°)
          const directionAngle =
            player.ship.facing === 'prograde'
              ? angle + Math.PI / 2 // 90° clockwise from radial
              : angle - Math.PI / 2 // 90° counter-clockwise from radial
          const arrowX = x + 18 * Math.cos(directionAngle)
          const arrowY = y + 18 * Math.sin(directionAngle)

          return (
            <g key={player.id}>
              {/* Transfer state indicator */}
              {player.ship.transferState && (
                <circle
                  cx={x}
                  cy={y}
                  r={30}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={3}
                  strokeDasharray="8 8"
                  opacity={0.6}
                />
              )}

              {/* Ship token */}
              <circle
                cx={x}
                cy={y}
                r={shipSize}
                fill={player.color}
                stroke={isActive ? '#fff' : '#000'}
                strokeWidth={isActive ? 3 : 2}
                opacity={player.ship.transferState ? 0.6 : 1}
              />

              {/* Direction arrow - outline */}
              <line
                x1={x}
                y1={y}
                x2={arrowX}
                y2={arrowY}
                stroke="#000"
                strokeWidth={3}
                markerEnd={`url(#arrowhead-outline-${player.id})`}
              />

              {/* Direction arrow - main */}
              <line
                x1={x}
                y1={y}
                x2={arrowX}
                y2={arrowY}
                stroke={player.color}
                strokeWidth={2}
                markerEnd={`url(#arrowhead-${player.id})`}
              />
            </g>
          )
        })}

        {/* Arrow marker definitions */}
        <defs>
          {players.map(player => (
            <>
              {/* Outline arrowhead */}
              <marker
                key={`${player.id}-outline`}
                id={`arrowhead-outline-${player.id}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#000" />
              </marker>
              {/* Main arrowhead */}
              <marker
                key={player.id}
                id={`arrowhead-${player.id}`}
                markerWidth="7"
                markerHeight="7"
                refX="5.5"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 7 3.5, 0 7" fill={player.color} />
              </marker>
            </>
          ))}
        </defs>
      </svg>
    </Box>
  )
}
