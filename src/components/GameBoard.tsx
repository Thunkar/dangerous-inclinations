import { Box } from '@mui/material'
import { RING_CONFIGS, mapSectorOnTransfer, BURN_COSTS } from '../constants/rings'
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
          const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
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

                // Sector number position - in the MIDDLE of the sector (between tick marks)
                // Add 0.5 to position between sector boundaries
                const sectorCenterAngle = ((i + 0.5) / config.sectors) * 2 * Math.PI - Math.PI / 2
                const sectorLabelRadius = radius - 25
                const sectorLabelX = centerX + sectorLabelRadius * Math.cos(sectorCenterAngle)
                const sectorLabelY = centerY + sectorLabelRadius * Math.sin(sectorCenterAngle)

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
                    {/* Show sector number for all sectors */}
                    <text
                      x={sectorLabelX}
                      y={sectorLabelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={7}
                      fill="#666"
                      opacity={0.6}
                    >
                      {i}
                    </text>
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

          const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
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

          // Calculate predicted next position (and second step for transfers)
          let predictedX = null
          let predictedY = null
          let predictedRing = null
          let secondStepX = null
          let secondStepY = null
          let secondStepRing = null

          // For active player with pending action, show where action will take them
          const isActivePlayer = index === activePlayerIndex
          const pendingAction = isActivePlayer ? player.pendingAction : null

          if (player.ship.transferState) {
            // Ship is in transfer - show where it will arrive
            if (player.ship.transferState.arriveNextTurn) {
              // Will arrive at destination ring next turn
              const destRingConfig = RING_CONFIGS.find(
                r => r.ring === player.ship.transferState!.destinationRing
              )
              if (destRingConfig) {
                // Calculate position on destination ring using sector mapping
                const mappedSector = mapSectorOnTransfer(
                  player.ship.ring,
                  player.ship.transferState.destinationRing,
                  player.ship.sector
                )
                // After transfer completes, ship gains momentum from destination ring (slingshot)
                const finalSector = (mappedSector + destRingConfig.velocity) % destRingConfig.sectors
                const destScaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
                const destRadius = destRingConfig.radius * destScaleFactor
                const destAngle =
                  ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI - Math.PI / 2
                predictedX = centerX + destRadius * Math.cos(destAngle)
                predictedY = centerY + destRadius * Math.sin(destAngle)
                predictedRing = destRingConfig.ring
              }
            }
            // If arriveNextTurn is false, ship stays in current position (still transferring)
          } else if (
            pendingAction?.type === 'burn' &&
            pendingAction.burnIntensity &&
            pendingAction.burnDirection
          ) {
            // Active player with pending burn - show TWO-STEP prediction
            // Step 1: After THIS turn - ship moves by current velocity, enters transfer state
            // Step 2: After NEXT turn - transfer completes, ship arrives at destination ring

            // Step 1: ship stays on current ring, moves by current velocity
            const nextSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
            const predictedAngle =
              ((nextSector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2
            predictedX = centerX + radius * Math.cos(predictedAngle)
            predictedY = centerY + radius * Math.sin(predictedAngle)
            predictedRing = player.ship.ring

            // Step 2: calculate where transfer will take the ship
            const burnCost = BURN_COSTS[pendingAction.burnIntensity]
            const direction = pendingAction.burnDirection === 'prograde' ? 1 : -1
            const destinationRing = Math.max(
              1,
              Math.min(6, player.ship.ring + direction * burnCost.rings)
            )
            const destRingConfig = RING_CONFIGS.find(r => r.ring === destinationRing)

            if (destRingConfig) {
              // Map from the position after step 1 to the destination ring
              const mappedSector = mapSectorOnTransfer(
                player.ship.ring,
                destinationRing,
                nextSector
              )
              // After arriving, ship gains momentum from destination ring (slingshot)
              const finalSector = (mappedSector + destRingConfig.velocity) % destRingConfig.sectors
              const destScaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
              const destRadius = destRingConfig.radius * destScaleFactor
              const destAngle =
                ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI - Math.PI / 2
              secondStepX = centerX + destRadius * Math.cos(destAngle)
              secondStepY = centerY + destRadius * Math.sin(destAngle)
              secondStepRing = destinationRing
            }
          } else {
            // Ship is stable (or coasting) - show where it will move due to orbital velocity
            const nextSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
            const predictedAngle =
              ((nextSector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2
            predictedX = centerX + radius * Math.cos(predictedAngle)
            predictedY = centerY + radius * Math.sin(predictedAngle)
            predictedRing = player.ship.ring
          }

          return (
            <g key={player.id}>
              {/* Predicted position indicator (Step 1) */}
              {predictedX !== null && predictedY !== null && (
                <>
                  {/* Connecting line from current to predicted position */}
                  <line
                    x1={x}
                    y1={y}
                    x2={predictedX}
                    y2={predictedY}
                    stroke={player.color}
                    strokeWidth={player.ship.transferState ? 2 : 1}
                    strokeDasharray="4 4"
                    opacity={player.ship.transferState ? 0.6 : 0.4}
                  />
                  {/* Predicted position circle */}
                  <circle
                    cx={predictedX}
                    cy={predictedY}
                    r={8}
                    fill={player.color}
                    opacity={0.3}
                    stroke={player.color}
                    strokeWidth={player.ship.transferState ? 2 : 1}
                  />
                  {/* Label for transfers showing destination ring */}
                  {player.ship.transferState && player.ship.transferState.arriveNextTurn && (
                    <text
                      x={predictedX}
                      y={predictedY - 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill={player.color}
                      fontWeight="bold"
                    >
                      R{predictedRing}
                    </text>
                  )}
                </>
              )}

              {/* Second step prediction (for pending burns) */}
              {secondStepX !== null && secondStepY !== null && (
                <>
                  {/* Connecting line from step 1 to step 2 */}
                  <line
                    x1={predictedX!}
                    y1={predictedY!}
                    x2={secondStepX}
                    y2={secondStepY}
                    stroke={player.color}
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    opacity={0.5}
                  />
                  {/* Second step position circle */}
                  <circle
                    cx={secondStepX}
                    cy={secondStepY}
                    r={10}
                    fill={player.color}
                    opacity={0.2}
                    stroke={player.color}
                    strokeWidth={2}
                  />
                  {/* Label showing final destination ring */}
                  <text
                    x={secondStepX}
                    y={secondStepY - 14}
                    textAnchor="middle"
                    fontSize={11}
                    fill={player.color}
                    fontWeight="bold"
                  >
                    R{secondStepRing}
                  </text>
                </>
              )}

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
