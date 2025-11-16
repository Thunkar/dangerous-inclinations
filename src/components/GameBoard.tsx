import { Box, IconButton, Tooltip } from '@mui/material'
import { useState, useRef } from 'react'
import { RING_CONFIGS, mapSectorOnTransfer, BURN_COSTS } from '../constants/rings'
import { calculateFiringSolutions } from '../utils/weaponRange'
import { getSubsystem } from '../utils/subsystemHelpers'
import { getSubsystemConfig } from '../types/subsystems'
import { useGame } from '../context/GameContext'
import { calculatePostMovementPosition } from '../utils/tacticalSequence'
import type { Player, Facing, BurnIntensity } from '../types/game'
import type { SubsystemType } from '../types/subsystems'

interface MovementPreview {
  actionType: 'coast' | 'burn'
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  activateScoop: boolean
}

interface GameBoardProps {
  players: Player[]
  activePlayerIndex: number
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
}

export function GameBoard({
  players,
  activePlayerIndex,
  pendingFacing,
  pendingMovement,
}: GameBoardProps) {
  const { weaponRangeVisibility, pendingState, gameState } = useGame()
  // Calculate board size to fit all gravity wells
  // Planets are at distance 518 from black hole center (Ring 5s barely overlap - 2 unit overlap)
  // Planet Ring 5 extends outward by 260, so total extent: 518 + 260 = 778 from center
  // Add 20% padding: 778 * 1.2 = 933.6, so 934 * 2 = 1868 for full view
  const boardSize = 1868
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
    if (e.button === 0) {
      // Left click
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

  // Helper: Calculate the center position of a gravity well
  const getGravityWellPosition = (wellId: string) => {
    const well = gameState.gravityWells.find(w => w.id === wellId)
    if (!well) return { x: centerX, y: centerY }

    // Black hole is always at center
    if (well.type === 'blackhole') {
      return { x: centerX, y: centerY }
    }

    // Planets are positioned at their orbital position relative to black hole
    if (well.orbitalPosition) {
      const angleRad = (well.orbitalPosition.angle * Math.PI) / 180
      // Apply scale factor to distance
      const scaledDistance = well.orbitalPosition.distance * scaleFactor
      const x = centerX + scaledDistance * Math.cos(angleRad - Math.PI / 2)
      const y = centerY + scaledDistance * Math.sin(angleRad - Math.PI / 2)
      return { x, y }
    }

    return { x: centerX, y: centerY }
  }

  // Helper: Get rotation offset for a gravity well's sectors
  // To create Venn diagram-style overlap with IDENTICAL ARCS:
  // - Align sector CENTERS (not boundaries) between overlapping wells
  // - Rotate black hole COUNTERCLOCKWISE by half a sector
  // - Rotate planets CLOCKWISE by half a sector
  const getSectorRotationOffset = (wellId: string) => {
    const well = gameState.gravityWells.find(w => w.id === wellId)
    if (!well) return 0

    if (well.type === 'blackhole') {
      // Rotate black hole COUNTERCLOCKWISE by half a sector
      const blackHoleSectors = well.rings[4]?.sectors || 96 // Ring 5
      return -(Math.PI / blackHoleSectors) // Negative = counterclockwise
    }

    // For planets: sector 0 points toward black hole (inward) + rotate CLOCKWISE by half sector
    if (well.orbitalPosition) {
      const planetSectors = well.rings[4]?.sectors || 96 // Ring 5
      const pointInward = ((well.orbitalPosition.angle + 180) * Math.PI) / 180
      const halfSector = Math.PI / planetSectors // Positive = clockwise
      return pointInward - halfSector
    }

    return 0
  }

  // Calculate scale factor to fit all wells
  // Maximum extent is from center to furthest point (planet distance + planet Ring 5)
  // 518 + 260 = 778
  const maxExtent = 778
  const padding = 100
  const scaleFactor = (boardSize / 2 - padding) / maxExtent

  // Helper: Render a single gravity well (center + rings)
  const renderGravityWell = (wellId: string, wellColor: string, wellRadius: number) => {
    const position = getGravityWellPosition(wellId)
    const well = gameState.gravityWells.find(w => w.id === wellId)
    if (!well) return null

    return (
      <g key={wellId}>
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
            <g key={`${wellId}-ring-${config.ring}`}>
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
                const isTransferSector =
                  config.ring === 5 &&
                  gameState.transferPoints.some(
                    tp =>
                      (tp.fromWellId === wellId && tp.fromSector === i) ||
                      (tp.toWellId === wellId && tp.toSector === i)
                  )

                // Get rotation offset for this well (planets rotate to point sector 0 at black hole)
                const rotationOffset = getSectorRotationOffset(wellId)
                // Start angle at top (12 o'clock) and go clockwise, plus rotation offset
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
                  ((i + 0.5) / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
                const sectorLabelRadius = radius - 25
                const sectorLabelX = position.x + sectorLabelRadius * Math.cos(sectorCenterAngle)
                const sectorLabelY = position.y + sectorLabelRadius * Math.sin(sectorCenterAngle)

                // Calculate sector arc boundaries for highlighting
                const sectorStartAngle =
                  (i / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
                const sectorEndAngle =
                  ((i + 1) / config.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

                return (
                  <g key={i}>
                    {/* Highlight transfer sectors with a golden arc along the ring */}
                    {isTransferSector && (
                      <path
                        d={`
                          M ${position.x + radius * Math.cos(sectorStartAngle)} ${position.y + radius * Math.sin(sectorStartAngle)}
                          A ${radius} ${radius} 0 0 1 ${position.x + radius * Math.cos(sectorEndAngle)} ${position.y + radius * Math.sin(sectorEndAngle)}
                        `}
                        fill="none"
                        stroke="#FFD700"
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
                    {/* Show sector number for all sectors */}
                    <text
                      x={sectorLabelX}
                      y={sectorLabelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={7}
                      fill={isTransferSector ? '#FFD700' : '#666'}
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

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        {/* SVG Filters for ship outlines */}
        <defs>
          {players.map(player => (
            <filter
              key={`outline-${player.id}`}
              id={`outline-${player.id}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              {/* Create colored outline (outer) */}
              <feMorphology operator="dilate" radius="4" in="SourceAlpha" result="thickenColor" />
              <feFlood floodColor={player.color} result="colorFlood" />
              <feComposite in="colorFlood" in2="thickenColor" operator="in" result="colorOutline" />

              {/* Create black outline (inner, frames the ship) */}
              <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="thickenBlack" />
              <feFlood floodColor="#000000" result="blackFlood" />
              <feComposite in="blackFlood" in2="thickenBlack" operator="in" result="blackOutline" />

              {/* Merge all layers: colored outline, black outline, then ship */}
              <feMerge>
                <feMergeNode in="colorOutline" />
                <feMergeNode in="blackOutline" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Render all gravity wells */}
        {gameState.gravityWells.map(well => renderGravityWell(well.id, well.color, well.radius))}

        {/* Draw Venn diagram-style overlapping regions for transfer sectors */}
        {gameState.transferPoints.map((tp, idx) => {
          // Only render each overlap once (skip reverse direction)
          if (tp.fromWellId > tp.toWellId) return null

          const fromWell = gameState.gravityWells.find(w => w.id === tp.fromWellId)
          const toWell = gameState.gravityWells.find(w => w.id === tp.toWellId)
          if (!fromWell || !toWell) return null

          const fromPosition = getGravityWellPosition(tp.fromWellId)
          const toPosition = getGravityWellPosition(tp.toWellId)

          // Get Ring 5 configs
          const fromRing5 = fromWell.rings.find(r => r.ring === 5)
          const toRing5 = toWell.rings.find(r => r.ring === 5)
          if (!fromRing5 || !toRing5) return null

          const fromRadius = fromRing5.radius * scaleFactor
          const toRadius = toRing5.radius * scaleFactor

          // Get rotation offsets (black hole rotated by half sector to align centers)
          const fromRotationOffset = getSectorRotationOffset(tp.fromWellId)
          const toRotationOffset = getSectorRotationOffset(tp.toWellId)

          // Calculate sector CENTER angles (use i + 0.5 to get center of sector)
          const fromSectorCenterAngle =
            ((tp.fromSector + 0.5) / fromRing5.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            fromRotationOffset
          const toSectorCenterAngle =
            ((tp.toSector + 0.5) / toRing5.sectors) * 2 * Math.PI - Math.PI / 2 + toRotationOffset

          // Calculate sector BOUNDARY angles (these should now be identical due to half-sector rotation)
          const sectorHalfWidth = Math.PI / fromRing5.sectors // Half of one sector's angular width
          const fromSectorStartAngle = fromSectorCenterAngle - sectorHalfWidth
          const fromSectorEndAngle = fromSectorCenterAngle + sectorHalfWidth
          const toSectorStartAngle = toSectorCenterAngle - sectorHalfWidth
          const toSectorEndAngle = toSectorCenterAngle + sectorHalfWidth

          // Calculate arc boundary points on black hole ring
          const fromStartX = fromPosition.x + fromRadius * Math.cos(fromSectorStartAngle)
          const fromStartY = fromPosition.y + fromRadius * Math.sin(fromSectorStartAngle)
          const fromEndX = fromPosition.x + fromRadius * Math.cos(fromSectorEndAngle)
          const fromEndY = fromPosition.y + fromRadius * Math.sin(fromSectorEndAngle)

          // Calculate arc boundary points on planet ring
          const toStartX = toPosition.x + toRadius * Math.cos(toSectorStartAngle)
          const toStartY = toPosition.y + toRadius * Math.sin(toSectorStartAngle)
          const toEndX = toPosition.x + toRadius * Math.cos(toSectorEndAngle)
          const toEndY = toPosition.y + toRadius * Math.sin(toSectorEndAngle)

          return (
            <g key={`transfer-overlap-${idx}`}>
              {/* Draw the lens-shaped overlap region using two circular arcs */}
              <path
                d={`
                  M ${fromStartX} ${fromStartY}
                  A ${fromRadius} ${fromRadius} 0 0 1 ${fromEndX} ${fromEndY}
                  L ${toEndX} ${toEndY}
                  A ${toRadius} ${toRadius} 0 0 0 ${toStartX} ${toStartY}
                  Z
                `}
                fill="#FFD700"
                opacity={0.25}
                stroke="#FFD700"
                strokeWidth={2}
              />
            </g>
          )
        })}

        {/* Ships */}
        {players.map((player, index) => {
          const ringConfig = RING_CONFIGS.find(r => r.ring === player.ship.ring)
          if (!ringConfig) return null

          // Get gravity well position for this ship
          const wellPosition = getGravityWellPosition(player.ship.wellId)

          // Using outer scaleFactor
          const radius = ringConfig.radius * scaleFactor
          // Position ship in the MIDDLE of the sector
          // Add 0.5 to center it between sector boundaries
          // Apply rotation offset for this gravity well
          const rotationOffset = getSectorRotationOffset(player.ship.wellId)
          const angle =
            ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset
          const x = wellPosition.x + radius * Math.cos(angle)
          const y = wellPosition.y + radius * Math.sin(angle)

          const isActive = index === activePlayerIndex
          const shipSize = isActive ? 14 : 12

          // Use pending facing if available (planning phase), otherwise use committed facing
          const effectiveFacing =
            index === activePlayerIndex && pendingFacing ? pendingFacing : player.ship.facing

          // Ship rotation angle - tangent to the orbit (perpendicular to radius)
          // Prograde = clockwise (add 90°), Retrograde = counter-clockwise (subtract 90°)
          const directionAngle =
            effectiveFacing === 'prograde'
              ? angle + Math.PI / 2 // 90° clockwise from radial
              : angle - Math.PI / 2 // 90° counter-clockwise from radial

          // Calculate predicted next position (and second step for transfers)
          let predictedX = null
          let predictedY = null
          let predictedRing = null
          let secondStepX = null
          let secondStepY = null
          let secondStepRing = null

          // Check if this is the active player with pending movement actions
          const isActivePlayer = index === activePlayerIndex
          const hasPendingBurn =
            isActivePlayer &&
            pendingMovement?.actionType === 'burn' &&
            pendingMovement.burnIntensity

          if (player.ship.transferState) {
            // Ship is in transfer - show where it will arrive
            if (player.ship.transferState.arriveNextTurn) {
              // Will arrive at destination ring next turn
              const destRingConfig = RING_CONFIGS.find(
                r => r.ring === player.ship.transferState!.destinationRing
              )
              if (destRingConfig) {
                // Determine destination well (could be different for well transfers)
                const destWellId = player.ship.transferState.destinationWellId || player.ship.wellId
                const destWellPosition = getGravityWellPosition(destWellId)

                // Calculate position on destination ring using sector mapping
                const baseSector = mapSectorOnTransfer(
                  player.ship.ring,
                  player.ship.transferState.destinationRing,
                  player.ship.sector
                )
                // Apply sector adjustment
                const adjustment = player.ship.transferState.sectorAdjustment || 0
                const finalSector =
                  (baseSector + adjustment + destRingConfig.sectors) % destRingConfig.sectors

                const destScaleFactor = scaleFactor
                const destRadius = destRingConfig.radius * destScaleFactor
                const destRotationOffset = getSectorRotationOffset(destWellId)
                const destAngle =
                  ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI -
                  Math.PI / 2 +
                  destRotationOffset
                predictedX = destWellPosition.x + destRadius * Math.cos(destAngle)
                predictedY = destWellPosition.y + destRadius * Math.sin(destAngle)
                predictedRing = destRingConfig.ring
              }
            }
            // If arriveNextTurn is false, ship stays in current position (still transferring)
          } else if (hasPendingBurn) {
            // Active player has a pending burn - show two-step prediction
            // Step 1: After orbital movement on current ring (where ship enters transfer)
            const afterOrbitalSector =
              (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
            const step1Angle =
              ((afterOrbitalSector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
              Math.PI / 2 +
              rotationOffset
            predictedX = wellPosition.x + radius * Math.cos(step1Angle)
            predictedY = wellPosition.y + radius * Math.sin(step1Angle)
            predictedRing = player.ship.ring

            // Calculate Step 2: Arrival at destination ring (next turn)
            const burnCost = BURN_COSTS[pendingMovement.burnIntensity!]
            const ringChange = effectiveFacing === 'prograde' ? burnCost.rings : -burnCost.rings
            const destinationRing = Math.max(1, Math.min(5, player.ship.ring + ringChange))

            const destRingConfig = RING_CONFIGS.find(r => r.ring === destinationRing)
            if (destRingConfig) {
              // Map sector from current ring (after orbital movement) to destination ring
              const baseSector = mapSectorOnTransfer(
                player.ship.ring,
                destinationRing,
                afterOrbitalSector
              )

              // Apply sector adjustment from pending movement
              const adjustment = pendingMovement.sectorAdjustment || 0
              const finalSector =
                (baseSector + adjustment + destRingConfig.sectors) % destRingConfig.sectors

              const destScaleFactor = scaleFactor
              const destRadius = destRingConfig.radius * destScaleFactor
              const destAngle =
                ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                rotationOffset

              secondStepX = wellPosition.x + destRadius * Math.cos(destAngle)
              secondStepY = wellPosition.y + destRadius * Math.sin(destAngle)
              secondStepRing = destinationRing
            }
          } else {
            // Ship is stable (or coasting) - show where it will move due to orbital velocity
            const nextSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
            const predictedAngle =
              ((nextSector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
            predictedX = wellPosition.x + radius * Math.cos(predictedAngle)
            predictedY = wellPosition.y + radius * Math.sin(predictedAngle)
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
                    strokeWidth={player.ship.transferState || hasPendingBurn ? 3 : 2}
                    strokeDasharray="4 4"
                    opacity={player.ship.transferState || hasPendingBurn ? 0.8 : 0.6}
                  />
                  {/* Predicted position circle */}
                  <circle
                    cx={predictedX}
                    cy={predictedY}
                    r={8}
                    fill={player.color}
                    opacity={0.5}
                    stroke={player.color}
                    strokeWidth={player.ship.transferState || hasPendingBurn ? 3 : 2}
                  />
                  {/* Label for transfers showing destination ring (only for actual transfers, not pending burns) */}
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
                  {/* Draw elliptical transfer arc for orbital transfers */}
                  {(() => {
                    // Calculate ellipse parameters for Hohmann transfer
                    const startRadius = radius
                    const endRadius = Math.sqrt(
                      (secondStepX - wellPosition.x) ** 2 + (secondStepY - wellPosition.y) ** 2
                    )

                    // Semi-major axis: average of start and end radii
                    const semiMajor = (startRadius + endRadius) / 2
                    // Semi-minor axis: geometric mean approximation
                    const semiMinor = Math.sqrt(startRadius * endRadius)

                    // Calculate start and end angles
                    const startAngle = Math.atan2(
                      predictedY! - wellPosition.y,
                      predictedX! - wellPosition.x
                    )
                    const endAngle = Math.atan2(
                      secondStepY - wellPosition.y,
                      secondStepX - wellPosition.x
                    )

                    // Calculate angle difference (handle wraparound)
                    let angleDiff = endAngle - startAngle
                    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
                    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI

                    // Rotation angle for the ellipse (average of start and end angles)
                    const rotationAngle = (startAngle + endAngle) / 2
                    const rotationDegrees = (rotationAngle * 180) / Math.PI

                    // Determine if this is a large arc (> 180 degrees)
                    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0

                    // Sweep flag: 1 for clockwise (prograde), 0 for counter-clockwise
                    const sweepFlag = angleDiff > 0 ? 1 : 0

                    // Create SVG elliptical arc path
                    const pathData = `
                      M ${predictedX} ${predictedY}
                      A ${semiMajor} ${semiMinor} ${rotationDegrees} ${largeArcFlag} ${sweepFlag} ${secondStepX} ${secondStepY}
                    `

                    return (
                      <path
                        d={pathData}
                        fill="none"
                        stroke={player.color}
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        opacity={0.7}
                      />
                    )
                  })()}

                  {/* Second step position circle */}
                  <circle
                    cx={secondStepX}
                    cy={secondStepY}
                    r={10}
                    fill={player.color}
                    opacity={0.4}
                    stroke={player.color}
                    strokeWidth={3}
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

              {/* Ship token with colored outline */}
              <image
                href="/assets/ship.png"
                x={-shipSize * 1.5}
                y={-shipSize * 1.5}
                width={shipSize * 3}
                height={shipSize * 3}
                opacity={player.ship.transferState ? 0.6 : 1}
                filter={`url(#outline-${player.id})`}
                transform={`translate(${x}, ${y}) rotate(${(directionAngle * 180) / Math.PI})`}
              />

              {/* Weapon range indicators - only for active player with toggled weapons */}
              {isActive &&
                (() => {
                  // Calculate if any weapon fires after movement to determine position for range visualization
                  const hasWeaponAfterMove = pendingState.tacticalSequence.some(action => {
                    const isWeapon =
                      action.type === 'fire_laser' ||
                      action.type === 'fire_railgun' ||
                      action.type === 'fire_missiles'
                    const moveAction = pendingState.tacticalSequence.find(a => a.type === 'move')
                    return isWeapon && moveAction && action.sequence > moveAction.sequence
                  })

                  // Calculate ship position for range visualization
                  let rangeVisualizationShip = player.ship
                  let rangeVisualizationRing = ringConfig
                  let rangeVisualizationRadius = radius
                  let rangeVisualizationAngle = angle
                  let rangeVisualizationX = x
                  let rangeVisualizationY = y

                  if (hasWeaponAfterMove) {
                    // Use post-movement position for visualization
                    rangeVisualizationShip = calculatePostMovementPosition(
                      player.ship,
                      pendingFacing,
                      pendingMovement
                    )

                    // Recalculate ring config and position for post-movement ship
                    const postMoveRingConfig = RING_CONFIGS.find(
                      r => r.ring === rangeVisualizationShip.ring
                    )
                    if (postMoveRingConfig) {
                      rangeVisualizationRing = postMoveRingConfig
                      const postMoveWellPosition = getGravityWellPosition(
                        rangeVisualizationShip.wellId
                      )
                      // Using outer scaleFactor
                      rangeVisualizationRadius = postMoveRingConfig.radius * scaleFactor
                      const postMoveRotationOffset = getSectorRotationOffset(
                        rangeVisualizationShip.wellId
                      )
                      rangeVisualizationAngle =
                        ((rangeVisualizationShip.sector + 0.5) / postMoveRingConfig.sectors) *
                          2 *
                          Math.PI -
                        Math.PI / 2 +
                        postMoveRotationOffset
                      rangeVisualizationX =
                        postMoveWellPosition.x +
                        rangeVisualizationRadius * Math.cos(rangeVisualizationAngle)
                      rangeVisualizationY =
                        postMoveWellPosition.y +
                        rangeVisualizationRadius * Math.sin(rangeVisualizationAngle)
                    }
                  }

                  return (
                    <>
                      {/* Render range visualization for each toggled weapon */}
                      {(['laser', 'railgun', 'missiles'] as const).map(weaponKey => {
                        // Only show if toggled on
                        if (!weaponRangeVisibility[weaponKey]) return null

                        const subsystemType: SubsystemType = weaponKey

                        // Get weapon subsystem
                        const weaponSubsystem = getSubsystem(player.ship.subsystems, subsystemType)
                        if (!weaponSubsystem) return null

                        const weaponConfig = getSubsystemConfig(subsystemType)
                        const weaponStats = weaponConfig.weaponStats
                        if (!weaponStats) return null

                        // For broadside weapons, show sector overlap visualization
                        if (weaponStats.arc === 'broadside') {
                          // Get the well position for range visualization
                          const rangeWellPosition = getGravityWellPosition(
                            rangeVisualizationShip.wellId
                          )

                          // Calculate attacker's sector angular boundaries using range visualization position
                          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
                          const sectorStartAngle = rangeVisualizationAngle - sectorSize / 2
                          const sectorEndAngle = rangeVisualizationAngle + sectorSize / 2

                          // Get rings within weapon's ring range
                          const minRing = Math.max(
                            1,
                            rangeVisualizationShip.ring - weaponStats.ringRange
                          )
                          const maxRing = Math.min(
                            RING_CONFIGS.length,
                            rangeVisualizationShip.ring + weaponStats.ringRange
                          )

                          // Using outer scaleFactor

                          // Calculate sector boundary points on the ship's ring
                          const rayStartX =
                            rangeWellPosition.x +
                            rangeVisualizationRadius * Math.cos(sectorStartAngle)
                          const rayStartY =
                            rangeWellPosition.y +
                            rangeVisualizationRadius * Math.sin(sectorStartAngle)
                          const rayEndX =
                            rangeWellPosition.x +
                            rangeVisualizationRadius * Math.cos(sectorEndAngle)
                          const rayEndY =
                            rangeWellPosition.y +
                            rangeVisualizationRadius * Math.sin(sectorEndAngle)

                          return (
                            <g key={`weapon-visibility-${weaponKey}`}>
                              {/* Draw rays from sector endpoints outward to target rings */}
                              {RING_CONFIGS.filter(
                                r =>
                                  r.ring >= minRing &&
                                  r.ring <= maxRing &&
                                  r.ring !== rangeVisualizationShip.ring
                              ).map(targetRing => {
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
                                const firstSectorIndex = Math.floor(
                                  attackerStart / targetSectorSize
                                )

                                // Find last sector that overlaps - this is the sector containing the end angle
                                // Use a small epsilon to handle floating point precision issues
                                const epsilon = 1e-10
                                const endSectorRaw = attackerEnd / targetSectorSize
                                const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)

                                // If we're very close to a sector boundary (within epsilon), don't include the next sector
                                const lastSectorIndex =
                                  fractionalPart < epsilon
                                    ? Math.floor(endSectorRaw) - 1 // On or very close to boundary - use previous sector
                                    : Math.floor(endSectorRaw) // Inside a sector - use that sector

                                // Calculate the actual sector boundary angles on target ring
                                const coverageStartAngle =
                                  firstSectorIndex * targetSectorSize - Math.PI / 2
                                const coverageEndAngle =
                                  (lastSectorIndex + 1) * targetSectorSize - Math.PI / 2

                                // Calculate positions on target ring at these sector boundaries
                                const targetStartX =
                                  rangeWellPosition.x + targetRadius * Math.cos(coverageStartAngle)
                                const targetStartY =
                                  rangeWellPosition.y + targetRadius * Math.sin(coverageStartAngle)
                                const targetEndX =
                                  rangeWellPosition.x + targetRadius * Math.cos(coverageEndAngle)
                                const targetEndY =
                                  rangeWellPosition.y + targetRadius * Math.sin(coverageEndAngle)

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
                        }

                        // For spinal weapons (railgun), show arc along same ring in facing direction
                        if (weaponStats.arc === 'spinal') {
                          // Spinal weapons fire tangentially along the current ring
                          // Range is 2× ring number in the facing direction
                          const spinalRange = rangeVisualizationShip.ring * 2

                          // Calculate current position angle
                          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
                          const currentAngle = rangeVisualizationAngle

                          // Use pending facing if available (planning phase), otherwise use committed facing
                          const effectiveFacing =
                            index === activePlayerIndex && pendingFacing
                              ? pendingFacing
                              : rangeVisualizationShip.facing

                          // Calculate the arc in facing direction
                          let arcStartAngle: number
                          let arcEndAngle: number

                          if (effectiveFacing === 'prograde') {
                            // Fire forward (counter-clockwise on display)
                            arcStartAngle = currentAngle
                            arcEndAngle = currentAngle + spinalRange * sectorSize
                          } else {
                            // Fire backward (clockwise on display)
                            arcStartAngle = currentAngle - spinalRange * sectorSize
                            arcEndAngle = currentAngle
                          }

                          // Calculate arc endpoints (using the well position, not center)
                          const rangeWellPosition = getGravityWellPosition(
                            rangeVisualizationShip.wellId
                          )
                          const arcStartX =
                            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcStartAngle)
                          const arcStartY =
                            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcStartAngle)
                          const arcEndX =
                            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcEndAngle)
                          const arcEndY =
                            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcEndAngle)

                          // Calculate if this is a large arc (> 180°)
                          let arcAngle = arcEndAngle - arcStartAngle
                          if (arcAngle < 0) arcAngle += 2 * Math.PI
                          const largeArcFlag = arcAngle > Math.PI ? 1 : 0

                          return (
                            <g key={`weapon-spinal-${weaponKey}`}>
                              {/* Draw arc showing firing range along orbit */}
                              <path
                                d={`
                              M ${arcStartX} ${arcStartY}
                              A ${rangeVisualizationRadius} ${rangeVisualizationRadius} 0 ${largeArcFlag} 1 ${arcEndX} ${arcEndY}
                            `}
                                fill="none"
                                stroke={player.color}
                                strokeWidth={4}
                                opacity={0.6}
                              />
                              {/* Mark ship position - use range visualization position */}
                              <circle
                                cx={rangeVisualizationX}
                                cy={rangeVisualizationY}
                                r={6}
                                fill={player.color}
                                opacity={0.9}
                                stroke="#fff"
                                strokeWidth={2}
                              />
                              {/* Mark arc endpoints */}
                              <circle
                                cx={arcStartX}
                                cy={arcStartY}
                                r={4}
                                fill={player.color}
                                opacity={0.8}
                              />
                              <circle
                                cx={arcEndX}
                                cy={arcEndY}
                                r={4}
                                fill={player.color}
                                opacity={0.8}
                              />
                            </g>
                          )
                        }

                        // For turret weapons (missiles), use same visualization as broadside (omnidirectional)
                        if (weaponStats.arc === 'turret') {
                          // Get the well position for range visualization
                          const rangeWellPosition = getGravityWellPosition(
                            rangeVisualizationShip.wellId
                          )

                          // Calculate attacker's sector angular boundaries
                          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
                          const sectorStartAngle = rangeVisualizationAngle - sectorSize / 2
                          const sectorEndAngle = rangeVisualizationAngle + sectorSize / 2

                          // Turret can fire in all directions
                          const minRing = Math.max(
                            1,
                            rangeVisualizationShip.ring - weaponStats.ringRange
                          )
                          const maxRing = Math.min(
                            RING_CONFIGS.length,
                            rangeVisualizationShip.ring + weaponStats.ringRange
                          )

                          // Using outer scaleFactor

                          // Calculate sector boundary points on the ship's ring
                          const rayStartX =
                            rangeWellPosition.x +
                            rangeVisualizationRadius * Math.cos(sectorStartAngle)
                          const rayStartY =
                            rangeWellPosition.y +
                            rangeVisualizationRadius * Math.sin(sectorStartAngle)
                          const rayEndX =
                            rangeWellPosition.x +
                            rangeVisualizationRadius * Math.cos(sectorEndAngle)
                          const rayEndY =
                            rangeWellPosition.y +
                            rangeVisualizationRadius * Math.sin(sectorEndAngle)

                          return (
                            <g key={`weapon-turret-${weaponKey}`}>
                              {/* Draw rays from sector endpoints outward to target rings */}
                              {RING_CONFIGS.filter(
                                r =>
                                  r.ring >= minRing &&
                                  r.ring <= maxRing &&
                                  r.ring !== rangeVisualizationShip.ring
                              ).map(targetRing => {
                                const targetRadius = targetRing.radius * scaleFactor
                                const targetSectorSize = (2 * Math.PI) / targetRing.sectors

                                // Normalize angles
                                const normalizeAngle = (a: number) => {
                                  let normalized = a % (2 * Math.PI)
                                  if (normalized < 0) normalized += 2 * Math.PI
                                  return normalized
                                }

                                // Calculate coverage using sectorRange
                                const sectorCoverageAngle =
                                  weaponStats.sectorRange * targetSectorSize
                                const centerAngle = normalizeAngle(
                                  rangeVisualizationAngle + Math.PI / 2
                                )

                                // Expand coverage by ±sectorRange
                                const coverageStart = centerAngle - sectorCoverageAngle
                                const coverageEnd = centerAngle + sectorCoverageAngle

                                // Find sector boundaries
                                const firstSector = Math.floor(
                                  normalizeAngle(coverageStart) / targetSectorSize
                                )
                                const epsilon = 1e-10
                                const endSectorRaw = normalizeAngle(coverageEnd) / targetSectorSize
                                const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)
                                const lastSector =
                                  fractionalPart < epsilon
                                    ? Math.floor(endSectorRaw) - 1
                                    : Math.floor(endSectorRaw)

                                const coverageStartAngle =
                                  firstSector * targetSectorSize - Math.PI / 2
                                const coverageEndAngle =
                                  (lastSector + 1) * targetSectorSize - Math.PI / 2

                                const targetStartX =
                                  rangeWellPosition.x + targetRadius * Math.cos(coverageStartAngle)
                                const targetStartY =
                                  rangeWellPosition.y + targetRadius * Math.sin(coverageStartAngle)
                                const targetEndX =
                                  rangeWellPosition.x + targetRadius * Math.cos(coverageEndAngle)
                                const targetEndY =
                                  rangeWellPosition.y + targetRadius * Math.sin(coverageEndAngle)

                                let arcAngle = coverageEndAngle - coverageStartAngle
                                if (arcAngle < 0) arcAngle += 2 * Math.PI

                                return (
                                  <g key={`rays-${targetRing.ring}`}>
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
                        }

                        return null
                      })}

                      {/* Show targeting indicators for all toggled weapons */}
                      {(['laser', 'railgun', 'missiles'] as const).map(weaponKey => {
                        // Only show if toggled on
                        if (!weaponRangeVisibility[weaponKey]) return null

                        const subsystemType: SubsystemType = weaponKey

                        // Get weapon subsystem and stats
                        const weaponSubsystem = getSubsystem(player.ship.subsystems, subsystemType)
                        if (!weaponSubsystem) return null

                        const weaponConfig = getSubsystemConfig(subsystemType)
                        const weaponStats = weaponConfig.weaponStats
                        if (!weaponStats) return null

                        // Determine if this weapon fires after movement in the tactical sequence
                        // If so, use the post-movement position for range calculations
                        let shipPositionForRangeCalc = player.ship

                        if (isActive) {
                          // Check if any weapon action of this type exists in tactical sequence
                          const weaponActionType =
                            weaponKey === 'laser'
                              ? 'fire_laser'
                              : weaponKey === 'railgun'
                                ? 'fire_railgun'
                                : 'fire_missiles'
                          const weaponAction = pendingState.tacticalSequence.find(
                            a => a.type === weaponActionType
                          )
                          const moveAction = pendingState.tacticalSequence.find(
                            a => a.type === 'move'
                          )

                          // If both weapon and move actions exist, check their sequence order
                          if (
                            weaponAction &&
                            moveAction &&
                            weaponAction.sequence > moveAction.sequence
                          ) {
                            // Weapon fires after movement - calculate post-movement position
                            shipPositionForRangeCalc = calculatePostMovementPosition(
                              player.ship,
                              pendingFacing,
                              pendingMovement
                            )
                          }
                        }

                        // Calculate firing solutions for all targets
                        const firingSolutions = calculateFiringSolutions(
                          weaponStats,
                          shipPositionForRangeCalc,
                          players,
                          player.id,
                          index === activePlayerIndex ? pendingFacing : undefined
                        )

                        return (
                          <g key={`targeting-${weaponKey}`}>
                            {firingSolutions.map(solution => {
                              if (!solution.inRange) return null

                              const otherPlayer = solution.targetPlayer
                              const otherRingConfig = RING_CONFIGS.find(
                                r => r.ring === otherPlayer.ship.ring
                              )
                              if (!otherRingConfig) return null

                              // Get the target's gravity well position
                              const targetWellPosition = getGravityWellPosition(
                                otherPlayer.ship.wellId
                              )

                              // Draw targeting reticle
                              const otherScaleFactor = scaleFactor
                              const otherRadius = otherRingConfig.radius * otherScaleFactor
                              const otherRotationOffset = getSectorRotationOffset(
                                otherPlayer.ship.wellId
                              )
                              const otherAngle =
                                ((otherPlayer.ship.sector + 0.5) / otherRingConfig.sectors) *
                                  2 *
                                  Math.PI -
                                Math.PI / 2 +
                                otherRotationOffset
                              const otherX =
                                targetWellPosition.x + otherRadius * Math.cos(otherAngle)
                              const otherY =
                                targetWellPosition.y + otherRadius * Math.sin(otherAngle)

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
                                  {/* Range indicator text - show distance */}
                                  <text
                                    x={otherX}
                                    y={otherY - 24}
                                    textAnchor="middle"
                                    fontSize={9}
                                    fill={player.color}
                                    fontWeight="bold"
                                  >
                                    D{Math.round(solution.distance)}
                                  </text>
                                </g>
                              )
                            })}
                          </g>
                        )
                      })}
                    </>
                  )
                })()}
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
          {/* Render all gravity wells on minimap */}
          {gameState.gravityWells.map(well => {
            const wellPosition = getGravityWellPosition(well.id)
            // Using outer scaleFactor

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
            const ringConfig = RING_CONFIGS.find(r => r.ring === player.ship.ring)
            if (!ringConfig) return null

            // Get gravity well position for this ship
            const wellPosition = getGravityWellPosition(player.ship.wellId)

            // Using outer scaleFactor
            const radius = ringConfig.radius * scaleFactor
            const rotationOffset = getSectorRotationOffset(player.ship.wellId)
            const angle =
              ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
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
