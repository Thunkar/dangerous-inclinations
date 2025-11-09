import { Box, IconButton, Tooltip } from '@mui/material'
import { useState, useRef } from 'react'
import { RING_CONFIGS, mapSectorOnTransfer, BURN_COSTS } from '../constants/rings'
import { WEAPONS, calculateWeaponRange } from '../constants/weapons'
import type { Player } from '../types/game'

interface GameBoardProps {
  players: Player[]
  activePlayerIndex: number
}

export function GameBoard({ players, activePlayerIndex }: GameBoardProps) {
  const boardSize = 900
  const centerX = boardSize / 2
  const centerY = boardSize / 2

  // Pan and zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.5, Math.min(3, zoom * delta))
    setZoom(newZoom)
  }

  // Handle mouse pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // Reset view
  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'grab',
      }}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main SVG with pan/zoom */}
      <svg
        width={boardSize}
        height={boardSize}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: isPanning ? 'none' : 'transform 0.1s',
        }}
      >
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
                const destScaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
                const destRadius = destRingConfig.radius * destScaleFactor
                const destAngle =
                  ((mappedSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI - Math.PI / 2
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
              const destScaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
              const destRadius = destRingConfig.radius * destScaleFactor
              const destAngle =
                ((mappedSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI - Math.PI / 2
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

              {/* Weapon range indicator - only for active player */}
              {isActive && (
                <>
                  {/* Show broadside laser visibility rays */}
                  {(() => {
                    // Calculate attacker's sector angular boundaries
                    const sectorSize = (2 * Math.PI) / ringConfig.sectors
                    const sectorStartAngle = angle - sectorSize / 2
                    const sectorEndAngle = angle + sectorSize / 2

                    // Get rings within weapon range (±1 ring only)
                    const laser = WEAPONS.laser
                    const minRing = Math.max(1, player.ship.ring - laser.ringRange)
                    const maxRing = Math.min(RING_CONFIGS.length, player.ship.ring + laser.ringRange)

                    const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius

                    // Get the actual ship position for ray origin
                    const shipRadius = ringConfig.radius * scaleFactor

                    // Calculate sector boundary points on the ship's ring
                    const rayStartX = centerX + shipRadius * Math.cos(sectorStartAngle)
                    const rayStartY = centerY + shipRadius * Math.sin(sectorStartAngle)
                    const rayEndX = centerX + shipRadius * Math.cos(sectorEndAngle)
                    const rayEndY = centerY + shipRadius * Math.sin(sectorEndAngle)

                    return (
                      <g key="weapon-visibility-rays">
                        {/* Draw rays from sector endpoints outward to target rings */}
                        {RING_CONFIGS.filter(r => r.ring >= minRing && r.ring <= maxRing && r.ring !== player.ship.ring).map(targetRing => {
                          const targetRadius = targetRing.radius * scaleFactor
                          const targetSectorSize = (2 * Math.PI) / targetRing.sectors

                          // Find which sectors on target ring overlap with attacker's angular range
                          // We need to find the FIRST and LAST sector boundaries that contain the attacker's range

                          // Normalize angles to 0-2π
                          const normalizeAngle = (a: number) => {
                            let normalized = a % (2 * Math.PI)
                            if (normalized < 0) normalized += 2 * Math.PI
                            return normalized
                          }

                          const attackerStart = normalizeAngle(sectorStartAngle + Math.PI / 2)
                          const attackerEnd = normalizeAngle(sectorEndAngle + Math.PI / 2)

                          // Find first sector that overlaps - this is the sector containing the start angle
                          const firstSectorIndex = Math.floor(attackerStart / targetSectorSize)

                          // Find last sector that overlaps - this is the sector containing the end angle
                          // Use a small epsilon to handle floating point precision issues
                          const epsilon = 1e-10
                          const endSectorRaw = attackerEnd / targetSectorSize
                          const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)

                          // If we're very close to a sector boundary (within epsilon), don't include the next sector
                          const lastSectorIndex = fractionalPart < epsilon
                            ? Math.floor(endSectorRaw) - 1  // On or very close to boundary - use previous sector
                            : Math.floor(endSectorRaw)      // Inside a sector - use that sector

                          // Calculate the actual sector boundary angles on target ring
                          const coverageStartAngle = firstSectorIndex * targetSectorSize - Math.PI / 2
                          const coverageEndAngle = (lastSectorIndex + 1) * targetSectorSize - Math.PI / 2

                          // Calculate positions on target ring at these sector boundaries
                          const targetStartX = centerX + targetRadius * Math.cos(coverageStartAngle)
                          const targetStartY = centerY + targetRadius * Math.sin(coverageStartAngle)
                          const targetEndX = centerX + targetRadius * Math.cos(coverageEndAngle)
                          const targetEndY = centerY + targetRadius * Math.sin(coverageEndAngle)

                          // Calculate arc length for proper SVG rendering
                          let arcAngle = coverageEndAngle - coverageStartAngle
                          if (arcAngle < 0) arcAngle += 2 * Math.PI

                          return (
                            <g key={`rays-${targetRing.ring}`}>
                              {/* Ray from start of sector to first overlapping sector boundary */}
                              <line
                                x1={rayStartX}
                                y1={rayStartY}
                                x2={targetStartX}
                                y2={targetStartY}
                                stroke={player.color}
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                opacity={0.5}
                              />
                              {/* Ray from end of sector to last overlapping sector boundary */}
                              <line
                                x1={rayEndX}
                                y1={rayEndY}
                                x2={targetEndX}
                                y2={targetEndY}
                                stroke={player.color}
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                opacity={0.5}
                              />
                              {/* Highlight arc covering ALL overlapping sectors */}
                              <path
                                d={`
                                  M ${targetStartX} ${targetStartY}
                                  A ${targetRadius} ${targetRadius} 0 ${arcAngle > Math.PI ? 1 : 0} 1 ${targetEndX} ${targetEndY}
                                `}
                                fill="none"
                                stroke={player.color}
                                strokeWidth={3}
                                opacity={0.4}
                              />
                            </g>
                          )
                        })}
                        {/* Highlight your own sector boundaries */}
                        <circle
                          cx={rayStartX}
                          cy={rayStartY}
                          r={4}
                          fill={player.color}
                          opacity={0.8}
                        />
                        <circle
                          cx={rayEndX}
                          cy={rayEndY}
                          r={4}
                          fill={player.color}
                          opacity={0.8}
                        />
                      </g>
                    )
                  })()}

                  {/* Show targeting indicators for other players */}
                  {players.map((otherPlayer, otherIndex) => {
                    if (otherIndex === index) return null // Skip self

                    const otherRingConfig = RING_CONFIGS.find(r => r.ring === otherPlayer.ship.ring)
                    if (!otherRingConfig) return null

                    // Calculate if this target is in range
                    const targetingInfo = calculateWeaponRange(
                      player.ship.ring,
                      player.ship.sector,
                      ringConfig.sectors,
                      player.ship.facing,
                      otherPlayer.ship.ring,
                      otherPlayer.ship.sector,
                      otherRingConfig.sectors,
                      WEAPONS.laser
                    )

                    if (!targetingInfo.inRange) return null

                    // Draw targeting reticle
                    const otherScaleFactor =
                      (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
                    const otherRadius = otherRingConfig.radius * otherScaleFactor
                    const otherAngle =
                      ((otherPlayer.ship.sector + 0.5) / otherRingConfig.sectors) * 2 * Math.PI -
                      Math.PI / 2
                    const otherX = centerX + otherRadius * Math.cos(otherAngle)
                    const otherY = centerY + otherRadius * Math.sin(otherAngle)

                    return (
                      <g key={`targeting-${otherPlayer.id}`}>
                        {/* Targeting reticle */}
                        <circle
                          cx={otherX}
                          cy={otherY}
                          r={16}
                          fill="none"
                          stroke={player.color}
                          strokeWidth={2}
                          opacity={0.7}
                        />
                        <line
                          x1={otherX - 20}
                          y1={otherY}
                          x2={otherX - 10}
                          y2={otherY}
                          stroke={player.color}
                          strokeWidth={2}
                          opacity={0.7}
                        />
                        <line
                          x1={otherX + 20}
                          y1={otherY}
                          x2={otherX + 10}
                          y2={otherY}
                          stroke={player.color}
                          strokeWidth={2}
                          opacity={0.7}
                        />
                        <line
                          x1={otherX}
                          y1={otherY - 20}
                          x2={otherX}
                          y2={otherY - 10}
                          stroke={player.color}
                          strokeWidth={2}
                          opacity={0.7}
                        />
                        <line
                          x1={otherX}
                          y1={otherY + 20}
                          x2={otherX}
                          y2={otherY + 10}
                          stroke={player.color}
                          strokeWidth={2}
                          opacity={0.7}
                        />
                        {/* Range indicator text */}
                        <text
                          x={otherX}
                          y={otherY - 24}
                          textAnchor="middle"
                          fontSize={9}
                          fill={player.color}
                          fontWeight="bold"
                        >
                          {Math.round(targetingInfo.angularDistance)}°
                        </text>
                      </g>
                    )
                  })}
                </>
              )}
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

      {/* Minimap */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          width: 150,
          height: 150,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          border: '2px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <svg width={150} height={150} viewBox={`0 0 ${boardSize} ${boardSize}`}>
          {/* Rings */}
          {RING_CONFIGS.map(config => {
            const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
            const radius = config.radius * scaleFactor
            return (
              <circle
                key={config.ring}
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="#666"
                strokeWidth={2}
              />
            )
          })}

          {/* Ships on minimap */}
          {players.map(player => {
            const ringConfig = RING_CONFIGS.find(r => r.ring === player.ship.ring)
            if (!ringConfig) return null

            const scaleFactor = (boardSize / 2 - 40) / RING_CONFIGS[RING_CONFIGS.length - 1].radius
            const radius = ringConfig.radius * scaleFactor
            const angle =
              ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2
            const x = centerX + radius * Math.cos(angle)
            const y = centerY + radius * Math.sin(angle)

            return (
              <circle
                key={player.id}
                cx={x}
                cy={y}
                r={8}
                fill={player.color}
                opacity={0.8}
              />
            )
          })}

          {/* Viewport indicator */}
          <rect
            x={centerX - (boardSize / 2) / zoom - pan.x / zoom}
            y={centerY - (boardSize / 2) / zoom - pan.y / zoom}
            width={boardSize / zoom}
            height={boardSize / zoom}
            fill="none"
            stroke="#fff"
            strokeWidth={3}
            opacity={0.5}
          />
        </svg>
      </Box>

      {/* Controls */}
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Tooltip title="Reset View" placement="left">
          <IconButton
            onClick={resetView}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            ⟲
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom In" placement="left">
          <IconButton
            onClick={() => setZoom(Math.min(3, zoom * 1.2))}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            +
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <IconButton
            onClick={() => setZoom(Math.max(0.5, zoom / 1.2))}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            −
          </IconButton>
        </Tooltip>
      </Box>

      {/* Zoom indicator */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          px: 2,
          py: 1,
          borderRadius: 1,
          fontSize: '0.875rem',
        }}
      >
        Zoom: {(zoom * 100).toFixed(0)}%
      </Box>
    </Box>
  )
}
