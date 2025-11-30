import React from 'react'
import type { Player, GameState, Facing } from '../../../types/game'
import type { MovementPreview } from '../types'
import { useBoardContext } from '../context'
import { BURN_COSTS, mapSectorOnTransfer } from '../../../constants/rings'

interface ShipRendererProps {
  players: Player[]
  activePlayerIndex: number
  gameState: GameState
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
  pendingState: {
    tacticalSequence: Array<{ type: string; destinationWellId?: string; [key: string]: any }>
  }
  children?: (player: Player, index: number, shipPosition: { x: number; y: number }) => React.ReactNode
}

/**
 * Renders all ships with movement prediction indicators
 */
export function ShipRenderer({
  players,
  activePlayerIndex,
  gameState,
  pendingFacing,
  pendingMovement,
  pendingState,
  children,
}: ShipRendererProps) {
  const { scaleFactor, getGravityWellPosition, getSectorAngleDirection, getSectorRotationOffset } =
    useBoardContext()

  return (
    <>
      {players.map((player, index) => {
        // Get the gravity well for this ship
        const well = gameState.gravityWells.find(w => w.id === player.ship.wellId)
        if (!well) return null

        const ringConfig = well.rings.find(r => r.ring === player.ship.ring)
        if (!ringConfig) return null

        // Get gravity well position for this ship
        const wellPosition = getGravityWellPosition(player.ship.wellId)

        const radius = ringConfig.radius * scaleFactor
        // Position ship in the MIDDLE of the sector
        const direction = getSectorAngleDirection(player.ship.wellId)
        const rotationOffset = getSectorRotationOffset(player.ship.wellId)
        const angle =
          direction * ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
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
        const directionAngle =
          effectiveFacing === 'prograde'
            ? angle + direction * (Math.PI / 2) // 90° in rotation direction
            : angle - direction * (Math.PI / 2) // 90° opposite rotation direction

        // Calculate predicted next position (and second step for transfers)
        let predictedX: number | null = null
        let predictedY: number | null = null
        let predictedRing: number | null = null
        let secondStepX: number | null = null
        let secondStepY: number | null = null
        let secondStepRing: number | null = null

        // Check if this is the active player with pending movement actions
        const isActivePlayer = index === activePlayerIndex
        const hasPendingBurn =
          isActivePlayer &&
          pendingMovement?.actionType === 'burn' &&
          pendingMovement.burnIntensity

        // Check if there's a pending well transfer action in the tactical sequence
        const pendingWellTransfer = isActivePlayer
          ? pendingState.tacticalSequence.find(a => a.type === 'well_transfer')
          : null

        if (hasPendingBurn) {
          // Active player has a pending burn - show two-step prediction
          const afterOrbitalSector =
            (player.ship.sector + ringConfig.velocity) % ringConfig.sectors

          // Step 1: Position after orbital movement (on current ring)
          const step1Direction = getSectorAngleDirection(player.ship.wellId)
          const step1Angle =
            step1Direction * ((afterOrbitalSector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset
          predictedX = wellPosition.x + radius * Math.cos(step1Angle)
          predictedY = wellPosition.y + radius * Math.sin(step1Angle)
          predictedRing = player.ship.ring

          // Step 2: Calculate destination ring after burn
          const burnCost = BURN_COSTS[pendingMovement.burnIntensity!]
          const ringChange = effectiveFacing === 'prograde' ? burnCost.rings : -burnCost.rings
          const destinationRing = Math.max(
            1,
            Math.min(well.rings.length, player.ship.ring + ringChange)
          )

          const destRingConfig = well.rings.find(r => r.ring === destinationRing)
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

            const destRadius = destRingConfig.radius * scaleFactor
            const destDirection = getSectorAngleDirection(player.ship.wellId)
            const destAngle =
              destDirection * ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI -
              Math.PI / 2 +
              rotationOffset

            // Step 2: Arrival at destination ring (immediate transfer)
            secondStepX = wellPosition.x + destRadius * Math.cos(destAngle)
            secondStepY = wellPosition.y + destRadius * Math.sin(destAngle)
            secondStepRing = destinationRing
          }
        } else if (pendingWellTransfer && pendingWellTransfer.destinationWellId) {
          // Active player has a pending well transfer - show where they will arrive
          const destWell = gameState.gravityWells.find(
            w => w.id === pendingWellTransfer.destinationWellId
          )
          if (destWell) {
            const destOutermostRing = destWell.rings[destWell.rings.length - 1]
            const destWellPosition = getGravityWellPosition(
              pendingWellTransfer.destinationWellId
            )

            // Find the transfer point to get the destination sector
            const transferPoint = gameState.transferPoints.find(
              tp =>
                tp.fromWellId === player.ship.wellId &&
                tp.fromSector === player.ship.sector &&
                tp.toWellId === pendingWellTransfer.destinationWellId
            )

            if (transferPoint) {
              const destSector = transferPoint.toSector
              const destRingConfig = destOutermostRing

              const destRadius = destRingConfig.radius * scaleFactor
              const destRotationOffset = getSectorRotationOffset(
                pendingWellTransfer.destinationWellId
              )
              const destDirection = getSectorAngleDirection(
                pendingWellTransfer.destinationWellId
              )
              const destAngle =
                destDirection * ((destSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                destRotationOffset

              predictedX = destWellPosition.x + destRadius * Math.cos(destAngle)
              predictedY = destWellPosition.y + destRadius * Math.sin(destAngle)
              predictedRing = destRingConfig.ring

              // After well transfer, ship will coast, so show second step (orbital movement)
              const nextSector = (destSector + destRingConfig.velocity) % destRingConfig.sectors
              const secondAngle =
                destDirection * ((nextSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                destRotationOffset
              secondStepX = destWellPosition.x + destRadius * Math.cos(secondAngle)
              secondStepY = destWellPosition.y + destRadius * Math.sin(secondAngle)
              secondStepRing = destRingConfig.ring
            }
          }
        } else {
          // Ship is stable (or coasting) - show where it will move due to orbital velocity
          const nextSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
          const coastDirection = getSectorAngleDirection(player.ship.wellId)
          const predictedAngle =
            coastDirection * ((nextSector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset
          predictedX = wellPosition.x + radius * Math.cos(predictedAngle)
          predictedY = wellPosition.y + radius * Math.sin(predictedAngle)
          predictedRing = player.ship.ring
        }

        return (
          <g key={player.id}>
            {/* Predicted position indicator (Step 1) */}
            {predictedX !== null && predictedY !== null && (
              <>
                {/* Connecting arc/line from current to predicted position */}
                {hasPendingBurn ? (
                  // For burns, use straight line
                  <line
                    x1={x}
                    y1={y}
                    x2={predictedX}
                    y2={predictedY}
                    stroke={player.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.4}
                  />
                ) : (
                  // For coasting, use circular arc following the orbital path
                  (() => {
                    const startAngle = Math.atan2(y - wellPosition.y, x - wellPosition.x)
                    const endAngle = Math.atan2(
                      predictedY - wellPosition.y,
                      predictedX - wellPosition.x
                    )

                    let angleDiff = endAngle - startAngle
                    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
                    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI

                    const coastDirection = getSectorAngleDirection(player.ship.wellId)
                    const sweepFlag = coastDirection > 0 ? 1 : 0
                    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0

                    const pathData = `M ${x} ${y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${predictedX} ${predictedY}`

                    return (
                      <>
                        <path
                          d={pathData}
                          fill="none"
                          stroke={player.color}
                          strokeWidth={6}
                          opacity={0.15}
                        />
                        <path
                          d={pathData}
                          fill="none"
                          stroke={player.color}
                          strokeWidth={3}
                          strokeDasharray="8 4"
                          opacity={0.7}
                        />
                      </>
                    )
                  })()
                )}
                {/* Predicted position circle */}
                <circle
                  cx={predictedX}
                  cy={predictedY}
                  r={hasPendingBurn ? 6 : 8}
                  fill={player.color}
                  opacity={hasPendingBurn ? 0.3 : 0.5}
                  stroke={player.color}
                  strokeWidth={2}
                />
                {/* Label for pending well transfers showing destination ring */}
                {pendingWellTransfer && (
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
                {/* Step 2: Straight line from step 1 to final position */}
                <line
                  x1={predictedX!}
                  y1={predictedY!}
                  x2={secondStepX}
                  y2={secondStepY}
                  stroke={player.color}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  opacity={0.4}
                />

                {/* Realistic orbital transfer: Elliptical arc */}
                {(() => {
                  const startRadius = radius
                  const endRadius = Math.sqrt(
                    (secondStepX - wellPosition.x) ** 2 + (secondStepY - wellPosition.y) ** 2
                  )

                  const semiMajor = (startRadius + endRadius) / 2
                  const semiMinor = Math.sqrt(startRadius * endRadius)

                  const startAngle = Math.atan2(y - wellPosition.y, x - wellPosition.x)
                  const endAngle = Math.atan2(
                    secondStepY - wellPosition.y,
                    secondStepX - wellPosition.x
                  )

                  let angleDiff = endAngle - startAngle
                  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
                  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI

                  const rotationAngle = (startAngle + endAngle) / 2
                  const rotationDegrees = (rotationAngle * 180) / Math.PI

                  const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0
                  const sweepFlag = angleDiff > 0 ? 1 : 0

                  const pathData = `
                      M ${x} ${y}
                      A ${semiMajor} ${semiMinor} ${rotationDegrees} ${largeArcFlag} ${sweepFlag} ${secondStepX} ${secondStepY}
                    `

                  return (
                    <>
                      <path
                        d={pathData}
                        fill="none"
                        stroke={player.color}
                        strokeWidth={6}
                        opacity={0.15}
                      />
                      <path
                        d={pathData}
                        fill="none"
                        stroke={player.color}
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        opacity={0.9}
                      />
                    </>
                  )
                })()}

                {/* Second step position circle (final destination) */}
                <circle
                  cx={secondStepX}
                  cy={secondStepY}
                  r={10}
                  fill={player.color}
                  opacity={0.6}
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

            {/* Render children (e.g., weapon range indicators) for each ship */}
            {children && children(player, index, { x, y })}
          </g>
        )
      })}
    </>
  )
}
