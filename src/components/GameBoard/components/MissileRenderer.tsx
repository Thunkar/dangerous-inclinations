import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import { calculateMissileMovement } from '../../../game-logic/missiles'

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
        const rotation = missile.rotation

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

        // Calculate next position using game logic for prediction (only if we have game data)
        let nextX = x
        let nextY = y

        if (gameMissile && targetPlayer) {
          const movement = calculateMissileMovement(gameMissile, targetPlayer, gameState)
          if (movement.ring !== gameMissile.ring || movement.sector !== gameMissile.sector) {
            const well = gameState.gravityWells.find(w => w.id === gameMissile.wellId)
            const nextRingConfig = well?.rings.find(r => r.ring === movement.ring)
            if (well && nextRingConfig) {
              const wellPosition = getGravityWellPosition(gameMissile.wellId)
              const rotationOffset = getSectorRotationOffset(gameMissile.wellId)
              const nextRadius = nextRingConfig.radius * scaleFactor
              const nextAngle =
                ((movement.sector + 0.5) / nextRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                rotationOffset
              nextX = wellPosition.x + nextRadius * Math.cos(nextAngle)
              nextY = wellPosition.y + nextRadius * Math.sin(nextAngle)
            }
          }
        }

        // Calculate label positions along the arc (tangential to the sector)
        const tangentAngle = rotation - Math.PI + Math.PI / 2
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

            {/* Predicted next position (if moving and we have game data) */}
            {gameMissile && (nextX !== x || nextY !== y) && (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={nextX}
                  y2={nextY}
                  stroke={missile.color}
                  strokeWidth={2}
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

            {/* Missile icon */}
            <image
              href="/assets/icons/ballistic_rack.png"
              x={x - 5}
              y={y - 5}
              width={10}
              height={10}
              filter={`url(#missile-outline-${missile.ownerId})`}
              style={{ pointerEvents: 'none' }}
              transform={`rotate(${(rotation * 180) / Math.PI}, ${x}, ${y})`}
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
