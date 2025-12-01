import type { Player, GameState, Facing } from '../../../types/game'
import type { SubsystemType } from '../../../types/subsystems'
import type { MovementPreview } from '../types'
import { useBoardContext } from '../context'
import { calculateFiringSolutions } from '../../../utils/weaponRange'
import { getSubsystem } from '../../../utils/subsystemHelpers'
import { getSubsystemConfig } from '../../../types/subsystems'
import { calculatePostMovementPosition } from '../../../utils/tacticalSequence'

interface WeaponRangeIndicatorsProps {
  player: Player
  playerIndex: number
  activePlayerIndex: number
  gameState: GameState
  players: Player[]
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
  pendingState: {
    tacticalSequence: Array<{ type: string; sequence: number; [key: string]: any }>
  }
  weaponRangeVisibility: {
    laser: boolean
    railgun: boolean
    missiles: boolean
  }
}

/**
 * Renders weapon range indicators and targeting reticles for the active player
 */
export function WeaponRangeIndicators({
  player,
  playerIndex,
  activePlayerIndex,
  gameState,
  players,
  pendingFacing,
  pendingMovement,
  pendingState,
  weaponRangeVisibility,
}: WeaponRangeIndicatorsProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()

  const isActive = playerIndex === activePlayerIndex
  if (!isActive) return null

  // Get ship's current position info
  const well = gameState.gravityWells.find(w => w.id === player.ship.wellId)
  if (!well) return null

  const ringConfig = well.rings.find(r => r.ring === player.ship.ring)
  if (!ringConfig) return null

  const wellPosition = getGravityWellPosition(player.ship.wellId)
  const radius = ringConfig.radius * scaleFactor
  const rotationOffset = getSectorRotationOffset(player.ship.wellId)
  const angle =
    ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI -
    Math.PI / 2 +
    rotationOffset
  const x = wellPosition.x + radius * Math.cos(angle)
  const y = wellPosition.y + radius * Math.sin(angle)

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
    const postMoveWell = gameState.gravityWells.find(w => w.id === rangeVisualizationShip.wellId)
    const postMoveRingConfig = postMoveWell?.rings.find(r => r.ring === rangeVisualizationShip.ring)
    if (postMoveRingConfig && postMoveWell) {
      rangeVisualizationRing = postMoveRingConfig
      const postMoveWellPosition = getGravityWellPosition(
        rangeVisualizationShip.wellId
      )
      rangeVisualizationRadius = postMoveRingConfig.radius * scaleFactor
      const postMoveRotationOffset = getSectorRotationOffset(
        rangeVisualizationShip.wellId
      )
      // Visual sector same as logical sector
      rangeVisualizationAngle =
        ((rangeVisualizationShip.sector + 0.5) / postMoveRingConfig.sectors) * 2 * Math.PI -
        Math.PI / 2 +
        postMoveRotationOffset
      rangeVisualizationX =
        postMoveWellPosition.x + rangeVisualizationRadius * Math.cos(rangeVisualizationAngle)
      rangeVisualizationY =
        postMoveWellPosition.y + rangeVisualizationRadius * Math.sin(rangeVisualizationAngle)
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

        // For broadside weapons, cast rays showing ±sectorRange sector spread on adjacent rings
        if (weaponStats.arc === 'broadside') {
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)

          // Calculate attacker's sector boundaries
          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const sectorStartAngle = rangeVisualizationAngle - sectorSize / 2
          const sectorEndAngle = rangeVisualizationAngle + sectorSize / 2

          // Calculate ray start points on ship's ring
          const rayStartX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorStartAngle)
          const rayStartY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorStartAngle)
          const rayEndX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorEndAngle)
          const rayEndY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorEndAngle)

          // Get rings within weapon's ring range (±ringRange, but not same ring)
          const rangeWell = gameState.gravityWells.find(w => w.id === rangeVisualizationShip.wellId)
          if (!rangeWell) return null

          const minRing = Math.max(1, rangeVisualizationShip.ring - weaponStats.ringRange)
          const maxRing = Math.min(
            rangeWell.rings.length,
            rangeVisualizationShip.ring + weaponStats.ringRange
          )

          return (
            <g key={`weapon-visibility-${weaponKey}`}>
              {/* Draw rays and arcs for each adjacent ring */}
              {rangeWell.rings
                .filter(
                  r =>
                    r.ring >= minRing &&
                    r.ring <= maxRing &&
                    r.ring !== rangeVisualizationShip.ring
                )
                .map(targetRing => {
                  const targetRadius = targetRing.radius * scaleFactor
                  const targetSectorSize = (2 * Math.PI) / targetRing.sectors

                  const targetRotationOffset = getSectorRotationOffset(rangeVisualizationShip.wellId)

                  // Calculate first and last targetable sectors (current ±sectorRange)
                  const firstTargetSector =
                    (rangeVisualizationShip.sector -
                      weaponStats.sectorRange +
                      rangeVisualizationRing.sectors) %
                    rangeVisualizationRing.sectors
                  const lastTargetSector =
                    (rangeVisualizationShip.sector + weaponStats.sectorRange) %
                    rangeVisualizationRing.sectors

                  // Calculate boundary angles on target ring
                  const targetStartAngle =
                    firstTargetSector * targetSectorSize - Math.PI / 2 + targetRotationOffset
                  const targetEndAngle =
                    (lastTargetSector + 1) * targetSectorSize - Math.PI / 2 + targetRotationOffset

                  // Calculate ray endpoints on target ring
                  const targetStartX =
                    rangeWellPosition.x + targetRadius * Math.cos(targetStartAngle)
                  const targetStartY =
                    rangeWellPosition.y + targetRadius * Math.sin(targetStartAngle)
                  const targetEndX = rangeWellPosition.x + targetRadius * Math.cos(targetEndAngle)
                  const targetEndY = rangeWellPosition.y + targetRadius * Math.sin(targetEndAngle)

                  // Calculate arc coverage angle
                  const arcSpan = weaponStats.sectorRange * 2 + 1
                  const arcAngle = arcSpan * targetSectorSize

                  return (
                    <g key={`rays-${targetRing.ring}`}>
                      {/* Ray from start of ship's sector to start of first targetable sector */}
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
                      {/* Ray from end of ship's sector to end of last targetable sector */}
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
                      {/* Arc covering all targetable sectors */}
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
              {/* Highlight ship's own sector boundaries */}
              <circle cx={rayStartX} cy={rayStartY} r={4} fill={player.color} opacity={0.8} />
              <circle cx={rayEndX} cy={rayEndY} r={4} fill={player.color} opacity={0.8} />
            </g>
          )
        }

        // For spinal weapons (railgun), show arc along same ring in facing direction
        if (weaponStats.arc === 'spinal') {
          // Spinal weapons fire tangentially along the current ring
          const spinalRange = rangeVisualizationShip.ring * 2

          // Calculate current position angle
          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const currentAngle = rangeVisualizationAngle

          // Use pending facing if available
          const effectiveFacing =
            playerIndex === activePlayerIndex && pendingFacing
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

          // Calculate arc endpoints
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)
          const arcStartX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcStartAngle)
          const arcStartY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcStartAngle)
          const arcEndX = rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcEndAngle)
          const arcEndY = rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcEndAngle)

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
              {/* Mark ship position */}
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
              <circle cx={arcStartX} cy={arcStartY} r={4} fill={player.color} opacity={0.8} />
              <circle cx={arcEndX} cy={arcEndY} r={4} fill={player.color} opacity={0.8} />
            </g>
          )
        }

        // For turret weapons (missiles), use same visualization as broadside (omnidirectional)
        if (weaponStats.arc === 'turret') {
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)

          // Calculate attacker's sector angular boundaries
          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const sectorStartAngle = rangeVisualizationAngle - sectorSize / 2
          const sectorEndAngle = rangeVisualizationAngle + sectorSize / 2

          // Turret can fire in all directions
          const turretRangeWell = gameState.gravityWells.find(
            w => w.id === rangeVisualizationShip.wellId
          )
          if (!turretRangeWell) return null

          const minRing = Math.max(1, rangeVisualizationShip.ring - weaponStats.ringRange)
          const maxRing = Math.min(
            turretRangeWell.rings.length,
            rangeVisualizationShip.ring + weaponStats.ringRange
          )

          // Calculate sector boundary points on the ship's ring
          const rayStartX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorStartAngle)
          const rayStartY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorStartAngle)
          const rayEndX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorEndAngle)
          const rayEndY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorEndAngle)

          return (
            <g key={`weapon-turret-${weaponKey}`}>
              {/* Draw rays from sector endpoints outward to target rings */}
              {turretRangeWell.rings
                .filter(
                  r =>
                    r.ring >= minRing &&
                    r.ring <= maxRing &&
                    r.ring !== rangeVisualizationShip.ring
                )
                .map(targetRing => {
                  const targetRadius = targetRing.radius * scaleFactor
                  const targetSectorSize = (2 * Math.PI) / targetRing.sectors

                  // Normalize angles
                  const normalizeAngle = (a: number) => {
                    let normalized = a % (2 * Math.PI)
                    if (normalized < 0) normalized += 2 * Math.PI
                    return normalized
                  }

                  // Calculate coverage using sectorRange
                  const sectorCoverageAngle = weaponStats.sectorRange * targetSectorSize
                  const centerAngle = normalizeAngle(rangeVisualizationAngle + Math.PI / 2)

                  // Expand coverage by ±sectorRange
                  const coverageStart = centerAngle - sectorCoverageAngle
                  const coverageEnd = centerAngle + sectorCoverageAngle

                  // Find sector boundaries
                  const firstSector = Math.floor(normalizeAngle(coverageStart) / targetSectorSize)
                  const epsilon = 1e-10
                  const endSectorRaw = normalizeAngle(coverageEnd) / targetSectorSize
                  const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)
                  const lastSector =
                    fractionalPart < epsilon
                      ? Math.floor(endSectorRaw) - 1
                      : Math.floor(endSectorRaw)

                  const coverageStartAngle = firstSector * targetSectorSize - Math.PI / 2
                  const coverageEndAngle = (lastSector + 1) * targetSectorSize - Math.PI / 2

                  const targetStartX =
                    rangeWellPosition.x + targetRadius * Math.cos(coverageStartAngle)
                  const targetStartY =
                    rangeWellPosition.y + targetRadius * Math.sin(coverageStartAngle)
                  const targetEndX = rangeWellPosition.x + targetRadius * Math.cos(coverageEndAngle)
                  const targetEndY = rangeWellPosition.y + targetRadius * Math.sin(coverageEndAngle)

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
              <circle cx={rayStartX} cy={rayStartY} r={4} fill={player.color} opacity={0.8} />
              <circle cx={rayEndX} cy={rayEndY} r={4} fill={player.color} opacity={0.8} />
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
        let shipPositionForRangeCalc = player.ship

        if (isActive) {
          // Check if any weapon action of this type exists in tactical sequence
          const weaponActionType =
            weaponKey === 'laser'
              ? 'fire_laser'
              : weaponKey === 'railgun'
                ? 'fire_railgun'
                : 'fire_missiles'
          const weaponAction = pendingState.tacticalSequence.find(a => a.type === weaponActionType)
          const moveAction = pendingState.tacticalSequence.find(a => a.type === 'move')

          // If both weapon and move actions exist, check their sequence order
          if (weaponAction && moveAction && weaponAction.sequence > moveAction.sequence) {
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
          playerIndex === activePlayerIndex ? pendingFacing : undefined
        )

        return (
          <g key={`targeting-${weaponKey}`}>
            {firingSolutions.map(solution => {
              if (!solution.inRange) return null

              const otherPlayer = solution.targetPlayer
              const otherWell = gameState.gravityWells.find(w => w.id === otherPlayer.ship.wellId)
              if (!otherWell) return null

              const otherRingConfig = otherWell.rings.find(r => r.ring === otherPlayer.ship.ring)
              if (!otherRingConfig) return null

              // Get the target's gravity well position
              const targetWellPosition = getGravityWellPosition(otherPlayer.ship.wellId)

              // Draw targeting reticle
              const otherRadius = otherRingConfig.radius * scaleFactor
              const otherRotationOffset = getSectorRotationOffset(otherPlayer.ship.wellId)
              // Visual sector same as logical sector
              const otherAngle =
                ((otherPlayer.ship.sector + 0.5) / otherRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                otherRotationOffset
              const otherX = targetWellPosition.x + otherRadius * Math.cos(otherAngle)
              const otherY = targetWellPosition.y + otherRadius * Math.sin(otherAngle)

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
}
