import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import { calculateMissileMovement } from '../../../game-logic/missiles'
import { getGravityWell } from '../../../constants/gravityWells'
import { applyOrbitalMovement } from '../../../game-logic/movement'

/**
 * Calculate the prograde distance from missile to target (how many sectors ahead is target)
 * Positive = target is ahead (prograde direction)
 * If distance > half the ring, target is actually "behind" (shorter to go retrograde)
 */
function calculateTargetDirection(
  missileSector: number,
  targetSector: number,
  sectorCount: number
): 'prograde' | 'retrograde' {
  let diff = targetSector - missileSector
  if (diff < 0) diff += sectorCount

  // If prograde distance is more than half the ring, target is "behind"
  return diff <= sectorCount / 2 ? 'prograde' : 'retrograde'
}

/**
 * Generate SVG arc path from start to end around a center point
 */
function generateArcPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  centerX: number,
  centerY: number
): string {
  // Calculate angles
  const startAngle = Math.atan2(startY - centerY, startX - centerX)
  const endAngle = Math.atan2(endY - centerY, endX - centerX)

  // Calculate radii at start and end points
  const startRadius = Math.sqrt(Math.pow(startX - centerX, 2) + Math.pow(startY - centerY, 2))
  const endRadius = Math.sqrt(Math.pow(endX - centerX, 2) + Math.pow(endY - centerY, 2))

  // Calculate angular distance (always go the short way)
  let angleDiff = endAngle - startAngle
  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

  // Generate intermediate points for a smooth curve
  const steps = 12
  const points: string[] = [`M ${startX} ${startY}`]

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const angle = startAngle + angleDiff * t
    const radius = startRadius + (endRadius - startRadius) * t
    const px = centerX + radius * Math.cos(angle)
    const py = centerY + radius * Math.sin(angle)
    points.push(`L ${px} ${py}`)
  }

  return points.join(' ')
}

/**
 * MissileRenderer - Renders missiles using displayState positions
 *
 * Architecture:
 * - Missile positions come from displayState (already interpolated during animation)
 * - Prediction indicators use gameState for game logic calculations
 * - No animation logic here - just render what displayState provides
 */
