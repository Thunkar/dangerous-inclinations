import React from 'react'
import type { Facing } from '../../../types/game'
import type { MovementPreview } from '../types'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import { BURN_COSTS, mapSectorOnTransfer } from '../../../constants/rings'

interface ShipRendererProps {
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
  pendingState: {
    tacticalSequence: Array<{ type: string; destinationWellId?: string; [key: string]: any }>
  }
  children?: (
    playerId: string,
    index: number,
    shipPosition: { x: number; y: number }
  ) => React.ReactNode
}

/**
 * ShipRenderer - Renders ships using displayState positions
 *
 * Architecture:
 * - Ship positions come from displayState (already interpolated during animation)
 * - Prediction indicators use gameState for game logic calculations
 * - No animation logic here - just render what displayState provides
 */
export function ShipRenderer({
  pendingFacing,
  pendingMovement,
  pendingState,
  children,
}: ShipRendererProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset, displayState } = useBoardContext()
  const { gameState } = useGame()

  // Need both displayState (for positions) and gameState (for game data)
  if (!displayState || !gameState) return null

  return (
    <>
      {displayState.ships.map((ship, index) => {
        // Get position directly from displayState - already computed with animation
        const { x, y } = ship.position
        const directionAngle = ship.rotation

        // Get the corresponding player from gameState for game logic data
        const player = gameState.players.find(p => p.id === ship.playerId)
        if (!player) return null

        // Get gravity well data for prediction calculations
        const well = gameState.gravityWells.find(w => w.id === player.ship.wellId)
        if (!well) return null

        const ringConfig = well.rings.find(r => r.ring === player.ship.ring)
        if (!ringConfig) return null

        const wellPosition = getGravityWellPosition(player.ship.wellId)
        const rotationOffset = getSectorRotationOffset(player.ship.wellId)
        const radius = ringConfig.radius * scaleFactor

        // Use pending facing if available (planning phase)
        const effectiveFacing =
          index === gameState.activePlayerIndex && pendingFacing ? pendingFacing : player.ship.facing

        // Calculate predicted positions for movement indicators
        let predictedX: number | null = null
        let predictedY: number | null = null
        let predictedRing: number | null = null
        let secondStepX: number | null = null
        let secondStepY: number | null = null
        let secondStepRing: number | null = null

        const isActivePlayer = index === gameState.activePlayerIndex
        const hasPendingBurn =
          isActivePlayer && pendingMovement?.actionType === 'burn' && pendingMovement.burnIntensity

        const pendingWellTransfer = isActivePlayer
          ? pendingState.tacticalSequence.find(a => a.type === 'well_transfer')
          : null

        if (hasPendingBurn) {
          const afterOrbitalSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors

          const step1Angle =
            ((afterOrbitalSector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset
          predictedX = wellPosition.x + radius * Math.cos(step1Angle)
          predictedY = wellPosition.y + radius * Math.sin(step1Angle)
          predictedRing = player.ship.ring

          const burnCost = BURN_COSTS[pendingMovement.burnIntensity!]
          const ringChange = effectiveFacing === 'prograde' ? burnCost.rings : -burnCost.rings
          const destinationRing = Math.max(1, Math.min(well.rings.length, player.ship.ring + ringChange))

          const destRingConfig = well.rings.find(r => r.ring === destinationRing)
          if (destRingConfig) {
            const baseSector = mapSectorOnTransfer(player.ship.ring, destinationRing, afterOrbitalSector)
            const adjustment = pendingMovement.sectorAdjustment || 0
            const finalSector = (baseSector + adjustment + destRingConfig.sectors) % destRingConfig.sectors

            const destRadius = destRingConfig.radius * scaleFactor
            const destAngle =
              ((finalSector + 0.5) / destRingConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

            secondStepX = wellPosition.x + destRadius * Math.cos(destAngle)
            secondStepY = wellPosition.y + destRadius * Math.sin(destAngle)
            secondStepRing = destinationRing
          }
        } else if (pendingWellTransfer && pendingWellTransfer.destinationWellId) {
          const destWell = gameState.gravityWells.find(w => w.id === pendingWellTransfer.destinationWellId)
          if (destWell) {
            const destOutermostRing = destWell.rings[destWell.rings.length - 1]
            const destWellPosition = getGravityWellPosition(pendingWellTransfer.destinationWellId)

            const transferPoint = gameState.transferPoints.find(
              tp =>
                tp.fromWellId === player.ship.wellId &&
                tp.fromSector === player.ship.sector &&
                tp.toWellId === pendingWellTransfer.destinationWellId
            )

            if (transferPoint) {
              const destSector = transferPoint.toSector
              const destRadius = destOutermostRing.radius * scaleFactor
              const destRotationOffset = getSectorRotationOffset(pendingWellTransfer.destinationWellId)
              const destAngle =
                ((destSector + 0.5) / destOutermostRing.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                destRotationOffset

              predictedX = destWellPosition.x + destRadius * Math.cos(destAngle)
              predictedY = destWellPosition.y + destRadius * Math.sin(destAngle)
              predictedRing = destOutermostRing.ring
            }
          }
        } else {
          const nextSector = (player.ship.sector + ringConfig.velocity) % ringConfig.sectors
          const predictedAngle =
            ((nextSector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
          predictedX = wellPosition.x + radius * Math.cos(predictedAngle)
          predictedY = wellPosition.y + radius * Math.sin(predictedAngle)
          predictedRing = player.ship.ring
        }

        return (
          <g key={ship.id}>
            {/* Predicted position indicator (Step 1) */}
            {predictedX !== null && predictedY !== null && (
              <>
                {hasPendingBurn ? (
                  <line
                    x1={x}
                    y1={y}
                    x2={predictedX}
                    y2={predictedY}
                    stroke={ship.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.4}
                  />
                ) : pendingWellTransfer ? (
                  (() => {
                    const bhPosition = getGravityWellPosition('blackhole')
                    const midX = (x + predictedX) / 2
                    const midY = (y + predictedY) / 2
                    const dx = predictedX - x
                    const dy = predictedY - y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    const awayFromBlackHoleX = midX - bhPosition.x
                    const awayFromBlackHoleY = midY - bhPosition.y
                    const awayDist = Math.sqrt(
                      awayFromBlackHoleX * awayFromBlackHoleX + awayFromBlackHoleY * awayFromBlackHoleY
                    )

                    const curveOffset = distance * 0.15
                    const controlX = midX + (awayFromBlackHoleX / awayDist) * curveOffset
                    const controlY = midY + (awayFromBlackHoleY / awayDist) * curveOffset

                    return (
                      <path
                        d={`M ${x} ${y} Q ${controlX} ${controlY} ${predictedX} ${predictedY}`}
                        fill="none"
                        stroke={ship.color}
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        opacity={0.7}
                      />
                    )
                  })()
                ) : (
                  (() => {
                    const startAngle = Math.atan2(y - wellPosition.y, x - wellPosition.x)
                    const endAngle = Math.atan2(predictedY - wellPosition.y, predictedX - wellPosition.x)

                    let angleDiff = endAngle - startAngle
                    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
                    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI

                    const sweepFlag = 1
                    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0
                    const pathData = `M ${x} ${y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${predictedX} ${predictedY}`

                    return (
                      <>
                        <path d={pathData} fill="none" stroke={ship.color} strokeWidth={6} opacity={0.15} />
                        <path
                          d={pathData}
                          fill="none"
                          stroke={ship.color}
                          strokeWidth={3}
                          strokeDasharray="8 4"
                          opacity={0.7}
                        />
                      </>
                    )
                  })()
                )}
                <circle
                  cx={predictedX}
                  cy={predictedY}
                  r={hasPendingBurn ? 6 : 8}
                  fill={ship.color}
                  opacity={hasPendingBurn ? 0.3 : 0.5}
                  stroke={ship.color}
                  strokeWidth={2}
                />
                {pendingWellTransfer && (
                  <text
                    x={predictedX}
                    y={predictedY - 12}
                    textAnchor="middle"
                    fontSize={10}
                    fill={ship.color}
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
                <line
                  x1={predictedX!}
                  y1={predictedY!}
                  x2={secondStepX}
                  y2={secondStepY}
                  stroke={ship.color}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  opacity={0.4}
                />
                {(() => {
                  const startRadius = radius
                  const endRadius = Math.sqrt(
                    (secondStepX - wellPosition.x) ** 2 + (secondStepY - wellPosition.y) ** 2
                  )

                  const semiMajor = (startRadius + endRadius) / 2
                  const semiMinor = Math.sqrt(startRadius * endRadius)

                  const startAngle = Math.atan2(y - wellPosition.y, x - wellPosition.x)
                  const endAngle = Math.atan2(secondStepY - wellPosition.y, secondStepX - wellPosition.x)

                  let angleDiff = endAngle - startAngle
                  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
                  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI

                  const rotationAngle = (startAngle + endAngle) / 2
                  const rotationDegrees = (rotationAngle * 180) / Math.PI

                  const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0
                  const sweepFlag = angleDiff > 0 ? 1 : 0

                  const pathData = `M ${x} ${y} A ${semiMajor} ${semiMinor} ${rotationDegrees} ${largeArcFlag} ${sweepFlag} ${secondStepX} ${secondStepY}`

                  return (
                    <>
                      <path d={pathData} fill="none" stroke={ship.color} strokeWidth={6} opacity={0.15} />
                      <path
                        d={pathData}
                        fill="none"
                        stroke={ship.color}
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        opacity={0.9}
                      />
                    </>
                  )
                })()}
                <circle
                  cx={secondStepX}
                  cy={secondStepY}
                  r={10}
                  fill={ship.color}
                  opacity={0.6}
                  stroke={ship.color}
                  strokeWidth={3}
                />
                <text
                  x={secondStepX}
                  y={secondStepY - 14}
                  textAnchor="middle"
                  fontSize={11}
                  fill={ship.color}
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
                stroke={ship.color}
                strokeWidth={3}
                strokeDasharray="8 8"
                opacity={0.6}
              />
            )}

            {/* Ship token with colored outline */}
            <image
              href="/assets/ship.png"
              x={-ship.size * 1.5}
              y={-ship.size * 1.5}
              width={ship.size * 3}
              height={ship.size * 3}
              opacity={player.ship.transferState ? 0.6 : 1}
              filter={`url(#outline-${ship.id})`}
              transform={`translate(${x}, ${y}) rotate(${(directionAngle * 180) / Math.PI})`}
            />

            {/* Render children (e.g., weapon range indicators) */}
            {children && children(ship.playerId, index, { x, y })}
          </g>
        )
      })}
    </>
  )
}
