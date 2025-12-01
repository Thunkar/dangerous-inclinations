import type { Missile, Player, GameState } from '../../../types/game'
import { useBoardContext } from '../context'
import { MISSILE_CONFIG, calculateMissileMovement } from '../../../game-logic/missiles'

interface MissileRendererProps {
  missiles: Missile[]
  players: Player[]
  gameState: GameState
}

/**
 * Renders all missiles in flight with tracking lines, prediction arrows,
 * and labels (M# and turn counter)
 */
export function MissileRenderer({ missiles, players, gameState }: MissileRendererProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()

  return (
    <>
      {/* Arrow marker definitions for each player */}
      <defs>
        {players.map(player => (
          <marker
            key={`missile-arrow-${player.id}`}
            id={`missile-arrow-${player.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={player.color} opacity={0.6} />
          </marker>
        ))}
      </defs>

      {/* Render each missile */}
      {missiles.map(missile => {
        // Find the owner and target players
        const owner = players.find(p => p.id === missile.ownerId)
        const target = players.find(p => p.id === missile.targetId)
        if (!owner || !target) return null

        // Get the missile's gravity well
        const well = gameState.gravityWells.find(w => w.id === missile.wellId)
        if (!well) return null

        // Get the ring configuration
        const ringConfig = well.rings.find(r => r.ring === missile.ring)
        if (!ringConfig) return null

        // Get the rotation offset for this well (all wells rotate clockwise, direction = 1)
        const rotationOffset = getSectorRotationOffset(missile.wellId)

        // Get the well position
        const wellPosition = getGravityWellPosition(missile.wellId)

        // Calculate position with radial offset for multiple missiles in the same sector
        const missilesInSameSector = missiles.filter(
          m => m.wellId === missile.wellId && m.ring === missile.ring && m.sector === missile.sector
        )
        const missileIndexInSector = missilesInSameSector.findIndex(m => m.id === missile.id)
        const totalMissiles = missilesInSameSector.length
        const radialSpacing = 20
        const radialOffset =
          totalMissiles > 1 ? (missileIndexInSector - (totalMissiles - 1) / 2) * radialSpacing : 0

        // Calculate missile position
        const angle =
          ((missile.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          rotationOffset
        const baseRadius = ringConfig.radius * scaleFactor
        const missileRadius = baseRadius + radialOffset
        const x = wellPosition.x + missileRadius * Math.cos(angle)
        const y = wellPosition.y + missileRadius * Math.sin(angle)

        // Calculate next position using game logic
        const movement = calculateMissileMovement(missile, target, gameState)
        let nextX = x
        let nextY = y

        if (movement.ring !== missile.ring || movement.sector !== missile.sector) {
          const nextRingConfig = well.rings.find(r => r.ring === movement.ring)
          if (nextRingConfig) {
            const nextRadius = nextRingConfig.radius * scaleFactor
            const nextAngle =
              ((movement.sector + 0.5) / nextRingConfig.sectors) * 2 * Math.PI -
              Math.PI / 2 +
              rotationOffset
            nextX = wellPosition.x + nextRadius * Math.cos(nextAngle)
            nextY = wellPosition.y + nextRadius * Math.sin(nextAngle)
          }
        }

        // Calculate target position
        const targetWell = gameState.gravityWells.find(w => w.id === target.ship.wellId)
        if (!targetWell) return null

        const targetRingConfig = targetWell.rings.find(r => r.ring === target.ship.ring)
        if (!targetRingConfig) return null

        const targetWellPos = getGravityWellPosition(target.ship.wellId)
        const targetRadius = targetRingConfig.radius * scaleFactor
        const targetRotation = getSectorRotationOffset(target.ship.wellId)
        const targetAngle =
          ((target.ship.sector + 0.5) / targetRingConfig.sectors) * 2 * Math.PI -
          Math.PI / 2 +
          targetRotation
        const targetX = targetWellPos.x + targetRadius * Math.cos(targetAngle)
        const targetY = targetWellPos.y + targetRadius * Math.sin(targetAngle)

        // Calculate remaining turns
        const turnsRemaining = MISSILE_CONFIG.MAX_TURNS_ALIVE - missile.turnsAlive

        // Calculate label positions along the arc (tangential to the sector)
        const missileLabelDistance = 18
        const turnCounterDistance = 12
        const tangentAngle = angle + Math.PI / 2
        const labelLeftX = x + missileLabelDistance * Math.cos(tangentAngle)
        const labelLeftY = y + missileLabelDistance * Math.sin(tangentAngle)
        const labelRightX = x - turnCounterDistance * Math.cos(tangentAngle)
        const labelRightY = y - turnCounterDistance * Math.sin(tangentAngle)

        return (
          <g key={missile.id}>
            {/* Target tracking line (dashed) */}
            <line
              x1={x}
              y1={y}
              x2={targetX}
              y2={targetY}
              stroke={owner.color}
              strokeWidth={1}
              strokeDasharray="4 2"
              opacity={0.4}
            />

            {/* Predicted next position (if moving) */}
            {(nextX !== x || nextY !== y) && (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={nextX}
                  y2={nextY}
                  stroke={owner.color}
                  strokeWidth={2}
                  markerEnd={`url(#missile-arrow-${owner.id})`}
                  opacity={0.6}
                />
                <circle
                  cx={nextX}
                  cy={nextY}
                  r={4}
                  fill="none"
                  stroke={owner.color}
                  strokeWidth={1}
                  strokeDasharray="2 1"
                  opacity={0.6}
                />
              </>
            )}

            {/* Missile icon */}
            <image
              href="/assets/icons/ballistic_rack.png"
              x={x - 5}
              y={y - 5}
              width={10}
              height={10}
              filter={`url(#missile-outline-${owner.id})`}
              style={{ pointerEvents: 'none' }}
              transform={`rotate(${(angle * 180) / Math.PI + 180}, ${x}, ${y})`}
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
              M{missile.turnFired}
            </text>

            {/* Turn counter (turns until explodes) */}
            <text
              x={labelRightX}
              y={labelRightY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill={turnsRemaining === 1 ? '#ff4444' : 'white'}
              fontWeight="bold"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {turnsRemaining}
            </text>
          </g>
        )
      })}
    </>
  )
}