export function MissileRenderer() {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset, displayState } = useBoardContext()
  const { gameState } = useGame()

  // Need both displayState (for positions) and gameState (for game data)
  if (!displayState || !gameState) return null

  return (
    <>
      {/* Arrow marker definitions for each missile owner */}
      <defs>
        {displayState.ships.map(ship => (
          <marker
            key={`missile-arrow-${ship.id}`}
            id={`missile-arrow-${ship.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={ship.color} opacity={0.6} />
          </marker>
        ))}
      </defs>

      {/* Render each missile from displayState */}
      {displayState.missiles.map(missile => {
        // Get position directly from displayState - already computed with animation
        const { x, y } = missile.position

        // Find the corresponding game missile for additional data (may not exist during animation)
        const gameMissile = gameState.missiles.find(m => m.id === missile.id)

        // During animation, gameMissile may not exist yet - still render the missile
        // but skip prediction indicators that require game data
        const targetPlayer = gameMissile
          ? gameState.players.find(p => p.id === gameMissile.targetId)
          : null

        // Get target position from displayState
        const targetShip = gameMissile
          ? displayState.ships.find(s => s.playerId === gameMissile.targetId)
          : null
        const targetX = targetShip?.position.x ?? 0
        const targetY = targetShip?.position.y ?? 0

        // Get well info for calculations
        const well = gameMissile ? getGravityWell(gameMissile.wellId) : null
        const currentRingConfig = well?.rings.find(r => r.ring === gameMissile?.ring)
        const wellPosition = gameMissile ? getGravityWellPosition(gameMissile.wellId) : { x: 0, y: 0 }
        const rotationOffset = gameMissile ? getSectorRotationOffset(gameMissile.wellId) : 0

        // Calculate missile rotation based on target direction (prograde or retrograde)
        // Missiles should point TANGENTIALLY along the orbit, not radially
        let missileRotation = missile.rotation // Default from displayState
        if (gameMissile && targetPlayer && currentRingConfig) {
          const targetDirection = calculateTargetDirection(
            gameMissile.sector,
            targetPlayer.ship.sector,
            currentRingConfig.sectors
          )
          // Calculate the radial angle of the missile's position (points outward from center)
          const radialAngle =
            ((gameMissile.sector + 0.5) / currentRingConfig.sectors) * 2 * Math.PI -
            Math.PI / 2 +
            rotationOffset

          // Tangent is perpendicular to radial
          // Prograde tangent = radial + 90° (pointing in direction of orbit)
          // Retrograde tangent = radial - 90° (pointing against orbit)
          if (targetDirection === 'prograde') {
            missileRotation = radialAngle + Math.PI / 2 // Tangent pointing prograde
          } else {
            missileRotation = radialAngle - Math.PI / 2 // Tangent pointing retrograde
          }
        }

        // Calculate next position using game logic for prediction (only if we have game data)
        // IMPORTANT: Include orbital drift in prediction!
        let nextX = x
        let nextY = y
        let hasPrediction = false

        if (gameMissile && targetPlayer && well) {
          // Step 1: Apply orbital drift first (same as processMissiles does)
          const missileAsShip = {
            wellId: gameMissile.wellId,
            ring: gameMissile.ring,
            sector: gameMissile.sector,
            facing: 'prograde' as const,
            reactionMass: 0,
            hitPoints: 1,
            maxHitPoints: 1,
            transferState: null,
            subsystems: [],
            reactor: { totalCapacity: 0, availableEnergy: 0, maxReturnRate: 0, energyToReturn: 0 },
            heat: { currentHeat: 0, heatToVent: 0 },
            missileInventory: 0,
          }
          const afterOrbital = applyOrbitalMovement(missileAsShip)

          // Step 2: Apply fuel-based movement from post-orbital position
          const movement = calculateMissileMovement(
            { ...gameMissile, ring: afterOrbital.ring, sector: afterOrbital.sector },
            targetPlayer,
            gameState
          )

          // Only show prediction if position actually changes
          if (movement.ring !== gameMissile.ring || movement.sector !== gameMissile.sector) {
            const nextRingConfig = well.rings.find(r => r.ring === movement.ring)
            if (nextRingConfig) {
              const nextRadius = nextRingConfig.radius * scaleFactor
              const nextAngle =
                ((movement.sector + 0.5) / nextRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                rotationOffset
              nextX = wellPosition.x + nextRadius * Math.cos(nextAngle)
              nextY = wellPosition.y + nextRadius * Math.sin(nextAngle)
              hasPrediction = true
            }
          }
        }

        // Generate arc path for prediction line
        const arcPath = hasPrediction
          ? generateArcPath(x, y, nextX, nextY, wellPosition.x, wellPosition.y)
          : ''

        // Calculate label positions along the arc (tangential to the sector)
        const tangentAngle = missileRotation - Math.PI + Math.PI / 2
        const missileLabelDistance = 18
        const turnCounterDistance = 12
        const labelLeftX = x + missileLabelDistance * Math.cos(tangentAngle)
        const labelLeftY = y + missileLabelDistance * Math.sin(tangentAngle)
        const labelRightX = x - turnCounterDistance * Math.cos(tangentAngle)
        const labelRightY = y - turnCounterDistance * Math.sin(tangentAngle)

        return (
          <g key={missile.id}>
            {/* Target tracking line (dashed) - only show when we have target data */}
            {targetShip && (
              <line
                x1={x}
                y1={y}
                x2={targetX}
                y2={targetY}
                stroke={missile.color}
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.4}
              />
            )}

            {/* Predicted next position (arc path instead of straight line) */}
            {hasPrediction && (
              <>
                <path
                  d={arcPath}
                  stroke={missile.color}
                  strokeWidth={2}
                  fill="none"
                  markerEnd={`url(#missile-arrow-${missile.ownerId})`}
                  opacity={0.6}
                />
                <circle
                  cx={nextX}
                  cy={nextY}
                  r={4}
                  fill="none"
                  stroke={missile.color}
                  strokeWidth={1}
                  strokeDasharray="2 1"
                  opacity={0.6}
                />
              </>
            )}

            {/* Missile icon
                The icon natively points "up" (-90° in SVG coordinates).
                We need to add 90° to convert from our calculated angle to the icon's orientation.
            */}
            <image
              href="/assets/icons/ballistic_rack.png"
              x={x - 5}
              y={y - 5}
              width={10}
              height={10}
              filter={`url(#missile-outline-${missile.ownerId})`}
              style={{ pointerEvents: 'none' }}
              transform={`rotate(${(missileRotation * 180) / Math.PI + 90}, ${x}, ${y})`}
            />

            {/* M# label (which turn fired) */}
            <text
              x={labelLeftX}
              y={labelLeftY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill="white"
              fontWeight="bold"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {missile.label}
            </text>

            {/* Turn counter (turns until explodes) */}
            <text
              x={labelRightX}
              y={labelRightY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill={missile.turnsRemaining === 1 ? '#ff4444' : 'white'}
              fontWeight="bold"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {missile.turnsRemaining}
            </text>
          </g>
        )
      })}
    </>
  )
}
